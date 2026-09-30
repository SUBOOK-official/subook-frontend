// 기존 상품 수정 RPC는 p_option 생략을 '옵션 비우기'로 처리한다.
// 검색 결과에는 마스터 option이 없으므로 저장 직전에 현재 값을 읽어 보존한다.
export async function updateAdminProductTitle(client, productId, title) {
  const nextTitle = String(title ?? "").trim();
  if (!nextTitle) throw new Error("교재명을 입력하세요.");
  if (!client || !productId) throw new Error("교재 정보를 확인한 뒤 다시 시도하세요.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let saving = false;
  try {
    let product;
    // 일시적인 조회 실패만 한 번 재시도한다. 쓰기는 응답 유실 시 중복 실행하지 않는다.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error, status } = await client
        .from("products")
        .select("id,option")
        .eq("id", productId)
        .single()
        .abortSignal(controller.signal);
      if (!error) {
        product = data;
        break;
      }
      if (attempt === 0 && !controller.signal.aborted && (status === 0 || status >= 500)) continue;
      throw error;
    }
    if (!product) throw new Error("교재를 찾을 수 없습니다. 다시 검색해 주세요.");

    saving = true;
    const { data, error } = await client.rpc("admin_update_product_master", {
      p_product_id: productId,
      p_title: nextTitle,
      p_option: product.option ?? null,
    }).abortSignal(controller.signal);
    if (error) throw error;
    if (!data?.success) throw new Error("교재명 저장을 확인하지 못했습니다. 다시 검색해 확인해 주세요.");
    return nextTitle;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(saving
        ? "저장 응답이 늦어지고 있습니다. 다시 검색해 교재명을 확인한 뒤 재시도하세요."
        : "교재 정보 조회가 늦어지고 있습니다. 다시 시도하세요.");
    }
    throw new Error(error?.message || "교재명을 저장하지 못했습니다. 다시 시도하세요.");
  } finally {
    clearTimeout(timer);
  }
}
