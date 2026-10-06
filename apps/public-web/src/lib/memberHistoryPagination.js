// 서버가 요청 개수보다 작게 제한하더라도 빈 페이지까지 조회한다.
// 중간 실패나 반복 응답을 완전한 내역으로 표시하지 않는다.
export async function fetchMemberHistoryPages(client, rpcName, { selectRows = (data) => data } = {}) {
  const rows = [];
  const seenIds = new Set();
  let firstData;
  let offset = 0;
  try {
    for (let page = 0; page < 100; page += 1) {
      const { data, error } = await client.rpc(rpcName, { p_limit: 100, p_offset: offset });
      if (error) return { rows: [], data: null, error };
      if (page === 0) firstData = data;
      const batch = selectRows(data);
      if (!Array.isArray(batch)) throw new Error("내역 응답 형식을 확인할 수 없습니다.");
      if (!batch.length) return { rows, data: firstData, error: null };
      let added = 0;
      for (const row of batch) {
        if (row?.id == null) throw new Error("내역 식별자가 없습니다.");
        const id = String(row.id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        rows.push(row);
        added += 1;
      }
      if (!added) throw new Error("내역 조회가 반복되었습니다. 다시 시도해주세요.");
      offset += batch.length;
    }
    throw new Error("내역 조회 한도를 초과했습니다. 고객센터에 문의해주세요.");
  } catch (error) {
    return { rows: [], data: null, error };
  }
}
