import test from "node:test";
import assert from "node:assert/strict";
import { IlseongAdminError, createIlseongAdminClient } from "./ilseongAdminClient.js";

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });

// 앱 서버 흉내: 로그인하면 token-1, token-2 … 를 주고, live에 든 토큰만 받아 준다.
function fakeAppServer({ ttlMs = 3_600_000, now = () => 0 } = {}) {
  const state = { logins: [], calls: [], live: new Set(), n: 0 };
  const fetchImpl = async (url, init) => {
    state.calls.push({ url, init });
    if (url.endsWith("/api/auth/login")) {
      const body = JSON.parse(init.body);
      state.logins.push(body);
      if (body.credential === "bad-ticket") return json(401, { code: "INVALID_CREDENTIAL", detail: "입장권이 맞지 않거나 시간이 지났어요." });
      state.n += 1;
      const accessToken = `token-${state.n}`;
      state.live.add(accessToken);
      return json(200, {
        userId: 7,
        deviceId: 70 + state.n,
        accessToken,
        refreshToken: "unused",
        accessTokenExpiresAt: new Date(now() + ttlMs).toISOString(),
      });
    }
    const token = String(init.headers.Authorization || "").replace("Bearer ", "");
    if (!state.live.has(token)) return json(401, { code: "UNAUTHORIZED" });
    if (url.endsWith("/api/admin/overview")) return json(200, { users: 3 });
    if (url.endsWith("/api/admin/users/1/devices/2")) return new Response(null, { status: 204 });
    if (url.includes("/uploads/")) return new Response(null, { status: 204 });
    if (url.endsWith("/api/admin/users/999")) return json(404, { code: "USER_NOT_FOUND", detail: "회원을 찾을 수 없어요." });
    if (url.endsWith("/api/admin/boom")) return json(500, { detail: "NullPointerException at …" });
    return json(404, {});
  };
  return { state, fetchImpl };
}

function makeClient(overrides = {}) {
  const clock = { t: 1_000_000 };
  const server = fakeAppServer({ now: () => clock.t, ...overrides.server });
  const tickets = { n: 0 };
  const staff = { id: "staff-a" };
  const sessionStore = overrides.sessionStore ?? memoryStore();
  const deviceStore = overrides.deviceStore ?? memoryStore();
  const client = createIlseongAdminClient({
    getStaffId: async () => staff.id,
    requestTicket: overrides.requestTicket ?? (async () => {
      tickets.n += 1;
      return { ticket: `ticket-${tickets.n}`, apiBaseUrl: "https://app.test/" };
    }),
    fetchImpl: server.fetchImpl,
    sessionStore,
    deviceStore,
    now: () => clock.t,
    randomId: () => "rand",
  });
  return { client, clock, server: server.state, tickets, staff, sessionStore, deviceStore };
}

test("처음 부를 때 입장권으로 로그인하고, 그 토큰으로 앱 서버를 부른다", async () => {
  const { client, server, tickets, deviceStore } = makeClient();
  assert.deepEqual(await client.request("GET", "/api/admin/overview"), { users: 3 });

  assert.equal(tickets.n, 1);
  assert.deepEqual(server.logins, [{
    provider: "SUBOOK_STAFF",
    credential: "ticket-1",
    device: { key: "subook-admin-rand", name: "수북 관리자", platform: "WEB" },
  }]);
  // 앱 서버 주소 끝의 /는 떼고 붙인다
  assert.equal(server.calls[0].url, "https://app.test/api/auth/login");
  assert.equal(server.calls[1].url, "https://app.test/api/admin/overview");
  assert.equal(server.calls[1].init.headers.Authorization, "Bearer token-1");
  assert.equal(server.calls[1].init.body, undefined);
  // 같은 브라우저는 같은 기기 값을 쓴다
  assert.equal(deviceStore.getItem("subook.admin.ilseong.device"), "subook-admin-rand");

  // 두 번째부터는 다시 로그인하지 않는다
  await client.request("GET", "/api/admin/overview");
  assert.equal(tickets.n, 1);
  assert.equal(client.absoluteUrl("/pages/1/2?s=x"), "https://app.test/pages/1/2?s=x");
});

test("동시에 여러 요청이 와도 로그인은 한 번만 한다", async () => {
  const { client, tickets, server } = makeClient();
  await Promise.all([
    client.request("GET", "/api/admin/overview"),
    client.request("GET", "/api/admin/overview"),
    client.request("GET", "/api/admin/overview"),
  ]);
  assert.equal(tickets.n, 1);
  assert.equal(server.logins.length, 1);
});

test("토큰이 끝날 때가 되면 미리 새로 받는다", async () => {
  const { client, clock, tickets } = makeClient();
  await client.request("GET", "/api/admin/overview");
  clock.t += 3_600_000 - 61_000; // 61초 남음
  await client.request("GET", "/api/admin/overview");
  assert.equal(tickets.n, 1);
  clock.t += 2_000; // 59초 남음
  await client.request("GET", "/api/admin/overview");
  assert.equal(tickets.n, 2);
});

