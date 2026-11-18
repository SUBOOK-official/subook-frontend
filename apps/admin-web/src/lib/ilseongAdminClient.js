// 일성월심 앱 서버의 관리 API(/api/admin/**)를 수북 관리자 화면에서 직접 부르는 클라이언트.
//
// 로그인은 수북 관리자 로그인 하나로 끝낸다:
//   1) 수북 관리자 API(ilseong-app-codes, action: admin_ticket)가 "이 사람은 수북 관리자 직원"임을 확인하고
//      앱 서버에서 1회용 입장권(1분)을 받아 준다. 앱 서버 주소도 함께 준다.
//   2) 이 화면이 그 표로 앱 서버에 로그인한다(provider: SUBOOK_STAFF) → 1시간짜리 토큰.
//   3) 토큰이 끝나거나 앱 서버가 401을 주면 1)부터 다시 한다. 직원에게는 로그인 유지 토큰이 없어서,
//      수북에서 관리자 권한을 잃은 사람은 길어도 1시간 뒤에는 들어오지 못한다.
// 앱 서버 문서: ilseong-app docs/adr/0034(입장권), 0037(화면을 수북 관리자로 옮김)
//
// 이 파일은 브라우저·Supabase에 묶이지 않게 만들었다(테스트에서 가짜 fetch·저장소를 넣는다).
// 실제 연결은 ilseongAdmin.js가 한다.

export class IlseongAdminError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "IlseongAdminError";
    this.status = status;
    this.code = code;
  }
}

const SESSION_KEY = "subook.admin.ilseong.session";
const DEVICE_KEY = "subook.admin.ilseong.device";
// 토큰이 끝나기 직전에 보낸 요청이 가는 길에 끝나지 않게, 이만큼 남았을 때부터 새로 받는다
const EXPIRY_MARGIN_MS = 60_000;

const NETWORK_MESSAGE = "앱 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요.";

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막힌 브라우저에서는 이 화면을 연 동안만 기억한다
  }
}

async function problemOf(response) {
  let code;
  let message = response.status >= 500 ? "앱 서버에 문제가 생겼어요. 잠시 뒤 다시 해 주세요." : "요청을 처리하지 못했어요.";
  try {
    const body = await response.json();
    code = body?.code;
    // 앱 서버가 사람이 읽을 문구를 detail에 담아 준다(5xx는 안쪽 사정이라 보여 주지 않는다)
    if (body?.detail && response.status < 500) message = body.detail;
  } catch {
    // 본문이 JSON이 아니면 기본 문구
  }
  if (response.status === 403) message = "앱 서버가 이 계정을 관리자로 받아 주지 않았어요.";
  return new IlseongAdminError(response.status, code, message);
}

/**
 * @param {object} deps
 * @param {() => Promise<string|null>} deps.getStaffId        지금 수북 관리자에 로그인한 직원(없으면 null)
 * @param {() => Promise<{ticket: string, apiBaseUrl: string}>} deps.requestTicket  수북 관리자 API에서 입장권 받기
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {Storage|null} [deps.sessionStore]  토큰을 두는 곳(탭을 닫으면 지워지는 저장소)
 * @param {Storage|null} [deps.deviceStore]   이 브라우저를 가리키는 값을 두는 곳
 * @param {() => number} [deps.now]
 * @param {() => string} [deps.randomId]
 */
