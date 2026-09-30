// 조회는 timeout과 한 번의 재시도를 적용한다. 지급·계좌 저장에는 이 재시도를 사용하지 않는다.
async function requestPage(client, params, isCurrent) {
  for (let attempt = 0; attempt < 2 && isCurrent(); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await client.rpc("list_admin_settlements", params).abortSignal(controller.signal);
      if (result.error) throw result.error;
      return result;
    } catch (error) {
      if (attempt === 1 || /^(42501|PGRST30)/.test(error?.code ?? "")) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return {};
}

// list_admin_settlements의 최대 페이지 크기는 500이다. 셀러 합계는 모든 페이지를 받은 뒤 표시한다.
export async function fetchAdminSettlementRows(client, statuses, isCurrent = () => true) {
  const rows = [];
  let totalCount = null;
  while (isCurrent()) {
    const { data } = await requestPage(client, {
      p_statuses: statuses, p_limit: 500, p_offset: rows.length,
    }, isCurrent);
    if (!isCurrent()) return null;
    if (!Array.isArray(data?.rows) || !Number.isFinite(Number(data?.total_count))) {
      throw new Error("정산 목록 응답을 확인할 수 없습니다. 새로고침해 주세요.");
    }
    if (totalCount !== null && totalCount !== Number(data.total_count)) {
      throw new Error("조회 중 정산 내역이 변경됐습니다. 새로고침해 주세요.");
    }
    totalCount = Number(data.total_count);
    rows.push(...data.rows);
    if (rows.length >= totalCount) {
      if (rows.length !== totalCount || new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new Error("정산 목록이 변경됐습니다. 새로고침해 주세요.");
      }
      return rows;
    }
    if (!data.rows.length) throw new Error("정산 목록 일부를 불러오지 못했습니다. 새로고침해 주세요.");
  }
  return null;
}