test("앱 서버가 401을 주면 입장권부터 다시 받아 한 번 더 보낸다", async () => {
  const { client, server, tickets } = makeClient();
  await client.request("GET", "/api/admin/overview");
  server.live.clear(); // 앱 서버가 토큰을 끊었다
  assert.deepEqual(await client.request("GET", "/api/admin/overview"), { users: 3 });
  assert.equal(tickets.n, 2);
  assert.equal(server.calls.at(-1).init.headers.Authorization, "Bearer token-2");
});

test("다시 받아도 401이면 그만둔다(되풀이하지 않는다)", async () => {
  const { client, server, tickets } = makeClient();
  const original = server.live.add.bind(server.live);
  server.live.add = () => server.live; // 어떤 토큰도 받아 주지 않는 서버
  await assert.rejects(client.request("GET", "/api/admin/overview"), (err) => err instanceof IlseongAdminError && err.status === 401);
  assert.equal(tickets.n, 2);
  server.live.add = original;
});

test("탭에 남아 있던 로그인을 이어 쓰되, 다른 직원 것이면 버린다", async () => {
  const saved = JSON.stringify({ staffId: "staff-a", baseUrl: "https://app.test", accessToken: "token-old", expiresAt: 1_000_000 + 600_000, userId: 7 });
  const same = makeClient({ sessionStore: memoryStore({ "subook.admin.ilseong.session": saved }) });
  same.server.live.add("token-old");
  await same.client.request("GET", "/api/admin/overview");
  assert.equal(same.tickets.n, 0);

  const other = makeClient({ sessionStore: memoryStore({ "subook.admin.ilseong.session": saved }) });
  other.server.live.add("token-old");
  other.staff.id = "staff-b";
  await other.client.request("GET", "/api/admin/overview");
  assert.equal(other.tickets.n, 1);
  assert.equal(JSON.parse(other.sessionStore.getItem("subook.admin.ilseong.session")).staffId, "staff-b");
});

test("수북 관리자에 로그인해 있지 않으면 앱 서버를 부르지 않는다", async () => {
  const { client, staff, server, sessionStore } = makeClient();
  await client.request("GET", "/api/admin/overview");
  staff.id = null;
  await assert.rejects(client.request("GET", "/api/admin/overview"), (err) => err.code === "NO_STAFF");
  assert.equal(sessionStore.getItem("subook.admin.ilseong.session"), null);
  assert.equal(server.calls.length, 2);
});

test("본문이 있으면 JSON으로 보내고, 204는 빈 값으로 돌려준다", async () => {
  const { client, server } = makeClient();
  assert.equal(await client.request("DELETE", "/api/admin/users/1/devices/2"), undefined);
  await client.request("POST", "/api/admin/overview", { a: 1 }).catch(() => undefined);
  const post = server.calls.at(-1);
  assert.equal(post.init.headers["Content-Type"], "application/json");
  assert.equal(post.init.body, '{"a":1}');
});

test("쪽 이미지는 JPEG 본문 그대로 PUT으로 올린다", async () => {
  const { client, server } = makeClient();
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
  await client.putJpeg("/api/admin/books/3/uploads/abc/pages/1", blob);
  const put = server.calls.at(-1);
  assert.equal(put.url, "https://app.test/api/admin/books/3/uploads/abc/pages/1");
  assert.equal(put.init.method, "PUT");
  assert.equal(put.init.headers["Content-Type"], "image/jpeg");
  assert.equal(put.init.body, blob);
});

test("오류 문구: 4xx는 앱 서버가 준 말을, 5xx와 연결 실패는 정해 둔 말을 보여 준다", async () => {
  const { client } = makeClient();
  await assert.rejects(client.request("GET", "/api/admin/users/999"),
    (err) => err.status === 404 && err.code === "USER_NOT_FOUND" && err.message === "회원을 찾을 수 없어요.");
  await assert.rejects(client.request("GET", "/api/admin/boom"),
    (err) => err.status === 500 && !err.message.includes("NullPointer"));

  const offline = createIlseongAdminClient({
    getStaffId: async () => "staff-a",
    requestTicket: async () => ({ ticket: "t", apiBaseUrl: "https://app.test" }),
    fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
  });
  await assert.rejects(offline.request("GET", "/api/admin/overview"), (err) => err.status === 0 && err.code === "NETWORK");
});

test("입장권을 받지 못하거나 앱 서버가 표를 거절하면 까닭을 그대로 올린다", async () => {
  const refused = makeClient({ requestTicket: async () => { throw new Error("앱 서버 연결 설정이 없습니다."); } });
  await assert.rejects(refused.client.request("GET", "/api/admin/overview"), /연결 설정이 없습니다/);

  const empty = makeClient({ requestTicket: async () => ({ ticket: null, apiBaseUrl: null }) });
  await assert.rejects(empty.client.request("GET", "/api/admin/overview"), (err) => err.code === "NO_TICKET");

  const bad = makeClient({ requestTicket: async () => ({ ticket: "bad-ticket", apiBaseUrl: "https://app.test" }) });
  await assert.rejects(bad.client.request("GET", "/api/admin/overview"), (err) => err.status === 401 && err.code === "INVALID_CREDENTIAL");
  // 실패한 뒤 다시 부르면 처음부터 다시 한다(실패가 굳지 않는다)
  await assert.rejects(bad.client.request("GET", "/api/admin/overview"), (err) => err.status === 401);
  assert.equal(bad.server.logins.length, 2);
});
