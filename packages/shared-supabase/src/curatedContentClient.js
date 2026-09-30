// 읽기는 한 번 재시도하며, 저장 결과가 불확실한 쓰기는 자동 재시도하지 않는다.
export async function requestCuratedContent(run, { attempts = 2, timeout = 10000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timer;
    try {
      const result = await Promise.race([
        run(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("요청 시간이 초과되었습니다. 다시 시도해 주세요."));
          }, timeout);
        }),
      ]);
      if (result.error) throw result.error;
      return result.data;
    } catch (error) {
      lastError = error;
      if (/^(23|42501|PGRST20)/.test(error.code ?? "")) break;
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export function requireCuratedClient(client) {
  if (!client) throw new Error("서비스 연결을 확인해 주세요.");
  return client;
}

export async function saveCuratedContent(client, table, key, payload, updatedAt) {
  requireCuratedClient(client);
  const saved = await requestCuratedContent((signal) => {
    const query = updatedAt
      ? client.from(table).update(payload).eq(key, payload[key]).eq("updated_at", updatedAt)
      : client.from(table).insert(payload);
    return query.select().maybeSingle().abortSignal(signal);
  }, { attempts: 1 });
  if (!saved) throw new Error("다른 관리자가 변경했거나 삭제한 항목입니다. 목록을 새로고침해 주세요.");
  return saved;
}

export function listPublicRecommendationBanners(client) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.rpc("get_public_recommendation_banners", { p_limit: 8 }).abortSignal(signal));
}

export function getPublicThemePage(client, themeId, { limit = 24, offset = 0 } = {}) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.rpc("get_public_theme_page", {
    p_theme_id: themeId, p_limit: limit, p_offset: offset,
  }).abortSignal(signal));
}

export function getCheckoutBookPricing(client, bookIds) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.rpc("get_books_pricing_for_order", { p_book_ids: bookIds.map(Number) }).abortSignal(signal));
}

export function searchCuratedProducts(client, search = "", offset = 0, limit = 30) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.rpc("admin_list_curated_products", {
    p_search: search.trim(), p_offset: offset, p_limit: limit,
  }).abortSignal(signal));
}

export function getCuratedProductDetails(client, ids) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.from("products").select("id,title,cover_image_url,status,is_listed")
    .in("id", ids).abortSignal(signal));
}

export function listPublicHeroProducts(client) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.rpc("get_public_hero_products").abortSignal(signal));
}
