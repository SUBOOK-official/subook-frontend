// GA4 + Meta Pixel 이벤트 헬퍼 — 태그 미로드 환경(애드블록, 미설정 로컬/데모)에서는
// 조용히 no-op. 태그 본체는 index.html에 설치되어 있고(GA4 G-EMNCLZKPMS,
// Meta Pixel 27962792746720705), SPA 라우트 전환의 page_view/PageView는 양쪽 모두
// 자동 수집이라 여기서 다루지 않는다(수동 추가 시 이중 집계 — 금지).
// 향상된 측정(자동 수집)이 켜져 있어 scroll(90%)·외부 링크 click·form_start/form_submit·
// view_search_results(?q=)도 자동이다 — 같은 의미의 수동 이벤트를 만들지 말 것.
// 전자상거래 이벤트 규격:
// https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
// https://developers.facebook.com/docs/meta-pixel/reference
//
// ── 파라미터 규칙 (2026-09-03 전면 확장) ──────────────────────────────────
// - 이벤트명 ≤40자·snake_case, 파라미터명 ≤40자, 텍스트 값 ≤100자(자동 클램프),
//   이벤트당 파라미터 ≤25개. camelCase 키는 자동으로 snake_case로 변환된다.
// - PII 금지: 이메일·전화·이름·주소·우편번호·계좌번호·후기 본문·쿠폰 코드·자유 메모.
//   대신 boolean/개수/열거값을 보낸다.
// - 공용 파라미터 어휘(맞춤 측정기준 슬롯 절약을 위해 새 이름 대신 재사용):
//   ui_surface(어디서: hero/sticky_bar/card/header_desktop/mobile_drawer/footer_link…)
//   ui_action(select/deselect/open/close/increase/decrease…) content_type/content_id
//   item_id item_count value result(ok/fail) error_reason(짧은 열거) error_message
//   form_name field_name step_index step_name state_area tab_area tab_name dialog_name
//   close_method(backdrop/close_button/escape/swipe) nav_method(arrow/dot/swipe/page)
//   direction(prev/next) list_name(상품 목록은 item_list_name) filter_value result_count
//   checkout_type(guest/member) payment_type option_label promotion_id creative_slot

const CURRENCY = "KRW";

// GA4 커스텀 파라미터 텍스트 값 상한(100자) — 초과분은 잘라 전송 실패를 예방.
const PARAM_TEXT_MAX = 100;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const PARAM_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

function clampText(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > PARAM_TEXT_MAX ? text.slice(0, PARAM_TEXT_MAX) : text;
}

