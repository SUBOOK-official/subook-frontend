// 일성월심 앱 패키지 — 구매자·관리자 화면 공통 문구와 상태.
// 문구를 바꾸려면 여기만 고치면 된다(알림톡 문구는 카카오 검수 대상이라 send-notification.js·ALIMTALK_TEMPLATES.md에 따로 있다).

export const ILSEONG_APP_PRODUCT_CODE = "ILSEONG_2028_SET4";

// 상품 페이지·주문 안내·앱 코드 칸에 같이 쓴다.
export const ILSEONG_APP_REFUND_NOTICE =
  "앱 이용권은 교재 구매 고객에게 드리는 부가서비스이며, 교재를 반품·환불하면 앱 이용도 함께 끝납니다.";

export const ILSEONG_APP_HOW_TO = "일성월심 앱 → 코드 등록 → 16자리 입력";

// get_my_order_app_codes / get_guest_order_app_codes 의 state
export const ILSEONG_APP_CODE_STATE_LABELS = {
  pending: "발급 중",
  issued: "등록 전",
  redeemed: "앱에 등록됨",
  ended: "환불로 사용 종료",
};

export const ILSEONG_APP_REFUND_POLICIES = [
  { value: "revoke_access", label: "등록 전 코드 폐기 + 등록한 앱 이용도 종료 (권고)" },
  { value: "revoke_unredeemed", label: "등록 전 코드만 폐기, 이미 등록한 앱 이용은 유지" },
  { value: "none", label: "앱 서버에 폐기 요청하지 않음" },
];
