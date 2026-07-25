// GA4 이벤트 헬퍼 — gtag 미로드 환경(애드블록, GA 미설정 로컬/데모)에서는 조용히 no-op.
// 태그 본체는 index.html에 설치되어 있고(측정 ID G-EMNCLZKPMS), SPA 라우트 전환의
// page_view는 GA4 향상된 측정(브라우저 방문 기록 이벤트)이 자동 수집한다.
// 전자상거래 이벤트 규격:
// https://developers.google.com/analytics/devguides/collection/ga4/ecommerce

const CURRENCY = "KRW";

function gtagEvent(eventName, params) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", eventName, params);
  } catch {
    // 계측 실패가 사용자 흐름을 깨면 안 된다 — 조용히 무시.
  }
}

// 내부 라인아이템({ productId, title, brand?, subject?, optionLabel?, conditionGrade?,
// price, quantity })을 GA4 items 항목으로 변환. item_id는 책(권) 단위가 아니라
// 상품 단위(productId)로 잡아 상품별 성과가 집계되게 한다.
function toGaItem(line) {
  const optionParts = [line.optionLabel, line.conditionGrade].filter(Boolean);
  return {
    item_id: String(line.productId ?? ""),
    item_name: line.title ?? "",
    ...(line.brand ? { item_brand: line.brand } : {}),
    ...(line.subject ? { item_category: line.subject } : {}),
    ...(optionParts.length > 0 ? { item_variant: optionParts.join(" · ") } : {}),
    price: Number(line.price) || 0,
    quantity: Number(line.quantity) || 1,
  };
}

function sumLineValue(lines) {
  return lines.reduce(
    (sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 1),
    0,
  );
}

// 상품 상세 조회 (상세 페이지 로드 성공 시 1회)
function trackViewItem(line) {
  if (!line) return;
  gtagEvent("view_item", {
    currency: CURRENCY,
    value: Number(line.price) || 0,
    items: [toGaItem(line)],
  });
}

// 장바구니 담기 (실제로 담기에 성공한 라인만 전달할 것)
function trackAddToCart(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("add_to_cart", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    items: lines.map(toGaItem),
  });
}

// 주문 페이지 진입 (주문서 1회)
function trackBeginCheckout(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("begin_checkout", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    items: lines.map(toGaItem),
  });
}

// 주문 생성 성공 — ⚠ 무통장입금 기준 "주문 생성(입금 확인 전)" 시점이라 매출 확정과는
// 다르다. PG(토스) 활성화 시에는 결제 승인 성공 지점에 별도 연결이 필요.
function trackPurchase({ transactionId, value, shipping, items }) {
  if (!transactionId || !Array.isArray(items) || items.length === 0) return;
  gtagEvent("purchase", {
    transaction_id: String(transactionId),
    currency: CURRENCY,
    value: Number(value) || 0,
    ...(Number.isFinite(Number(shipping)) ? { shipping: Number(shipping) } : {}),
    items: items.map(toGaItem),
  });
}

export { trackAddToCart, trackBeginCheckout, trackPurchase, trackViewItem };
