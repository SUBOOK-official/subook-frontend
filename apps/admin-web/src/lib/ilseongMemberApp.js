// 수북 회원 상세의 「일성월심 앱」 칸이 무엇을 보여 줄지 정한다(화면과 떼어 시험할 수 있게 여기에 둔다).
//
// 두 곳에서 읽은 것을 합친다:
//   login  수북 DB의 get_admin_member_login_state — 이 회원이 수북 계정으로 앱에 로그인할 수 있는 상태인가
//          { account_status: active|blocked|withdrawal_pending|withdrawn|missing,
//            identity_enabled, identity_status: verified|unverified|merged, merged_into }
//   app    앱 서버의 GET /api/admin/subook-members/{수북 회원 UUID} — 앱 계정, 가진 교재, 미리 등록해 둔 것
//          { user, books, ownsAll, waiting, grants }
// 앱 서버는 로그인 때 "정상 회원 + 휴대폰 인증 완료"만 받는다(앱 저장소 docs/adr/0035, 0038).

const PHONE_NOTICE =
  "수북 휴대폰 인증을 아직 마치지 않은 회원이에요. 인증을 마쳐야 앱에 로그인할 수 있어요. " +
  "인증한 번호가 이미 다른 수북 계정에 있으면 그 계정으로 로그인하게 되니, 그때는 그 계정에 등록해 주세요.";

const UNKNOWN_NOTICE = "이 회원이 앱에 로그인할 수 있는 상태인지(휴대폰 인증·차단 여부)는 확인하지 못했어요.";

/**
 * 이 회원이 앱에 로그인할 수 없는 까닭. 로그인할 수 있으면(또는 아직 모르면) null.
 * @returns {{ text: string, mergedInto: string|null } | null}
 */
export function memberLoginBlock(login) {
  if (!login) return null;
  const status = login.account_status;
  if (status === "withdrawn" || status === "withdrawal_pending") {
    return { text: "탈퇴했거나 탈퇴 처리 중인 회원이라 앱에 로그인할 수 없어요.", mergedInto: null };
  }
  if (status === "blocked") {
    return { text: "차단한 회원이라 앱에 로그인할 수 없어요. 차단을 해제한 뒤에 등록해 주세요.", mergedInto: null };
  }
  if (status === "missing") {
    return { text: "수북 회원 가입을 마치지 않은 계정이라 앱에 로그인할 수 없어요.", mergedInto: null };
  }
  if (login.identity_status === "merged") {
    return {
      text: "다른 수북 계정으로 합쳐진 회원이에요. 이 계정으로는 앱에 로그인할 수 없으니, 합친 계정에 등록해 주세요.",
      mergedInto: login.merged_into ?? null,
    };
  }
  return null;
}

/**
 * 칸에 낼 버튼과 안내.
 *   action  "pregrant" 미리 등록(아직 앱에 로그인하지 않은 회원) · "grant" 바로 등록(이미 앱을 쓰는 회원)
 *           · "cancel" 미리 등록 취소 · null 버튼 없음
 *   block   버튼을 내지 않는 까닭(앱에 로그인할 수 없는 회원). 미리 등록해 둔 것이 있으면 취소는 할 수 있다
 *   notice  등록은 할 수 있지만 알아 둘 것
 * @param login      get_admin_member_login_state의 답. 아직 읽는 중이면 undefined, 읽지 못했으면 null
 * @param app        앱 서버의 답(없으면 버튼을 내지 않는다)
 */
export function memberAppPanel(login, app) {
  const block = memberLoginBlock(login);
  if (!app) return { action: null, block, notice: null };
  if (app.waiting) return { action: "cancel", block, notice: block ? null : phoneNotice(login) };
  if (app.ownsAll || block) return { action: null, block: app.ownsAll ? null : block, notice: null };
  if (app.user) return { action: "grant", block: null, notice: null };
  return { action: "pregrant", block: null, notice: login === null ? UNKNOWN_NOTICE : phoneNotice(login) };
}

function phoneNotice(login) {
  return login && login.identity_enabled && login.identity_status === "unverified" ? PHONE_NOTICE : null;
}

const GRANT_STATES = {
  WAITING: { label: "로그인을 기다리는 중", tone: "blue" },
  REGISTERED: { label: "교재 등록됨", tone: "green" },
  REVOKED: { label: "등록했다가 거둠", tone: "grey" },
  CANCELLED: { label: "취소함", tone: "grey" },
};

/** 등록 기록 한 줄의 상태 표시. tone은 IlseongUi의 Badge 색. */
export function grantState(state) {
  return GRANT_STATES[state] ?? { label: state, tone: "grey" };
}

/** 등록한 사람. 화면이 생기기 전(2026-11-18)에 개발자가 스크립트로 등록한 것은 이름이 없다. */
export function grantCreator(grant) {
  return grant?.createdByName || "개발자(화면이 생기기 전)";
}
