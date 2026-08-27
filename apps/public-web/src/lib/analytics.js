// GA4 + Meta Pixel 이벤트 헬퍼 — 태그 미로드 환경(애드블록, 미설정 로컬/데모)에서는
// 조용히 no-op. 태그 본체는 index.html에 설치되어 있고(GA4 G-EMNCLZKPMS,
// Meta Pixel 27962792746720705), SPA 라우트 전환의 page_view/PageView는 양쪽 모두
// 자동 수집이라 여기서 다루지 않는다(수동 추가 시 이중 집계 — 금지).
// 전자상거래 이벤트 규격:
// https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
// https://developers.facebook.com/docs/meta-pixel/reference

const CURRENCY = "KRW";

// GA4 커스텀 파라미터 텍스트 값 상한(100자) — 초과분은 잘라 전송 실패를 예방.
const PARAM_TEXT_MAX = 100;

function clampText(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > PARAM_TEXT_MAX ? text.slice(0, PARAM_TEXT_MAX) : text;
}

function gtagEvent(eventName, params) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", eventName, params);
  } catch {
    // 계측 실패가 사용자 흐름을 깨면 안 된다 — 조용히 무시.
  }
}

function fbqEvent(eventName, params) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    window.fbq("track", eventName, params);
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

// Meta content_ids/contents — id는 GA4 item_id와 동일하게 상품 단위(productId).
// 카탈로그(다이내믹) 광고 매칭은 이 id와 카탈로그 콘텐츠 ID(retailer_id)의 일치가 전제다.
// productId 없는 라인(비회원 조회 RPC 응답 등)은 매칭이 불가능하므로 제외하고,
// 전부 없으면 키 자체를 생략한다(빈 배열·빈 문자열 id 전송 방지).
function toMetaContentParams(lines) {
  const withIds = lines.filter(
    (line) => line.productId != null && String(line.productId) !== "",
  );
  if (withIds.length === 0) return {};
  return {
    content_ids: withIds.map((line) => String(line.productId)),
    content_type: "product",
    contents: withIds.map((line) => ({
      id: String(line.productId),
      quantity: Number(line.quantity) || 1,
      item_price: Number(line.price) || 0,
    })),
  };
}

function sumLineQuantity(lines) {
  return lines.reduce((sum, line) => sum + (Number(line.quantity) || 1), 0);
}

// ── 이커머스: 노출·탐색 ─────────────────────────────────────────────────────

// 상품 목록 노출 — 홈 캐러셀(BEST/신규 입고)·스토어 그리드·비슷한 교재 추천.
// listName은 GA4 item_list_name으로 그대로 보고서에 뜬다 (한국어 유지).
function trackViewItemList(listName, lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("view_item_list", {
    ...(listName ? { item_list_name: listName } : {}),
    items: lines.map(toGaItem),
  });
}

// 목록에서 상품 클릭 — 어느 목록이 클릭을 만드는지(item_list_name) 비교용.
function trackSelectItem(listName, line) {
  if (!line) return;
  gtagEvent("select_item", {
    ...(listName ? { item_list_name: listName } : {}),
    items: [toGaItem(line)],
  });
}

// 검색 실행 — 결과 수까지 기록. GA4 향상된 측정(view_search_results, ?q= 기반)과
// 별개 이벤트라 이중 집계가 아니고, result_count는 여기서만 얻을 수 있다.
// 결과 0건이면 search_no_results를 추가 발화 — 입고 우선순위 판단용 핵심 데이터.
function trackSearch(searchTerm, resultCount) {
  const term = clampText(searchTerm);
  if (!term) return;
  const count = Number.isFinite(Number(resultCount)) ? Number(resultCount) : null;
  gtagEvent("search", {
    search_term: term,
    ...(count !== null ? { result_count: count } : {}),
  });
  if (count === 0) {
    gtagEvent("search_no_results", { search_term: term });
  }
  fbqEvent("Search", { search_string: term });
}

// ── 이커머스: 상세·장바구니 ─────────────────────────────────────────────────

// 상품 상세 조회 (상세 페이지 로드 성공 시 1회)
function trackViewItem(line) {
  if (!line) return;
  gtagEvent("view_item", {
    currency: CURRENCY,
    value: Number(line.price) || 0,
    items: [toGaItem(line)],
  });
  fbqEvent("ViewContent", {
    ...toMetaContentParams([line]),
    content_name: line.title ?? "",
    currency: CURRENCY,
    value: Number(line.price) || 0,
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
  fbqEvent("AddToCart", {
    ...toMetaContentParams(lines),
    currency: CURRENCY,
    value: sumLineValue(lines),
  });
}

// 장바구니 조회 (장바구니 페이지 로드 성공 시 1회)
function trackViewCart(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("view_cart", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    items: lines.map(toGaItem),
  });
}

// 장바구니 제거 — 수량 줄이기·그룹 삭제·선택 삭제 (실제로 지워진 라인만 전달할 것)
function trackRemoveFromCart(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("remove_from_cart", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    items: lines.map(toGaItem),
  });
}

