export const MAX_RESTOCK_KEYWORDS = 20;

export function normalizeRestockKeyword(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function validateRestockKeyword(value, keywords) {
  const normalized = normalizeRestockKeyword(value);
  if ([...normalized].length < 2 || [...normalized].length > 40) return "키워드는 2~40자로 입력해 주세요.";
  if (keywords.some((row) => normalizeRestockKeyword(row.keyword) === normalized)) return "이미 알림을 신청한 키워드예요.";
  if (keywords.length >= MAX_RESTOCK_KEYWORDS) return "키워드 알림은 최대 20개까지 등록할 수 있어요. 기존 알림을 해지한 뒤 추가해 주세요.";
  return "";
}

// 클라이언트는 shared-supabase에서 주입한다. 조회만 재시도하고 변경 요청은 중복 실행하지 않는다.
export function createRestockKeywordService(client, { timeoutMs = 12000 } = {}) {
  async function request(name, args, retry = false) {
    if (!client) return { error: { message: "서비스 연결이 준비되지 않았어요." } };
    for (let attempt = 0; attempt <= (retry ? 1 : 0); attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await client.rpc(name, args).abortSignal(controller.signal);
        if (!result.error || !retry || attempt === 1 || (result.status && result.status < 500)) return result;
      } catch {
        if (!retry || attempt === 1) return { error: { message: "연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요." } };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    async list() {
      const { data, error } = await request("list_my_restock_keywords", undefined, true);
      if (error || !Array.isArray(data)) return { keywords: [], error: "입고 알림 목록을 불러오지 못했어요. 다시 시도해 주세요." };
      return { keywords: data, error: "" };
    },
    async subscribe(keyword) {
      const { data, error } = await request("subscribe_restock_keyword", { p_keyword: keyword.trim() });
      if (error || !data?.success || data.id == null) {
        const message = error?.message ?? "";
        const knownError = message.includes("키워드는 2~40자") || message.includes("최대 20개");
        return { success: false, error: knownError ? message : "알림 신청을 완료하지 못했어요. 목록을 새로고침한 뒤 다시 시도해 주세요." };
      }
      return { success: true, id: data.id, keyword: data.keyword };
    },
    async unsubscribe(id) {
      const { data, error } = await request("unsubscribe_restock_keyword", { p_id: id });
      // 다른 탭에서 이미 해지한 경우(deleted=false)도 해지 완료 상태다.
      return error || !data?.success
        ? { success: false, error: "알림 해지를 완료하지 못했어요. 다시 시도해 주세요." }
        : { success: true };
    },
  };
}
