// 표지 스캔 인식 클라이언트 — /api/admin/cover-scan 서버리스 호출.
// 이미지 전처리(리사이즈·압축)는 studioClient의 prepareStudioImagePayload를 그대로 재사용한다.

export const COVER_SCAN_TIMEOUT_MS = 90_000;

export async function requestCoverScan(accessToken, payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), COVER_SCAN_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("/api/admin/cover-scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("표지 인식 요청이 시간을 초과했습니다. 다시 시도해주세요.");
    }
    throw new Error("표지 인식 서버에 연결하지 못했습니다.");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `표지 인식에 실패했습니다 (HTTP ${response.status}).`);
  }
  return data;
}
