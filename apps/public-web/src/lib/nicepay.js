// 나이스페이먼츠 결제창(Server 승인 모델) 연동 헬퍼 — public-web 전용.
//
// 흐름: createOrder(pending 주문 생성) → AUTHNICE.requestPay(결제창 오픈) → 카드 인증
//   → 나이스페이가 returnUrl(/api/payments/nicepay-return)로 인증 결과를 POST
//   → 서버리스가 승인 API 호출 + confirm_pg_payment RPC → /order/complete/:id 리다이렉트.
//
// 공식 문서: https://github.com/nicepayments/nicepay-manual (api/payment-window-server.md)
// - PC는 레이어 결제창, 모바일은 페이지 리다이렉트 — 어느 쪽이든 returnUrl POST로 수렴.
// - 결제창을 사용자가 그냥 닫으면 아무 콜백도 오지 않는다(주문은 pending으로 남아
//   24시간 뒤 자동 취소 — 토스 결제 취소 케이스와 동일 정책).
// - fnError는 결제창 호출 자체가 실패했을 때만 불린다(result.errorMsg).

const NICEPAY_JS_URL = "https://pay.nicepay.co.kr/v1/js/";
const SDK_LOAD_TIMEOUT_MS = 10_000;

export const NICEPAY_ENABLED = import.meta.env.VITE_NICEPAY_ENABLED === "true";
export const NICEPAY_CLIENT_KEY = import.meta.env.VITE_NICEPAY_CLIENT_KEY || "";
export const NICEPAY_READY = NICEPAY_ENABLED && Boolean(NICEPAY_CLIENT_KEY);

let sdkPromise = null;

export function loadNicepaySdk() {
  if (typeof window !== "undefined" && window.AUTHNICE) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = NICEPAY_JS_URL;
    script.async = true;

    // 10초 타임아웃 — 광고차단/네트워크 끊김으로 onload/onerror 둘 다 안 불리는 케이스 방어
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error("결제 모듈 로드 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요."));
    }, SDK_LOAD_TIMEOUT_MS);

    script.onload = () => {
      window.clearTimeout(timer);
      if (window.AUTHNICE) {
        resolve();
      } else {
        sdkPromise = null;
        reject(new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      sdkPromise = null;
      reject(new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    };

    document.head.appendChild(script);
  });
  return sdkPromise;
}

// goodsName은 40바이트 제한(한글 2~3바이트) — 첫 상품명 12자 + "외 N건"으로 보수적으로 자른다.
export function buildNicepayGoodsName(items) {
  const first = (items?.[0]?.title || "수북 교재").slice(0, 12);
  const extra = (items?.length ?? 1) - 1;
  return extra > 0 ? `${first} 외 ${extra}건` : first;
}

export function requestNicepayCardPay({
  orderNumber,
  amount,
  goodsName,
  buyerName,
  buyerTel,
  buyerEmail,
  onError,
}) {
  if (typeof window === "undefined" || !window.AUTHNICE) {
    throw new Error("결제 모듈이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
  }
  window.AUTHNICE.requestPay({
    clientId: NICEPAY_CLIENT_KEY,
    method: "card",
    orderId: orderNumber,
    amount,
    goodsName,
    returnUrl: `${window.location.origin}/api/payments/nicepay-return`,
    ...(buyerName ? { buyerName } : {}),
    ...(buyerTel ? { buyerTel } : {}),
    ...(buyerEmail ? { buyerEmail } : {}),
    fnError: (result) => {
      if (onError) onError(result);
    },
  });
}
