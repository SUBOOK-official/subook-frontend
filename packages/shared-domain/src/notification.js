// 알림톡 발송 유형
export const notificationType = {
  PICKUP_ACCEPTED: "pickup_accepted",
  ARRIVED: "arrived",
  INSPECTION_DONE: "inspection_done",
  SOLD: "sold",
  SETTLEMENT_DONE: "settlement_done",
  ORDER_CONFIRMED: "order_confirmed",
  SHIPPING_STARTED: "shipping_started",
  DELIVERY_DONE: "delivery_done",
};

export const notificationTypeLabel = {
  pickup_accepted: "수거접수 완료",
  arrived: "입고 완료",
  inspection_done: "검수 완료",
  sold: "판매 완료",
  settlement_done: "정산 완료",
  order_confirmed: "주문 확인",
  shipping_started: "배송 시작",
  delivery_done: "배송 완료",
};

// 카카오 알림톡 템플릿 코드 매핑 (카카오 비즈 채널 등록 후 실제 코드로 교체)
export const kakaoTemplateCode = {
  pickup_accepted: "SB_PICKUP_ACCEPTED",
  arrived: "SB_ARRIVED",
  inspection_done: "SB_INSPECTION_DONE",
  sold: "SB_SOLD",
  settlement_done: "SB_SETTLEMENT_DONE",
  order_confirmed: "SB_ORDER_CONFIRMED",
  shipping_started: "SB_SHIPPING_STARTED",
  delivery_done: "SB_DELIVERY_DONE",
};

// 수신 대상 구분
export const notificationRecipient = {
  pickup_accepted: "seller",
  arrived: "seller",
  inspection_done: "seller",
  sold: "seller",
  settlement_done: "seller",
  order_confirmed: "buyer",
  shipping_started: "buyer",
  delivery_done: "buyer",
};

// 메시지 본문 생성 함수
export function buildNotificationMessage(type, vars) {
  switch (type) {
    case notificationType.PICKUP_ACCEPTED:
      return (
        `[수북] 수거 접수 완료\n` +
        `요청번호: ${vars.requestNumber}\n` +
        `교재: ${vars.itemCount}권\n` +
        `운송장: ${vars.trackingNumber || "배정 예정"}\n` +
        `택배기사가 1~2일 내에 수거합니다.`
      );

    case notificationType.ARRIVED:
      return (
        `[수북] 교재 입고 완료\n` +
        `교재 ${vars.itemCount}권이 도착했습니다.\n` +
        `검수를 시작합니다.\n` +
        `결과는 1~3일 내에 알려드릴게요.`
      );

    case notificationType.INSPECTION_DONE:
      return (
        `[수북] 검수 완료\n` +
        `${(vars.items || []).map((item) => `▸ ${item.title}: ${item.grade} / ${item.price}`).join("\n")}\n` +
        `마이페이지에서 상세 확인하세요.`
      );

    case notificationType.SOLD:
      return (
        `[수북] 교재 판매 완료!\n` +
        `${vars.bookTitle}이(가) 판매되었습니다.\n` +
        `정산 예정일: ${vars.settlementDate}`
      );

    case notificationType.SETTLEMENT_DONE:
      return (
        `[수북] 정산 완료\n` +
        `정산 금액: ${vars.amount}원\n` +
        `입금 계좌: ${vars.bankName} ****${vars.accountLast4}\n` +
        `마이페이지에서 확인하세요.`
      );

    case notificationType.ORDER_CONFIRMED:
      return (
        `[수북] 주문 확인\n` +
        `주문번호: ${vars.orderNumber}\n` +
        `${vars.firstItemTitle}${vars.extraCount > 0 ? ` 외 ${vars.extraCount}건` : ""}\n` +
        `결제: ${vars.totalAmount}원\n` +
        `배송 예상: 2~3일`
      );

    case notificationType.SHIPPING_STARTED:
      return (
        `[수북] 배송 시작\n` +
        `운송장: CJ ${vars.trackingNumber}\n` +
        `배송추적: ${vars.trackingUrl || "https://www.cjlogistics.com/ko/tool/parcel/tracking"}`
      );

    case notificationType.DELIVERY_DONE:
      return (
        `[수북] 교재 도착!\n` +
        `교재가 도착했습니다.\n` +
        `확인 후 구매확정 부탁드려요.\n` +
        `7일 후 자동 확정됩니다.`
      );

    default:
      return "";
  }
}
