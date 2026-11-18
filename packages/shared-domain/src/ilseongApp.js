// 일성월심 앱 패키지 — 구매자·관리자 화면 공통 문구와 상태.
// 문구를 바꾸려면 여기만 고치면 된다(알림톡 문구는 카카오 검수 대상이라 send-notification.js·ALIMTALK_TEMPLATES.md에 따로 있다).
//
// 앱 코드는 구매자에게 보여 주지 않는다(2026-11-18). 교재는 구매한 수북 계정으로 앱에 로그인하면 등록된다.

export const ILSEONG_APP_PRODUCT_CODE = "ILSEONG_2028_SET4";

// 상품 페이지·주문서·주문 상세 안내 칸에 같이 쓴다.
export const ILSEONG_APP_REFUND_NOTICE =
  "앱 이용권은 교재 구매 고객에게 드리는 부가서비스이며, 교재를 반품·환불하면 앱 이용도 함께 끝납니다.";

// 상품 페이지·주문서: 사기 전에 알아야 하는 것(코드를 넘겨줄 수 없으므로 쓸 사람의 계정으로 사야 한다)
export const ILSEONG_APP_ACCOUNT_NOTICE =
  "앱 교재는 구매한 수북 계정에만 등록됩니다. 교재를 쓸 학생의 계정으로 구매해 주세요.";

// 주문 상세 안내 칸
export const ILSEONG_APP_LOGIN_GUIDE = "교재를 산 수북 계정으로 일성월심 앱에 로그인하면 자동으로 교재가 등록돼요.";

// get_my_order_app_access 의 state (waiting은 안내 문구만 보여 준다)
export const ILSEONG_APP_ACCESS_STATE_LABELS = {
  registered: "이 주문의 교재가 앱에 등록됐어요.",
  ended: "교재를 환불해 앱 이용이 끝났어요.",
};

// 관리자: 환불 시 앱 이용 처리(ilseong_app_settings.refund_policy)
export const ILSEONG_APP_REFUND_POLICIES = [
  { value: "revoke_access", label: "환불하면 앱 이용 종료 (권고)" },
  { value: "revoke_unredeemed", label: "등록 전이면 등록만 막고, 등록한 앱 이용은 유지" },
  { value: "none", label: "앱에는 아무 처리도 하지 않음" },
];