function toSnakeCase(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

// 파라미터 정제 — null/undefined/빈 문자열 제거, 문자열 100자 클램프, 키 snake_case 통일,
// 숫자(유한값)·불리언·배열(items)은 통과, 그 외 객체는 GA4 파라미터로 부적합이라 제외.
function sanitizeParams(params) {
  if (!params || typeof params !== "object") return {};
  const out = {};
  for (const [rawKey, raw] of Object.entries(params)) {
    const key = toSnakeCase(rawKey);
    if (!PARAM_NAME_PATTERN.test(key)) continue;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string") {
      const text = clampText(raw);
      if (text !== undefined) out[key] = text;
      continue;
    }
    if (typeof raw === "number") {
      if (Number.isFinite(raw)) out[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      out[key] = raw;
      continue;
    }
    if (Array.isArray(raw)) {
      if (raw.length > 0) out[key] = raw;
    }
  }
  return out;
}

function gtagEvent(eventName, params) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", eventName, sanitizeParams(params));
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

// 추가 파라미터 병합 — 각 track* 함수의 마지막 인자 `extra`(선택)를 표준 파라미터 뒤에
// 얹는다. 표준 키와 겹치면 extra가 이긴다(호출부가 의도적으로 덮어쓸 때만).
function withExtra(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  return { ...base, ...extra };
}

// 일반 커스텀 이벤트 — 이름 규칙(snake_case ≤40자)에 맞지 않으면 버린다.
// 위 "공용 파라미터 어휘"를 먼저 쓰고, 새 이벤트명은 area_object_action 꼴로 짓는다.
function trackEvent(eventName, params = {}) {
  if (typeof eventName !== "string" || !EVENT_NAME_PATTERN.test(eventName)) return;
  gtagEvent(eventName, params);
}

// 1회 발화 가드 — 같은 key로는 처음 한 번만 true. 노출(view) 계열 이벤트를 마운트당
// 1회로 묶을 때 useRef(makeOnceGuard()) 형태로 쓴다.
function makeOnceGuard() {
  const seen = new Set();
  return (key = "") => {
    const normalized = String(key);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  };
}

// 내부 라인아이템({ productId, title, brand?, subject?, optionLabel?, conditionGrade?,
// price, quantity, index? })을 GA4 items 항목으로 변환. item_id는 책(권) 단위가 아니라
// 상품 단위(productId)로 잡아 상품별 성과가 집계되게 한다. index는 목록 내 위치(0부터).
function toGaItem(line) {
  const optionParts = [line.optionLabel, line.conditionGrade].filter(Boolean);
  return {
    item_id: String(line.productId ?? ""),
    item_name: line.title ?? "",
    ...(line.brand ? { item_brand: line.brand } : {}),
    ...(line.subject ? { item_category: line.subject } : {}),
    ...(optionParts.length > 0 ? { item_variant: optionParts.join(" · ") } : {}),
    ...(Number.isInteger(line.index) && line.index >= 0 ? { index: line.index } : {}),
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
// 목록이 화면에 실제로 들어왔을 때(useInViewOnce) 1회 발화하는 것이 원칙.
function trackViewItemList(listName, lines, extra) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "view_item_list",
    withExtra(
      {
        ...(listName ? { item_list_name: listName } : {}),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
}

// 목록에서 상품 클릭 — 어느 목록이 클릭을 만드는지(item_list_name) 비교용.
function trackSelectItem(listName, line, extra) {
  if (!line) return;
  gtagEvent(
    "select_item",
    withExtra(
      {
        ...(listName ? { item_list_name: listName } : {}),
        items: [toGaItem(line)],
      },
      extra,
    ),
  );
}

// 검색 실행 — 결과 수까지 기록. GA4 향상된 측정(view_search_results, ?q= 기반)과
// 별개 이벤트라 이중 집계가 아니고, result_count는 여기서만 얻을 수 있다.
// 결과 0건이면 search_no_results를 추가 발화 — 입고 우선순위 판단용 핵심 데이터.
function trackSearch(searchTerm, resultCount, extra) {
  const term = clampText(searchTerm);
  if (!term) return;
  const count = Number.isFinite(Number(resultCount)) ? Number(resultCount) : null;
  gtagEvent(
    "search",
    withExtra(
      {
        search_term: term,
        ...(count !== null ? { result_count: count } : {}),
      },
      extra,
    ),
  );
  if (count === 0) {
    gtagEvent("search_no_results", withExtra({ search_term: term }, extra));
  }
  fbqEvent("Search", { search_string: term });
}

// ── 이커머스: 상세·장바구니 ─────────────────────────────────────────────────

// 상품 상세 조회 (상세 페이지 로드 성공 시 1회)
function trackViewItem(line, extra) {
  if (!line) return;
  gtagEvent(
    "view_item",
    withExtra(
      {
        currency: CURRENCY,
        value: Number(line.price) || 0,
        items: [toGaItem(line)],
      },
      extra,
    ),
  );
  fbqEvent("ViewContent", {
    ...toMetaContentParams([line]),
    content_name: line.title ?? "",
    currency: CURRENCY,
    value: Number(line.price) || 0,
  });
}

// 장바구니 담기 (실제로 담기에 성공한 라인만 전달할 것)
function trackAddToCart(lines, extra) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "add_to_cart",
    withExtra(
      {
        currency: CURRENCY,
        value: sumLineValue(lines),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
  fbqEvent("AddToCart", {
    ...toMetaContentParams(lines),
    currency: CURRENCY,
    value: sumLineValue(lines),
  });
}

// 장바구니 조회 (장바구니 페이지 로드 성공 시 1회)
function trackViewCart(lines, extra) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "view_cart",
    withExtra(
      {
        currency: CURRENCY,
        value: sumLineValue(lines),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
}

// 장바구니 제거 — 수량 줄이기·그룹 삭제·선택 삭제 (실제로 지워진 라인만 전달할 것)
function trackRemoveFromCart(lines, extra) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "remove_from_cart",
    withExtra(
      {
        currency: CURRENCY,
        value: sumLineValue(lines),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
}

// 찜 추가 — 모든 표면(카드·상세·복귀 재실행)이 거치는 PublicWishlistContext에서 발화.
// meta({ title, price, brand, subject, uiSurface })가 오면 items에 채우고 ui_surface를 얹는다.
function trackAddToWishlist(productId, meta = {}) {
  if (productId == null) return;
  const { uiSurface, ...line } = meta || {};
  gtagEvent("add_to_wishlist", {
    ...(line.price != null ? { currency: CURRENCY, value: Number(line.price) || 0 } : {}),
    ...(uiSurface ? { ui_surface: uiSurface } : {}),
    items: [toGaItem({ ...line, productId, quantity: 1 })],
  });
  fbqEvent("AddToWishlist", {
    content_ids: [String(productId)],
    content_type: "product",
  });
}

// 찜 해제 — GA4 표준에 없어 커스텀. 찜 이탈률(추가 대비 해제) 관찰용.
function trackRemoveFromWishlist(productId, meta = {}) {
  if (productId == null) return;
  gtagEvent("remove_from_wishlist", {
    item_id: String(productId),
    ...(meta?.uiSurface ? { ui_surface: meta.uiSurface } : {}),
  });
}

// ── 이커머스: 결제 여정 ─────────────────────────────────────────────────────
// extra에는 checkout_type(guest/member)·attempt_index·pg_review_mode 등을 얹는다.

// 주문 페이지 진입 (주문서 1회)
function trackBeginCheckout(lines, extra) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "begin_checkout",
    withExtra(
      {
        currency: CURRENCY,
        value: sumLineValue(lines),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
  fbqEvent("InitiateCheckout", {
    ...toMetaContentParams(lines),
    num_items: sumLineQuantity(lines),
    currency: CURRENCY,
    value: sumLineValue(lines),
  });
}

// 배송 정보 확정 — 주문서 제출이 검증을 통과한 시점(주소가 실제 제출됨).
// begin_checkout 대비 이탈(주소 입력 단계 포기)을 가른다.
function trackAddShippingInfo({ lines, shippingTier, ...extra }) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "add_shipping_info",
    withExtra(
      {
        currency: CURRENCY,
        value: sumLineValue(lines),
        ...(shippingTier ? { shipping_tier: shippingTier } : {}),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
}

// 결제 정보 확정 — 주문서 제출이 검증을 통과한 시점. payment_type으로 수단별 전환 비교.
// purchase와의 격차 = 결제창 이탈·승인 실패·입금 포기 구간.
function trackAddPaymentInfo({ lines, paymentType, coupon, ...extra }) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  gtagEvent(
    "add_payment_info",
    withExtra(
      {
        currency: CURRENCY,
        value: sumLineValue(lines),
        ...(paymentType ? { payment_type: paymentType } : {}),
        ...(coupon ? { coupon: clampText(coupon) } : {}),
        items: lines.map(toGaItem),
      },
      extra,
    ),
  );
  fbqEvent("AddPaymentInfo", {
    ...toMetaContentParams(lines),
    currency: CURRENCY,
    value: sumLineValue(lines),
  });
}

// 주문 성공 — 무통장은 주문 생성 시점(입금 확인 전, OrderPage), 카드(PG)는 결제 승인
// 후 주문완료 페이지 진입 시점(OrderCompletePage, 중복 방지 가드 포함)에 호출된다.
// Meta Purchase는 value+currency 필수 규격.
function trackPurchase({ transactionId, value, shipping, items, coupon, ...extra }) {
  if (!transactionId || !Array.isArray(items) || items.length === 0) return;
  gtagEvent(
    "purchase",
    withExtra(
      {
        transaction_id: String(transactionId),
        currency: CURRENCY,
        value: Number(value) || 0,
        ...(Number.isFinite(Number(shipping)) ? { shipping: Number(shipping) } : {}),
        ...(coupon ? { coupon: clampText(coupon) } : {}),
        items: items.map(toGaItem),
      },
      extra,
    ),
  );
  fbqEvent("Purchase", {
    ...toMetaContentParams(items),
    num_items: sumLineQuantity(items),
    currency: CURRENCY,
    value: Number(value) || 0,
  });
}

// 쿠폰 적용/해제 — 주문서 쿠폰 선택 모달. 쿠폰별 사용률·주문 기여 관찰용.
function trackCouponApply({ couponId, couponTitle, discountType, ...extra }) {
  gtagEvent(
    "coupon_apply",
    withExtra(
      {
        ...(couponId != null ? { coupon_id: String(couponId) } : {}),
        ...(couponTitle ? { coupon_name: clampText(couponTitle) } : {}),
        ...(discountType ? { discount_type: discountType } : {}),
      },
      extra,
    ),
  );
}

function trackCouponRemove(extra) {
  gtagEvent("coupon_remove", withExtra({}, extra));
}

// 결제 여정 오류 — stage: validation(제출 검증 실패) / create_order(주문 RPC 실패) /
// checkout_session(카드 세션 RPC 실패) / pg_open(결제창 호출 실패) / pg_widget(토스 위젯) /
// pg_confirm(승인 API 실패) / address_script(우편번호 스크립트) 등.
// begin_checkout → purchase 사이 어디서 새는지 원인별로 가른다. extra.error_field로 검증
// 실패 필드를 기계 판독 가능하게 남긴다.
function trackCheckoutError(stage, message, extra) {
  gtagEvent(
    "checkout_error",
    withExtra(
      {
        error_stage: stage || "unknown",
        ...(clampText(message) ? { error_message: clampText(message) } : {}),
      },
      extra,
    ),
  );
}

// 결제 수단 선택 클릭 — add_payment_info(제출 시점)와 별개로 카드/무통장 선택 자체를 센다.
function trackPaymentMethodSelect(paymentType, extra) {
  gtagEvent(
    "payment_method_select",
    withExtra({ payment_type: paymentType || "unknown" }, extra),
  );
}

// PG 결제 실패 복귀 (PaymentFailPage 진입) — 실패 코드 분포 관찰용.
function trackPaymentFail({ code, message, ...extra }) {
  gtagEvent(
    "payment_fail",
    withExtra(
      {
        ...(code ? { error_code: clampText(code) } : {}),
        ...(clampText(message) ? { error_message: clampText(message) } : {}),
      },
      extra,
    ),
  );
}

// ── 주문 후 액션 (마이페이지) ────────────────────────────────────────────────
// extra로 reason_category·order_status·value 등을 얹는다(호출부에 이미 있는 값만).

function trackOrderCancel(orderId, extra) {
  gtagEvent(
    "order_cancel",
    withExtra({ ...(orderId != null ? { order_id: String(orderId) } : {}) }, extra),
  );
}

function trackPurchaseConfirm(orderId, extra) {
  gtagEvent(
    "purchase_confirm",
    withExtra({ ...(orderId != null ? { order_id: String(orderId) } : {}) }, extra),
  );
}

// 후기 등록/수정 (2026-09-02 통합 후기)
function trackReviewSubmit({ orderId, rating, photoCount = 0, mode = "create", ...extra } = {}) {
  gtagEvent(
    "review_submit",
    withExtra(
      {
        ...(orderId != null ? { order_id: String(orderId) } : {}),
        ...(rating != null ? { rating: Number(rating) } : {}),
        photo_count: Number(photoCount) || 0,
        mode,
      },
      extra,
    ),
  );
}

function trackRefundRequest(orderId, extra) {
  gtagEvent(
    "refund_request",
    withExtra({ ...(orderId != null ? { order_id: String(orderId) } : {}) }, extra),
  );
}

function trackMemberWithdraw(reasonCategory, extra) {
  gtagEvent(
    "member_withdraw",
    withExtra(
      { ...(reasonCategory ? { reason_category: clampText(reasonCategory) } : {}) },
      extra,
    ),
  );
}

// 배송 조회(CJ 추적 링크) 클릭 — ui_surface: purchase_card / sales_card / guest_lookup
function trackDeliveryTrackClick(uiSurface, extra) {
  gtagEvent(
    "delivery_track_click",
    withExtra({ ui_surface: uiSurface || "unknown" }, extra),
  );
}

// ── 프로모션 노출·클릭·닫기 ────────────────────────────────────────────────

// 홈 히어로 배너·팝업 배너 노출. promotion_id/creative_slot으로 배너별 성과 비교.
function trackViewPromotion({ promotionId, promotionName, creativeSlot, ...extra }) {
  gtagEvent(
    "view_promotion",
    withExtra(
      {
        ...(promotionId ? { promotion_id: String(promotionId) } : {}),
        ...(promotionName ? { promotion_name: clampText(promotionName) } : {}),
        ...(creativeSlot ? { creative_slot: creativeSlot } : {}),
      },
      extra,
    ),
  );
}

function trackSelectPromotion({ promotionId, promotionName, creativeSlot, ...extra }) {
  gtagEvent(
    "select_promotion",
    withExtra(
      {
        ...(promotionId ? { promotion_id: String(promotionId) } : {}),
        ...(promotionName ? { promotion_name: clampText(promotionName) } : {}),
        ...(creativeSlot ? { creative_slot: creativeSlot } : {}),
      },
      extra,
    ),
  );
}

// 프로모션(팝업·배너) 닫기 — view_promotion 대비 dismiss 비율. close_method 필수.
function trackPromotionDismiss({ promotionId, promotionName, creativeSlot, closeMethod, ...extra }) {
  gtagEvent(
    "promotion_dismiss",
    withExtra(
      {
        ...(promotionId ? { promotion_id: String(promotionId) } : {}),
        ...(promotionName ? { promotion_name: clampText(promotionName) } : {}),
        ...(creativeSlot ? { creative_slot: creativeSlot } : {}),
        close_method: closeMethod || "unknown",
      },
      extra,
    ),
  );
}

// ── 셀러(수거 신청) 퍼널 ────────────────────────────────────────────────────

// 수거 신청 페이지 진입 (양식 노출 1회) — generate_lead와의 격차 = 작성 이탈.
function trackPickupRequestStart(extra) {
  gtagEvent("pickup_request_start", withExtra({}, extra));
}

// 수거 신청 제출 성공 = 셀러 리드 확보. GA4 권장 generate_lead + Meta Lead.
function trackGenerateLead({ boxCount, expectedBookCount, ...extra }) {
  gtagEvent(
    "generate_lead",
    withExtra(
      {
        lead_type: "pickup_request",
        ...(Number.isFinite(Number(boxCount)) ? { box_count: Number(boxCount) } : {}),
        ...(Number.isFinite(Number(expectedBookCount))
          ? { expected_book_count: Number(expectedBookCount) }
          : {}),
      },
      extra,
    ),
  );
  fbqEvent("Lead", {});
}

// 전일학원 출시 알림 신청 성공 = 이벤트 리드 확보. GA4 generate_lead + Meta Lead.
function trackJeonilLaunchAlert(extra) {
  gtagEvent("generate_lead", withExtra({ lead_type: "jeonil_launch_alert" }, extra));
  fbqEvent("Lead", {});
}

// 카카오톡 채널 친구추가 쿠폰 발급 성공 = 채널 리드 확보. GA4 generate_lead + Meta Lead.
// extra.claim_trigger(manual/auto_oauth_return/retry)로 진입 경로를 가른다.
function trackKakaoCouponClaim(extra) {
  gtagEvent("generate_lead", withExtra({ lead_type: "kakao_channel_coupon" }, extra));
  fbqEvent("Lead", {});
}

// 수거 신청 CTA 클릭 (cta_source: hero_banner / home_bottom_cta / header_nav / mobile_drawer /
// footer / mypage_sales_empty / mypage_settlements_empty …)
function trackPickupCtaClick(source, extra) {
  gtagEvent("pickup_cta_click", withExtra({ cta_source: source || "unknown" }, extra));
}

// ── 계정 ────────────────────────────────────────────────────────────────────

// 가입 완료 — 이메일: SignupPage 가입 확정 시점, OAuth: 동의 페이지 완료 시점.
// extra.marketing_opt_in(boolean)·is_legacy_member 등을 얹는다.
function trackSignUp(method, extra) {
  gtagEvent("sign_up", withExtra({ method: method || "unknown" }, extra));
  fbqEvent("CompleteRegistration", {});
}

// 이메일 인증(OTP) 완료 — 가입 활성화 지표. extra.context: signup_inline / signup_success / oauth_auto
function trackEmailVerified(extra) {
  gtagEvent("email_verify_complete", withExtra({}, extra));
}

// 로그인 완료 — GA4 권장 이벤트명 `login` (method=email/google/kakao)
function trackLogin(method, extra) {
  gtagEvent("login", withExtra({ method: method || "unknown" }, extra));
}

// 로그인 실패 — error_reason: invalid_credentials / email_not_confirmed / social_only_account /
// banned / rate_limit / blocked_role / admin_account / withdrawn / email_unverified_profile / other
function trackLoginFailure(reason, extra) {
  gtagEvent(
    "login_failure",
    withExtra({ error_reason: reason || "other" }, extra),
  );
}

// 로그아웃 — ui_surface: account_menu / mobile_drawer / mypage_settings / forced(차단·탈퇴 등)
function trackLogout(uiSurface, extra) {
  gtagEvent("logout", withExtra({ ui_surface: uiSurface || "unknown" }, extra));
}

// OAuth 버튼 클릭(리다이렉트 전 의도) — `login`/`sign_up`(완료)과 짝을 이루는 분모.
// ui_surface: login_page / signup_page / member_gate / kakao_coupon …
function trackOAuthStart(method, uiSurface, extra) {
  gtagEvent(
    "oauth_start",
    withExtra({ method: method || "unknown", ui_surface: uiSurface || "unknown" }, extra),
  );
}

// 로그인 관문 노출 — 비로그인이 회원 전용 액션(담기/바로구매/찜 등)을 시도
function trackLoginGateShown(reason, extra) {
  gtagEvent("login_gate_shown", withExtra({ gate_reason: reason || "unknown" }, extra));
}

// 관문에서 고른 선택지 — kakao/google/email/guest/dismiss (2026-08-09 관문 개편 효과 측정).
// login_gate_shown 대비 각 선택 비율로 위계 개편 전후를 비교한다. extra.close_method로
// dismiss 제스처(escape/backdrop/later_button/swipe)를 가른다.
function trackLoginGateCta(cta, reason, extra) {
  gtagEvent(
    "login_gate_cta",
    withExtra(
      {
        cta_option: cta || "unknown",
        gate_reason: reason || "unknown",
      },
      extra,
    ),
  );
}

// ── 재입고 알림 ─────────────────────────────────────────────────────────────

// 품절 상품 단위 구독/해제 — 수요 시그널. extra.ui_surface: hero / sticky_bar / wishlist_card
function trackRestockSubscribe(productId, subscribed, extra) {
  gtagEvent(
    subscribed ? "restock_subscribe" : "restock_unsubscribe",
    withExtra({ ...(productId != null ? { item_id: String(productId) } : {}) }, extra),
  );
}

// 키워드 단위 입고 알림 (검색 0건 동선) — 미보유 수요의 원문 키워드.
function trackRestockKeywordSubscribe(keyword, extra) {
  gtagEvent(
    "restock_keyword_subscribe",
    withExtra({ ...(clampText(keyword) ? { keyword: clampText(keyword) } : {}) }, extra),
  );
}

// ── 탐색 UI 조작 ────────────────────────────────────────────────────────────

// 스토어 필터 조작 — filter_group: subject/types/brands/..., filter_action: add/remove/select/clear_group
function trackStoreFilter(groupKey, value, action, extra) {
  gtagEvent(
    "store_filter_change",
    withExtra(
      {
        filter_group: groupKey || "unknown",
        ...(clampText(value) ? { filter_value: clampText(value) } : {}),
        filter_action: action || "add",
      },
      extra,
    ),
  );
}

function trackStoreSort(sortValue, extra) {
  gtagEvent("store_sort_change", withExtra({ sort_option: sortValue || "unknown" }, extra));
}

// 상품 외 목록의 필터/탭 전환 — list_name: purchases / sales / coupons / notifications …
function trackListFilterChange(listName, filterValue, extra) {
  gtagEvent(
    "list_filter_change",
    withExtra(
      {
        list_name: listName || "unknown",
        ...(clampText(filterValue) ? { filter_value: clampText(filterValue) } : {}),
      },
      extra,
    ),
  );
}

// "더 보기" 류 추가 로드 — extra: next_page / loaded_count / total_count
function trackLoadMore(listName, extra) {
  gtagEvent("load_more", withExtra({ list_name: listName || "unknown" }, extra));
}

// 페이지 번호 이동 — nav_method: page / prev / next
function trackListPagination(listName, { pageNumber, previousPage, totalPages, navMethod } = {}, extra) {
  gtagEvent(
    "list_pagination",
    withExtra(
      {
        list_name: listName || "unknown",
        ...(Number.isFinite(Number(pageNumber)) ? { page_number: Number(pageNumber) } : {}),
        ...(Number.isFinite(Number(previousPage)) ? { previous_page: Number(previousPage) } : {}),
        ...(Number.isFinite(Number(totalPages)) ? { total_pages: Number(totalPages) } : {}),
        nav_method: navMethod || "page",
      },
      extra,
    ),
  );
}

// 캐러셀/배너/레일 넘김 — nav_method: arrow / dot / swipe, direction: prev / next
function trackCarouselNavigate(listName, navMethod, direction, extra) {
  gtagEvent(
    "carousel_navigate",
    withExtra(
      {
        list_name: listName || "unknown",
        nav_method: navMethod || "arrow",
        ...(direction ? { direction } : {}),
      },
      extra,
    ),
  );
}

// 탭 전환 — tab_area: mypage / policy / product_detail …, extra.from_tab
function trackTabChange(tabArea, tabName, extra) {
  gtagEvent(
    "tab_change",
    withExtra({ tab_area: tabArea || "unknown", tab_name: tabName || "unknown" }, extra),
  );
}

// ── 콘텐츠·내비게이션 클릭 (GA4 권장 select_content) ─────────────────────────
// content_type: nav / breadcrumb / footer_nav / empty_cart_cta / order_complete_cta /
// payment_fail_cta / policy_link / subject_nav / collection_nav / notfound_cta / detail_section …
function trackSelectContent(contentType, contentId, extra) {
  gtagEvent(
    "select_content",
    withExtra(
      {
        content_type: contentType || "unknown",
        ...(clampText(contentId) ? { content_id: clampText(contentId) } : {}),
      },
      extra,
    ),
  );
}

// 문의 채널 클릭 — channel: kakao / email / phone, ui_surface: footer_link / footer_social /
// guest_lookup / purchase_card_cancel / inspection_dispute / error_boundary …
// (외부 <a>는 향상된 측정 click도 같이 찍히지만, 위치·맥락 파라미터는 여기만 있다)
function trackContactClick(channel, uiSurface, extra) {
  gtagEvent(
    "contact_click",
    withExtra({ channel: channel || "unknown", ui_surface: uiSurface || "unknown" }, extra),
  );
}

// 장바구니 진입 클릭 — ui_surface: header_desktop / header_mobile / mobile_drawer
function trackCartOpen(uiSurface, cartItemCount) {
  gtagEvent("cart_open", {
    ui_surface: uiSurface || "unknown",
    ...(Number.isFinite(Number(cartItemCount)) ? { cart_item_count: Number(cartItemCount) } : {}),
  });
}

// 복사 버튼 — copy_target: bank_account / order_number / deposit_amount / depositor_name /
// tracking_number / contact_email. 값 자체는 절대 보내지 않는다.
function trackCopyClick(copyTarget, uiSurface, result) {
  gtagEvent("copy_click", {
    copy_target: copyTarget || "unknown",
    ...(uiSurface ? { ui_surface: uiSurface } : {}),
    ...(result ? { result } : {}),
  });
}

// 빈 상태 노출 — state_area: cart / wishlist / reviews / coupons / notices / notifications /
// store_grid / subject / collection / related_rail / mypage_purchases / mypage_sales …
function trackEmptyState(stateArea, extra) {
  gtagEvent("empty_state_view", withExtra({ state_area: stateArea || "unknown" }, extra));
}

// 404 렌더 — not_found_source: route / subject / collection / product. page_location은 자동 첨부.
function trackPageNotFound(source, extra) {
  gtagEvent("page_not_found", withExtra({ not_found_source: source || "route" }, extra));
}

// 다이얼로그/시트 열기·닫기 — dialog_name: coupon_picker / delivery_memo / address_book /
// address_form / settlement_account_form / confirm_cancel_order / review_composer …
// close_method: backdrop / close_button / escape / swipe / cancel_button / submit
function trackDialogOpen(dialogName, extra) {
  gtagEvent("dialog_open", withExtra({ dialog_name: dialogName || "unknown" }, extra));
}

function trackDialogClose(dialogName, closeMethod, extra) {
  gtagEvent(
    "dialog_close",
    withExtra({ dialog_name: dialogName || "unknown", close_method: closeMethod || "unknown" }, extra),
  );
}

// ── 폼 진행·검증 (주문서/수거 신청/가입 등 다단계 폼 공용) ───────────────────
// 향상된 측정 form_start/form_submit은 <form> 요소 기준 자동 수집이라 겹치지 않는다.

// 필드 최초 입력 완료(blur 시 값 있음) — 마운트당 필드별 1회(호출부가 once 가드).
function trackFormProgress(formName, fieldName, extra) {
  gtagEvent(
    "form_progress",
    withExtra({ form_name: formName || "unknown", field_name: fieldName || "unknown" }, extra),
  );
}

// 검증 실패 — error_reason: required / format / unverified / mismatch / too_short …
function trackFormError(formName, fieldName, errorReason, extra) {
  gtagEvent(
    "form_validation_error",
    withExtra(
      {
        form_name: formName || "unknown",
        field_name: fieldName || "unknown",
        error_reason: errorReason || "invalid",
      },
      extra,
    ),
  );
}

// 다단계 폼 스텝 노출 — extra.direction: next / prev / jump
function trackFormStepView(formName, stepIndex, stepName, extra) {
  gtagEvent(
    "form_step_view",
    withExtra(
      {
        form_name: formName || "unknown",
        ...(Number.isFinite(Number(stepIndex)) ? { step_index: Number(stepIndex) } : {}),
        ...(clampText(stepName) ? { step_name: clampText(stepName) } : {}),
      },
      extra,
    ),
  );
}

// 폼 이탈(명시적 취소/나가기) — extra.step_index / ui_action(prompt/confirm)
function trackFormAbandon(formName, extra) {
  gtagEvent("form_abandon", withExtra({ form_name: formName || "unknown" }, extra));
}

// ── 오류·예외 (GA4 권장 exception) ──────────────────────────────────────────
// description은 짧은 열거형 코드(product_not_found / cart_load_failed / …)로 쓰고,
// 원문 메시지는 extra.error_message로. 치명(화면 전체 실패)일 때만 fatal: true.
function trackException(description, extra) {
  gtagEvent(
    "exception",
    withExtra(
      {
        description: clampText(description) || "unknown",
        fatal: false,
      },
      extra,
    ),
  );
}

// ── 알림 ────────────────────────────────────────────────────────────────────

// 알림 목록 항목 클릭 — notification_type: 알림 type 열거값, extra.was_unread
function trackNotificationClick(notificationType, extra) {
  gtagEvent(
    "notification_click",
    withExtra({ notification_type: notificationType || "unknown" }, extra),
  );
}

// ── 기타 인게이지먼트 ───────────────────────────────────────────────────────

function trackFaqOpen({ faqId, question, category, ...extra }) {
  gtagEvent(
    "faq_open",
    withExtra(
      {
        ...(faqId != null ? { faq_id: String(faqId) } : {}),
        ...(clampText(question) ? { faq_question: clampText(question) } : {}),
        ...(clampText(category) ? { faq_category: clampText(category) } : {}),
      },
      extra,
    ),
  );
}

// 비회원 주문 조회 결과 — extra.lookup_source: manual / auto
function trackGuestOrderLookup(found, extra) {
  gtagEvent("guest_order_lookup", withExtra({ lookup_found: found ? "yes" : "no" }, extra));
}

function trackFortuneCookieDraw(extra) {
  gtagEvent("fortune_cookie_draw", withExtra({}, extra));
}

// 상세 이미지 확대(라이트박스) — 구매 전 상태 확인 행동 시그널. extra.zoom_source: hero / review
function trackImageZoom(productId, extra) {
  gtagEvent(
    "product_image_zoom",
    withExtra({ ...(productId != null ? { item_id: String(productId) } : {}) }, extra),
  );
}

// ── 구매 여정 중간 계측 (2026-08-01 첫 주간 분석 후속) ─────────────────────
// view_item(2,620세션) → begin_checkout(39세션) 사이가 블랙박스라 추가한 3종.
// 파라미터는 표준 보고서에 자동 노출되지 않지만 BigQuery event_params로는 그대로 쌓인다.

// 구매 의도 클릭 — 담기/바로구매 버튼. 로그인 관문 "앞"이라 비로그인도 잡힌다.
// uiSurface: hero(본문 구매 박스) / sticky_bar(모바일 하단 고정 바)
function trackBuyClick(buyType, { productId, itemCount, value, uiSurface, ...extra } = {}) {
  gtagEvent(
    "buy_click",
    withExtra(
      {
        buy_type: buyType,
        ...(productId != null ? { item_id: String(productId) } : {}),
        ...(Number.isFinite(Number(itemCount)) ? { item_count: Number(itemCount) } : {}),
        ...(uiSurface ? { ui_surface: uiSurface } : {}),
        currency: CURRENCY,
        value: Number(value) || 0,
      },
      extra,
    ),
  );
}

export {
  makeOnceGuard,
  sanitizeParams,
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackAddToCart,
  trackAddToWishlist,
  trackBeginCheckout,
  trackBuyClick,
  trackCarouselNavigate,
  trackCartOpen,
  trackCheckoutError,
  trackContactClick,
  trackCopyClick,
  trackCouponApply,
  trackCouponRemove,
  trackDeliveryTrackClick,
  trackDialogClose,
  trackDialogOpen,
  trackEmailVerified,
  trackEmptyState,
  trackEvent,
  trackException,
  trackFaqOpen,
  trackFormAbandon,
  trackFormError,
  trackFormProgress,
  trackFormStepView,
  trackFortuneCookieDraw,
  trackGenerateLead,
  trackGuestOrderLookup,
  trackImageZoom,
  trackJeonilLaunchAlert,
  trackKakaoCouponClaim,
  trackListFilterChange,
  trackListPagination,
  trackLoadMore,
  trackLogin,
  trackLoginFailure,
  trackLoginGateCta,
  trackLoginGateShown,
  trackLogout,
  trackMemberWithdraw,
  trackNotificationClick,
  trackOAuthStart,
  trackOrderCancel,
  trackPageNotFound,
  trackPaymentFail,
  trackPaymentMethodSelect,
  trackPickupCtaClick,
  trackPickupRequestStart,
  trackPromotionDismiss,
  trackPurchase,
  trackPurchaseConfirm,
  trackRefundRequest,
  trackRemoveFromCart,
  trackRemoveFromWishlist,
  trackRestockKeywordSubscribe,
  trackReviewSubmit,
  trackRestockSubscribe,
  trackSearch,
  trackSelectContent,
  trackSelectItem,
  trackSelectPromotion,
  trackSignUp,
  trackStoreFilter,
  trackStoreSort,
  trackTabChange,
  trackViewCart,
  trackViewItem,
  trackViewItemList,
  trackViewPromotion,
};