// 찜 추가 — 모든 표면(카드·상세·복귀 재실행)이 거치는 PublicWishlistContext에서 발화.
// 컨텍스트에는 가격 정보가 없어 item_id만 전달한다(GA4 권장 이벤트에 value 필수 아님).
function trackAddToWishlist(productId) {
  if (productId == null) return;
  gtagEvent("add_to_wishlist", {
    items: [{ item_id: String(productId), quantity: 1 }],
  });
  fbqEvent("AddToWishlist", {
    content_ids: [String(productId)],
    content_type: "product",
  });
}

// 찜 해제 — GA4 표준에 없어 커스텀. 찜 이탈률(추가 대비 해제) 관찰용.
function trackRemoveFromWishlist(productId) {
  if (productId == null) return;
  gtagEvent("remove_from_wishlist", { item_id: String(productId) });
}

// ── 이커머스: 결제 여정 ─────────────────────────────────────────────────────

// 주문 페이지 진입 (주문서 1회)
function trackBeginCheckout(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("begin_checkout", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    items: lines.map(toGaItem),
  });
  fbqEvent("InitiateCheckout", {
    ...toMetaContentParams(lines),
    num_items: sumLineQuantity(lines),
    currency: CURRENCY,
    value: sumLineValue(lines),
  });
}

// 배송 정보 확정 — 주문서 제출이 검증을 통과한 시점(주소가 실제 제출됨).
// begin_checkout 대비 이탈(주소 입력 단계 포기)을 가른다.
function trackAddShippingInfo({ lines, shippingTier }) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("add_shipping_info", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    ...(shippingTier ? { shipping_tier: shippingTier } : {}),
    items: lines.map(toGaItem),
  });
}

// 결제 정보 확정 — 주문서 제출이 검증을 통과한 시점. payment_type으로 수단별 전환 비교.
// purchase와의 격차 = 결제창 이탈·승인 실패·입금 포기 구간.
function trackAddPaymentInfo({ lines, paymentType, coupon }) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent("add_payment_info", {
    currency: CURRENCY,
    value: sumLineValue(lines),
    ...(paymentType ? { payment_type: paymentType } : {}),
    ...(coupon ? { coupon: clampText(coupon) } : {}),
    items: lines.map(toGaItem),
  });
  fbqEvent("AddPaymentInfo", {
    ...toMetaContentParams(lines),
    currency: CURRENCY,
    value: sumLineValue(lines),
  });
}

// 주문 성공 — 무통장은 주문 생성 시점(입금 확인 전, OrderPage), 카드(PG)는 결제 승인
// 후 주문완료 페이지 진입 시점(OrderCompletePage, 중복 방지 가드 포함)에 호출된다.
// Meta Purchase는 value+currency 필수 규격.
function trackPurchase({ transactionId, value, shipping, items, coupon }) {
  if (!transactionId || !Array.isArray(items) || items.length === 0) return;
  gtagEvent("purchase", {
    transaction_id: String(transactionId),
    currency: CURRENCY,
    value: Number(value) || 0,
    ...(Number.isFinite(Number(shipping)) ? { shipping: Number(shipping) } : {}),
    ...(coupon ? { coupon: clampText(coupon) } : {}),
    items: items.map(toGaItem),
  });
  fbqEvent("Purchase", {
    ...toMetaContentParams(items),
    num_items: sumLineQuantity(items),
    currency: CURRENCY,
    value: Number(value) || 0,
  });
}

// 쿠폰 적용/해제 — 주문서 쿠폰 선택 모달. 쿠폰별 사용률·주문 기여 관찰용.
function trackCouponApply({ couponId, couponTitle, discountType }) {
  gtagEvent("coupon_apply", {
    ...(couponId != null ? { coupon_id: String(couponId) } : {}),
    ...(couponTitle ? { coupon_name: clampText(couponTitle) } : {}),
    ...(discountType ? { discount_type: discountType } : {}),
  });
}

function trackCouponRemove() {
  gtagEvent("coupon_remove", {});
}

// 결제 여정 오류 — stage: validation(제출 검증 실패) / create_order(주문 RPC 실패) /
// checkout_session(카드 세션 RPC 실패) / pg_open(결제창 호출 실패) / pg_widget(토스 위젯).
// begin_checkout → purchase 사이 어디서 새는지 원인별로 가른다.
function trackCheckoutError(stage, message) {
  gtagEvent("checkout_error", {
    error_stage: stage || "unknown",
    ...(clampText(message) ? { error_message: clampText(message) } : {}),
  });
}

