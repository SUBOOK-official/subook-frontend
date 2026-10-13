// 재발송은 재고 차감과 별도이므로 판매 재고가 없는 과거 옵션도 조회한다.
export async function searchReshipmentProducts(client, query) {
  const search = String(query ?? '').trim();
  if (!search) return [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error, status } = await client.rpc('admin_search_products_for_register', {
        p_search: search, p_limit: 20, p_offset: 0,
      }).abortSignal(AbortSignal.timeout(12_000));
      if (error) {
        if (status === 401 || status === 403 || error.code === '42501') {
          throw Object.assign(new Error('교재 조회 권한을 확인해 주세요.'), { noRetry: true });
        }
        throw error;
      }
      if (!Array.isArray(data)) throw new Error('교재 검색 결과를 확인하지 못했습니다.');
      return data;
    } catch (error) {
      if (error.noRetry || attempt === 1) {
        throw new Error(error.noRetry ? error.message : '교재를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요.');
      }
    }
  }
}