export function createIlseongAdminClient({
  getStaffId,
  requestTicket,
  fetchImpl = globalThis.fetch,
  sessionStore = null,
  deviceStore = null,
  now = () => Date.now(),
  randomId = () => globalThis.crypto.randomUUID(),
}) {
  let current = readJson(sessionStore, SESSION_KEY);
  let signingIn = null;

  const setSession = (next) => {
    current = next;
    writeJson(sessionStore, SESSION_KEY, next);
  };

  /** 앱 서버는 브라우저 하나를 기기 하나로 센다. 같은 브라우저면 같은 값을 쓴다. */
  const deviceKey = () => {
    let key = null;
    try {
      key = deviceStore?.getItem(DEVICE_KEY) || null;
    } catch {
      key = null;
    }
    if (!key) {
      key = `subook-admin-${randomId()}`;
      try {
        deviceStore?.setItem(DEVICE_KEY, key);
      } catch {
        // 저장이 막혀 있으면 매번 새 값을 쓴다(직원은 기기 수에 막히지 않는다)
      }
    }
    return key;
  };

  const send = async (url, init) => {
    try {
      return await fetchImpl(url, init);
    } catch {
      throw new IlseongAdminError(0, "NETWORK", NETWORK_MESSAGE);
    }
  };

  const usable = (session, staffId) =>
    Boolean(session && session.staffId === staffId && session.accessToken && session.expiresAt - EXPIRY_MARGIN_MS > now());

  const signIn = async (staffId) => {
    const { ticket, apiBaseUrl } = await requestTicket();
    if (!ticket || !apiBaseUrl) {
      throw new IlseongAdminError(0, "NO_TICKET", "앱 서버에 로그인할 정보를 받지 못했어요. 화면을 새로 고쳐 주세요.");
    }
    const baseUrl = String(apiBaseUrl).replace(/\/+$/, "");
    const response = await send(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "SUBOOK_STAFF",
        credential: ticket,
        device: { key: deviceKey(), name: "수북 관리자", platform: "WEB" },
      }),
    });
    if (!response.ok) throw await problemOf(response);
    const tokens = await response.json();
    const expiresAt = Date.parse(tokens.accessTokenExpiresAt);
    const session = {
      staffId,
      baseUrl,
      accessToken: tokens.accessToken,
      // 끝나는 때를 읽지 못하면 10분만 믿는다(끝났으면 어차피 401로 다시 받는다)
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : now() + 10 * 60_000,
      userId: tokens.userId,
    };
    setSession(session);
    return session;
  };

  /** 쓸 수 있는 로그인. 없거나 끝났으면 새로 받는다(동시에 여러 요청이 와도 한 번만). */
  const ensureSession = async ({ fresh = false } = {}) => {
    const staffId = await getStaffId();
    if (!staffId) {
      setSession(null);
      throw new IlseongAdminError(401, "NO_STAFF", "수북 관리자에 다시 로그인해 주세요.");
    }
    if (!fresh && usable(current, staffId)) return current;
    if (!signingIn) {
      signingIn = signIn(staffId).finally(() => {
        signingIn = null;
      });
    }
    const session = await signingIn;
    // 받는 사이에 다른 직원으로 바뀌었으면 쓰지 않는다
    if (session.staffId !== staffId) return ensureSession({ fresh: true });
    return session;
  };

  const authorized = async (build) => {
    let session = await ensureSession();
    let response = await send(...build(session));
    if (response.status === 401) {
      // 토큰이 끝났거나 앱 서버가 끊었다: 입장권부터 다시 받아 한 번만 더 보낸다
      setSession(null);
      session = await ensureSession({ fresh: true });
      response = await send(...build(session));
    }
    if (!response.ok) throw await problemOf(response);
    return response;
  };

  return {
    /** JSON을 주고받는 요청. 204면 undefined. */
    async request(method, path, body) {
      const response = await authorized((session) => [
        `${session.baseUrl}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      ]);
      if (response.status === 204) return undefined;
      return response.json();
    },

    /** 쪽 이미지 하나를 올린다(JPEG 본문 그대로). */
    async putJpeg(path, blob) {
      await authorized((session) => [
        `${session.baseUrl}${path}`,
        { method: "PUT", headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "image/jpeg" }, body: blob },
      ]);
    },

    /** 앱 서버가 준 경로(/pages/… 서명 주소)를 브라우저가 열 수 있는 전체 주소로. 로그인 전이면 null. */
    absoluteUrl(path) {
      return current?.baseUrl ? `${current.baseUrl}${path}` : null;
    },

    /** 수북 관리자에서 로그아웃했을 때 부른다. */
    clear() {
      setSession(null);
    },
  };
}
