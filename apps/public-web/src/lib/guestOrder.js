import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

// 비회원(게스트) 주문 — RPC 래퍼 모음.
// 게스트 주문은 orders.user_id가 NULL이며, 조회는 주문번호+휴대폰 2요소로만 가능하다.
// 게스트 주문번호는 회원 순번 체계와 달리 랜덤(ORD-YYMM-G··········)이라 열거가 불가능하다.

// 카드 결제(나이스페이)는 결제창에서 서버 리다이렉트로 복귀하므로 SPA state가 유실된다.
// 게스트는 로그인 세션이 없어 완료 페이지에서 주문을 RLS로 재조회할 수 없기 때문에,
// 결제창을 열기 직전 주문번호+휴대폰을 sessionStorage에 보관했다가 완료 페이지에서 읽는다.
const GUEST_ORDER_REF_STORAGE_KEY = "subook.public.guest-order-ref.v1";

function normalizePhoneDigits(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

async function createGuestOrder({
  bookIds,
  quantities,
  shippingRecipientName,
  shippingRecipientPhone,
  shippingPostalCode,
  shippingAddressLine1,
  shippingAddressLine2,
  shippingMemo,
  refundBank = null,
  refundAccountNumber = null,
  refundAccountHolder = null,
  agreeTerms = false,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { data, error } = await supabase.rpc("create_guest_order", {
    p_book_ids: bookIds,
    p_quantities: quantities,
    p_shipping_recipient_name: shippingRecipientName,
    p_shipping_recipient_phone: shippingRecipientPhone,
    p_shipping_postal_code: shippingPostalCode,
    p_shipping_address_line1: shippingAddressLine1,
    p_shipping_address_line2: shippingAddressLine2 || null,
    p_shipping_memo: shippingMemo || null,
    p_refund_bank: refundBank,
    p_refund_account_number: refundAccountNumber,
    p_refund_account_holder: refundAccountHolder,
    p_agree_terms: Boolean(agreeTerms),
  });

  return { data: data ?? null, error: error ?? null };
}

// 카드(PG) 게스트 결제 세션 — 주문을 만들지 않고 검증·금액 확정만 한다.
// 주문은 카드 인증 성공 후 서버(nicepay-return)가 finalize RPC로 생성한다.
async function createGuestPgCheckoutSession({
  bookIds,
  quantities,
  shippingRecipientName,
  shippingRecipientPhone,
  shippingPostalCode,
  shippingAddressLine1,
  shippingAddressLine2,
  shippingMemo,
  agreeTerms = false,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { data, error } = await supabase.rpc("create_guest_pg_checkout_session", {
    p_book_ids: bookIds,
    p_quantities: quantities,
    p_shipping_recipient_name: shippingRecipientName,
    p_shipping_recipient_phone: shippingRecipientPhone,
    p_shipping_postal_code: shippingPostalCode,
    p_shipping_address_line1: shippingAddressLine1,
    p_shipping_address_line2: shippingAddressLine2 || null,
    p_shipping_memo: shippingMemo || null,
    p_agree_terms: Boolean(agreeTerms),
  });

  return { data: data ?? null, error: error ?? null };
}

// 주문번호 + 휴대폰으로 게스트 주문 조회. 반환: { found, order, items } | { found: false }
// 서버에서 IP당 15분 실패 20회 레이트리밋이 걸려 있다 (초과 시 error로 떨어짐).
async function fetchGuestOrder(orderNumber, phone) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { data, error } = await supabase.rpc("get_guest_order", {
    p_order_number: String(orderNumber ?? "").trim(),
    p_phone: normalizePhoneDigits(phone),
  });

  return { data: data ?? null, error: error ?? null };
}

function stashGuestOrderRef({ orderNumber, phone }) {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      GUEST_ORDER_REF_STORAGE_KEY,
      JSON.stringify({ orderNumber, phone, savedAt: Date.now() }),
    );
  } catch {
    // private mode 등 저장 실패는 무시 — 완료 페이지가 조회 페이지로 안내한다
  }
}

function readGuestOrderRef() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(GUEST_ORDER_REF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.orderNumber) return null;
    // 24시간 지난 참조는 폐기 (자동취소 주기와 동일)
    if (parsed.savedAt && Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      clearGuestOrderRef();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearGuestOrderRef() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(GUEST_ORDER_REF_STORAGE_KEY);
  } catch {
    // noop
  }
}

export {
  clearGuestOrderRef,
  createGuestOrder,
  createGuestPgCheckoutSession,
  fetchGuestOrder,
  normalizePhoneDigits,
  readGuestOrderRef,
  stashGuestOrderRef,
};