// PG 결제 실패 복귀 (PaymentFailPage 진입) — 실패 코드 분포 관찰용.
function trackPaymentFail({ code, message }) {
  gtagEvent("payment_fail", {
    ...(code ? { error_code: clampText(code) } : {}),
    ...(clampText(message) ? { error_message: clampText(message) } : {}),
  });
}

// ── 주문 후 액션 (마이페이지) ────────────────────────────────────────────────

function trackOrderCancel(orderId) {
  gtagEvent("order_cancel", {
    ...(orderId != null ? { order_id: String(orderId) } : {}),
  });
}

function trackPurchaseConfirm(orderId) {
  gtagEvent("purchase_confirm", {
    ...(orderId != null ? { order_id: String(orderId) } : {}),
  });
}

function trackRefundRequest(orderId) {
  gtagEvent("refund_request", {
    ...(orderId != null ? { order_id: String(orderId) } : {}),
  });
}

function trackMemberWithdraw(reasonCategory) {
  gtagEvent("member_withdraw", {
    ...(reasonCategory ? { reason_category: clampText(reasonCategory) } : {}),
  });
}

// ── 프로모션 노출·클릭 ──────────────────────────────────────────────────────

// 홈 히어로 배너·팝업 배너 노출. promotion_id/creative_slot으로 배너별 성과 비교.
function trackViewPromotion({ promotionId, promotionName, creativeSlot }) {
  gtagEvent("view_promotion", {
    ...(promotionId ? { promotion_id: String(promotionId) } : {}),
    ...(promotionName ? { promotion_name: clampText(promotionName) } : {}),
    ...(creativeSlot ? { creative_slot: creativeSlot } : {}),
  });
}

function trackSelectPromotion({ promotionId, promotionName, creativeSlot }) {
  gtagEvent("select_promotion", {
    ...(promotionId ? { promotion_id: String(promotionId) } : {}),
    ...(promotionName ? { promotion_name: clampText(promotionName) } : {}),
    ...(creativeSlot ? { creative_slot: creativeSlot } : {}),
  });
}

// ── 셀러(수거 신청) 퍼널 ────────────────────────────────────────────────────

// 수거 신청 페이지 진입 (양식 노출 1회) — generate_lead와의 격차 = 작성 이탈.
function trackPickupRequestStart() {
  gtagEvent("pickup_request_start", {});
}

// 수거 신청 제출 성공 = 셀러 리드 확보. GA4 권장 generate_lead + Meta Lead.
function trackGenerateLead({ boxCount, expectedBookCount }) {
  gtagEvent("generate_lead", {
    lead_type: "pickup_request",
    ...(Number.isFinite(Number(boxCount)) ? { box_count: Number(boxCount) } : {}),
    ...(Number.isFinite(Number(expectedBookCount))
      ? { expected_book_count: Number(expectedBookCount) }
      : {}),
  });
  fbqEvent("Lead", {});
}

// 전일학원 출시 알림 신청 성공 = 이벤트 리드 확보. GA4 generate_lead + Meta Lead.
function trackJeonilLaunchAlert() {
  gtagEvent("generate_lead", { lead_type: "jeonil_launch_alert" });
  fbqEvent("Lead", {});
}

// 카카오톡 채널 친구추가 쿠폰 발급 성공 = 채널 리드 확보. GA4 generate_lead + Meta Lead.
function trackKakaoCouponClaim() {
  gtagEvent("generate_lead", { lead_type: "kakao_channel_coupon" });
  fbqEvent("Lead", {});
}

// 홈의 수거 신청 CTA 클릭 (cta_source: hero_banner / home_bottom_cta)
function trackPickupCtaClick(source) {
  gtagEvent("pickup_cta_click", { cta_source: source || "unknown" });
}

// ── 계정 ────────────────────────────────────────────────────────────────────

// 가입 완료 — 이메일: SignupPage 가입 확정 시점, OAuth: 동의 페이지 완료 시점.
function trackSignUp(method) {
  gtagEvent("sign_up", { method: method || "unknown" });
  fbqEvent("CompleteRegistration", {});
}

// 이메일 인증(OTP) 완료 — 가입 활성화 지표.
function trackEmailVerified() {
  gtagEvent("email_verify_complete", {});
}

// 로그인 완료 — GA4 권장 이벤트명 `login` (method=email/google/kakao)
function trackLogin(method) {
  gtagEvent("login", { method: method || "unknown" });
}

// 로그인 관문 노출 — 비로그인이 회원 전용 액션(담기/바로구매/찜 등)을 시도
function trackLoginGateShown(reason) {
  gtagEvent("login_gate_shown", { gate_reason: reason || "unknown" });
}

