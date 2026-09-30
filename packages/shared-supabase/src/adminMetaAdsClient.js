import { supabase } from "./adminSupabaseClient";

export async function metaAdsRequest(query = {}, body, signal) {
  if (!supabase) throw new Error("관리자 연결을 확인해 주세요.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("다시 로그인해 주세요.");
  let response;
  try {
    response = await fetch(
      `/api/admin/meta-ads?${new URLSearchParams(query)}`,
      {
        method: body ? "POST" : "GET",
        signal:
          signal ||
          AbortSignal.timeout(body?.action === "execute" ? 65000 : 50000),
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  } catch (error) {
    if (body?.action === "execute")
      throw new Error(
        "응답을 확인하지 못했습니다. 다시 반영하지 말고 변경 이력과 현재 광고 상태를 확인해 주세요.",
      );
    if (signal?.aborted) throw error;
    throw new Error("연결이 지연되고 있습니다. 잠시 후 다시 조회해 주세요.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw Object.assign(
      new Error(
        result?.error ||
          (body?.action === "execute"
            ? "결과를 확인하지 못했습니다. 다시 반영하지 말고 변경 이력을 확인해 주세요."
            : "Meta 광고 정보를 불러오지 못했습니다."),
      ),
      {
        status: response.status,
        operationId: result?.operationId,
        state: result?.state,
      },
    );
  return result;
}
export async function metaAdsChoices(query, signal) {
  const rows = [];
  let after;
  for (let index = 0; index < 20; index++) {
    const result = await metaAdsRequest(
      { ...query, ...(after ? { after } : {}) },
      null,
      signal,
    );
    rows.push(...result.rows);
    if (!result.after) return rows;
    if (result.after === after) throw new Error("목록을 다시 조회해 주세요.");
    after = result.after;
  }
  throw new Error(
    "항목이 1,000개를 넘습니다. 사용하지 않는 광고를 보관한 뒤 다시 조회해 주세요.",
  );
}
