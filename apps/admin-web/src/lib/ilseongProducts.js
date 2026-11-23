// 「일성월심 앱」 › 상품·판매의 계산. 화면 없이 시험할 수 있게 여기에 둔다.

/** 그 앱 상품 코드를 단 수북 상품들(번호 순). */
export function storeProductsOf(storeProducts, code) {
  return (storeProducts || [])
    .filter((item) => item.app_product_code === code)
    .sort((a, b) => Number(a.product_id) - Number(b.product_id));
}

/**
 * 수북 상품 만들기 창의 판매가. 수북의 등록 규칙(_register_compute_price)과 같다:
 * 금액 할인은 정가에서 빼고, 비율 할인은 원 단위로 반올림한다. 값이 모자라면 null.
 */
export function finalPrice({ originalPrice, discountType, discountValue }) {
  const original = Number(originalPrice);
  if (!original) return null;
  if (discountType === "none" || !discountType) return original;
  const value = Number(discountValue);
  if (!value) return null;
  if (discountType === "amount") return original - value;
  if (discountType === "rate") return Math.round((original * (100 - value)) / 100);
  return null;
}

/** 수북 상품 만들기 창에서 고쳐야 할 것. 없으면 null. */
export function storeProductProblem(form) {
  if (!String(form.title || "").trim()) return "상품 이름을 넣어 주세요.";
  const original = Number(form.originalPrice);
  if (!original) return "정가를 넣어 주세요.";
  if (form.discountType === "amount") {
    const value = Number(form.discountValue);
    if (!value) return "할인 금액을 넣어 주세요.";
    if (value >= original) return "할인 금액이 정가보다 작아야 해요.";
  }
  if (form.discountType === "rate") {
    const value = Number(form.discountValue);
    if (!value || value >= 100) return "할인율은 1–99 사이로 넣어 주세요.";
  }
  const quantity = Number(form.quantity);
  if (!quantity) return "재고 수량을 넣어 주세요.";
  if (quantity > 5000) return "재고 수량은 한 번에 5000까지 만들 수 있어요.";
  return null;
}