// 관문에서 고른 선택지 — kakao/google/email/guest/dismiss (2026-08-09 관문 개편 효과 측정).
// login_gate_shown 대비 각 선택 비율로 위계 개편 전후를 비교한다.
function trackLoginGateCta(cta, reason) {
  gtagEvent("login_gate_cta", {
    cta_option: cta || "unknown",
    gate_reason: reason || "unknown",
  });
}

// ── 재입고 알림 ─────────────────────────────────────────────────────────────

// 품절 상품 단위 구독/해제 (상세 페이지) — 수요 시그널.
function trackRestockSubscribe(productId, subscribed) {
  gtagEvent(subscribed ? "restock_subscribe" : "restock_unsubscribe", {
    ...(productId != null ? { item_id: String(productId) } : {}),
  });
}

// 키워드 단위 입고 알림 (검색 0건 동선) — 미보유 수요의 원문 키워드.
function trackRestockKeywordSubscribe(keyword) {
  gtagEvent("restock_keyword_subscribe", {
    ...(clampText(keyword) ? { keyword: clampText(keyword) } : {}),
  });
}

// ── 탐색 UI 조작 ────────────────────────────────────────────────────────────

// 스토어 필터 조작 — filter_group: subject/types/brands/..., filter_action: add/remove/select
function trackStoreFilter(groupKey, value, action) {
  gtagEvent("store_filter_change", {
    filter_group: groupKey || "unknown",
    ...(clampText(value) ? { filter_value: clampText(value) } : {}),
    filter_action: action || "add",
  });
}

function trackStoreSort(sortValue) {
  gtagEvent("store_sort_change", { sort_option: sortValue || "unknown" });
}

// ── 기타 인게이지먼트 ───────────────────────────────────────────────────────

function trackFaqOpen({ faqId, question, category }) {
  gtagEvent("faq_open", {
    ...(faqId != null ? { faq_id: String(faqId) } : {}),
    ...(clampText(question) ? { faq_question: clampText(question) } : {}),
    ...(clampText(category) ? { faq_category: clampText(category) } : {}),
  });
}

function trackGuestOrderLookup(found) {
  gtagEvent("guest_order_lookup", { lookup_found: found ? "yes" : "no" });
}

function trackFortuneCookieDraw() {
  gtagEvent("fortune_cookie_draw", {});
}

// 상세 이미지 확대(라이트박스) — 구매 전 상태 확인 행동 시그널.
function trackImageZoom(productId) {
  gtagEvent("product_image_zoom", {
    ...(productId != null ? { item_id: String(productId) } : {}),
  });
}

// ── 구매 여정 중간 계측 (2026-08-01 첫 주간 분석 후속) ─────────────────────
// view_item(2,620세션) → begin_checkout(39세션) 사이가 블랙박스라 추가한 3종.
// 파라미터는 표준 보고서에 자동 노출되지 않지만 BigQuery event_params로는 그대로 쌓인다.

// 구매 의도 클릭 — 담기/바로구매 버튼. 로그인 관문 "앞"이라 비로그인도 잡힌다.
function trackBuyClick(buyType, { productId, itemCount, value } = {}) {
  gtagEvent("buy_click", {
    buy_type: buyType,
    ...(productId != null ? { item_id: String(productId) } : {}),
    ...(Number.isFinite(Number(itemCount)) ? { item_count: Number(itemCount) } : {}),
    currency: CURRENCY,
    value: Number(value) || 0,
  });
}

export {
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackAddToCart,
  trackAddToWishlist,
  trackBeginCheckout,
  trackBuyClick,
  trackCheckoutError,
  trackCouponApply,
  trackCouponRemove,
  trackEmailVerified,
  trackFaqOpen,
  trackFortuneCookieDraw,
  trackGenerateLead,
  trackGuestOrderLookup,
  trackImageZoom,
  trackJeonilLaunchAlert,
  trackKakaoCouponClaim,
  trackLogin,
  trackLoginGateCta,
  trackLoginGateShown,
  trackMemberWithdraw,
  trackOrderCancel,
  trackPaymentFail,
  trackPickupCtaClick,
  trackPickupRequestStart,
  trackPurchase,
  trackPurchaseConfirm,
  trackRefundRequest,
  trackRemoveFromCart,
  trackRemoveFromWishlist,
  trackRestockKeywordSubscribe,
  trackRestockSubscribe,
  trackSearch,
  trackSelectItem,
  trackSelectPromotion,
  trackSignUp,
  trackStoreFilter,
  trackStoreSort,
  trackViewCart,
  trackViewItem,
  trackViewItemList,
  trackViewPromotion,
};
