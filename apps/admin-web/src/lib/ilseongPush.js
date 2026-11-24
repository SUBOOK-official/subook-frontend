// 「일성월심 앱」 › 알림 보내기 화면의 계산과 문구. 화면 없이 시험할 수 있게 여기에 둔다.
//
// 앱 서버가 하는 일: GET /api/admin/push(보낼 수 있는지, 알림을 받을 수 있는 기기 수, 최근에 보낸 것),
// POST /api/admin/push(보내기). 글자 수 한도는 앱 서버와 같다. 앱 서버도 앞뒤 공백을 떼고 센다.

export const PUSH_TITLE_MAX = 40;
export const PUSH_BODY_MAX = 200;

function countOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const devicesText = (count) => `${count.toLocaleString("ko-KR")}대`;

/** 보내기 전에 고쳐야 할 것. 없으면 null. */
export function pushProblem({ title, body }) {
  const titleText = String(title ?? "").trim();
  const bodyText = String(body ?? "").trim();
  if (!titleText) return "제목을 넣어 주세요.";
  if (titleText.length > PUSH_TITLE_MAX) return `제목은 ${PUSH_TITLE_MAX}자까지 넣을 수 있어요.`;
  if (!bodyText) return "내용을 넣어 주세요.";
  if (bodyText.length > PUSH_BODY_MAX) return `내용은 ${PUSH_BODY_MAX}자까지 넣을 수 있어요.`;
  return null;
}

/** 앱 서버에 보낼 본문. seriesId가 없으면 모든 학생에게 보낸다. */
export function pushBody({ title, body, seriesId }) {
  const id = Number(seriesId);
  return {
    title: String(title ?? "").trim(),
    body: String(body ?? "").trim(),
    seriesId: Number.isInteger(id) && id > 0 ? id : null,
  };
}

/** 받는 학생을 한 줄로(고르는 칸, 보내기 전 확인 창). 학습지 이름이 없으면 모든 학생. */
export function pushAudience(seriesName) {
  const name = String(seriesName ?? "").trim();
  return name ? `${name} 교재를 등록한 학생` : "모든 학생";
}

/** 최근에 보낸 알림 한 줄의 받는 학생: "모든 학생" 또는 학습지 이름. 그 뒤에 지운 학습지는 이름이 없을 수 있다. */
export function pushTargetLabel(row, seriesList) {
  if (row?.seriesId === null || row?.seriesId === undefined) return "모든 학생";
  return row.seriesName || (seriesList ?? []).find((series) => series.id === row.seriesId)?.name || "지운 학습지";
}

/** "알림을 받을 수 있는 기기:" 뒤에 붙는 말. 안드로이드는 한 대라도 있을 때만 말한다. */
export function pushDevicesLabel(devices) {
  const ios = countOf(devices?.ios);
  const android = countOf(devices?.android);
  const parts = [`아이폰·아이패드 ${devicesText(ios)}`];
  if (android > 0) parts.push(`안드로이드 ${devicesText(android)}`);
  return parts.join(", ");
}

/** 보내기 전에 한 번 더 묻는 글. 누구에게 가는지, 바로 간다는 것, 되돌릴 수 없다는 것을 적는다. */
export function pushConfirmMessage({ audience, title, body }) {
  return [
    `받는 학생: ${audience}`,
    "",
    `제목: ${String(title ?? "").trim()}`,
    `내용: ${String(body ?? "").trim()}`,
    "",
    "[보내기]를 누르면 바로 가요. 한번 보낸 알림은 되돌릴 수 없어요.",
  ].join("\n");
}

/** 보낸 뒤 아래쪽에 잠깐 뜨는 한 줄. result = 앱 서버의 답 { sent, failed, skipped }. */
export function pushResultMessage(result) {
  const sent = countOf(result?.sent);
  const failed = countOf(result?.failed);
  const skipped = countOf(result?.skipped);
  if (sent + failed + skipped === 0) return "알림을 받을 수 있는 기기가 없어서 보내지 못했어요";
  const parts = [`${devicesText(sent)}에 보냈어요`];
  if (failed > 0) parts.push(`${devicesText(failed)}는 보내지 못했어요`);
  // 안드로이드 기기에는 아직 보낼 수 없다(앱 서버가 건너뛴 수로 알려 준다)
  if (skipped > 0) parts.push(`안드로이드 ${devicesText(skipped)}에는 아직 보낼 수 없어요`);
  return parts.join(" · ");
}
