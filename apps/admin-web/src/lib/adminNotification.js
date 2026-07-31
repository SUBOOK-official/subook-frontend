import { supabase } from "@shared-supabase/adminSupabaseClient";

// 알림톡 발송 API 호출
async function callSendNotification(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, error: "인증 토큰이 없습니다." };
  }

  try {
    const response = await fetch("/api/admin/send-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 알림 로그 뷰어의 재발송 — 저장된 로그 행(notification_logs)을 그대로 다시 발송.
// 서버리스 페이로드가 제네릭 형태라 타입별 래퍼를 거치지 않고 재구성할 수 있다.
export async function resendNotificationFromLog(log) {
  return callSendNotification({
    notificationType: log.notification_type,
    recipientPhone: log.recipient_phone,
    recipientName: log.recipient_name,
    recipientUserId: log.recipient_user_id ?? null,
    refType: log.ref_type ?? null,
    refId: log.ref_id ?? null,
    templateVariables: log.template_variables ?? {},
  });
}

// 수거접수 완료 알림 (판매자)
export async function notifyPickupAccepted({ pickupRequest }) {
  return callSendNotification({
    notificationType: "pickup_accepted",
    recipientPhone: pickupRequest.pickup_recipient_phone,
    recipientName: pickupRequest.pickup_recipient_name,
    recipientUserId: pickupRequest.user_id,
    refType: "pickup_request",
    refId: pickupRequest.id,
    templateVariables: {
      requestNumber: pickupRequest.request_number,
      itemCount: pickupRequest.item_count,
      trackingNumber: pickupRequest.tracking_number || "배정 예정",
    },
  });
}

// 입고 완료 알림 (판매자) — shipment 기반
export async function notifyArrived({ shipment }) {
  return callSendNotification({
    notificationType: "arrived",
    recipientPhone: shipment.seller_phone,
    recipientName: shipment.seller_name,
    recipientUserId: shipment.user_id,
    refType: "shipment",
    refId: shipment.id,
    templateVariables: {
      itemCount: shipment.book_count ?? 0,
    },
  });
}

// 검수 완료 알림 (판매자) — shipment 기반
export async function notifyInspectionDone({ shipment, books }) {
  // 카카오 알림톡은 배열 변수를 못 받으므로 한 문자열(#{inspectionResult})로 합쳐 전달.
  const inspectionResult = (books || [])
    .filter((b) => b.condition_grade)
    .map((b) => {
      const price = b.price ? `${Number(b.price).toLocaleString("ko-KR")}원` : "미정";
      return `▸ ${b.title}: ${b.condition_grade} / ${price}`;
    })
    .join("\n");

  return callSendNotification({
    notificationType: "inspection_done",
    recipientPhone: shipment.seller_phone,
    recipientName: shipment.seller_name,
    recipientUserId: shipment.user_id,
    refType: "shipment",
    refId: shipment.id,
    templateVariables: { inspectionResult },
  });
}

// 판매 완료 알림 (판매자) — 주문 확정 시
export async function notifySold({ sellerPhone, sellerName, sellerUserId, bookTitle, settlementDate, orderId }) {
  return callSendNotification({
    notificationType: "sold",
    recipientPhone: sellerPhone,
    recipientName: sellerName,
    recipientUserId: sellerUserId,
    refType: "order",
    refId: orderId,
    templateVariables: { bookTitle, settlementDate },
  });
}

// 정산 완료 알림 (판매자)
export async function notifySettlementDone({ sellerPhone, sellerName, sellerUserId, amount, bankName, accountLast4, settlementId }) {
  return callSendNotification({
    notificationType: "settlement_done",
    recipientPhone: sellerPhone,
    recipientName: sellerName,
    recipientUserId: sellerUserId,
    refType: "settlement",
    refId: settlementId,
    templateVariables: {
      amount: Number(amount).toLocaleString("ko-KR"),
      bankName,
      accountLast4,
    },
  });
}

// 주문 확인 알림 (구매자)
export async function notifyOrderConfirmed({ order }) {
  const firstItem = order.items?.[0];
  const extraCount = (order.items?.length ?? 1) - 1;
  const firstItemTitle = firstItem?.title ?? "교재";
  // 조건부 "외 N건"은 카카오 변수로 못 하므로 미리 하나의 문자열(#{itemSummary})로 만든다.
  const itemSummary = extraCount > 0 ? `${firstItemTitle} 외 ${extraCount}건` : firstItemTitle;

  return callSendNotification({
    notificationType: "order_confirmed",
    recipientPhone: order.shipping_recipient_phone || order.buyer_phone,
    recipientName: order.shipping_recipient_name || order.buyer_name,
    recipientUserId: order.user_id,
    refType: "order",
    refId: order.id,
    templateVariables: {
      orderNumber: order.order_number,
      itemSummary,
      totalAmount: Number(order.total_amount).toLocaleString("ko-KR"),
    },
  });
}

// 배송 시작 알림 (구매자)
export async function notifyShippingStarted({ order, trackingNumber }) {
  return callSendNotification({
    notificationType: "shipping_started",
    recipientPhone: order.shipping_recipient_phone || order.buyer_phone,
    recipientName: order.shipping_recipient_name || order.buyer_name,
    recipientUserId: order.user_id,
    refType: "order",
    refId: order.id,
    templateVariables: {
      trackingNumber,
      trackingUrl: `https://www.cjlogistics.com/ko/tool/parcel/tracking#parcel/detail/${trackingNumber}`,
    },
  });
}

// 배송 완료 알림 (구매자)
export async function notifyDeliveryDone({ order }) {
  return callSendNotification({
    notificationType: "delivery_done",
    recipientPhone: order.shipping_recipient_phone || order.buyer_phone,
    recipientName: order.shipping_recipient_name || order.buyer_name,
    recipientUserId: order.user_id,
    refType: "order",
    refId: order.id,
    templateVariables: {},
  });
}

// 환불 완료 알림 (구매자) — 환불 처리(전액/부분) 직후 발송.
// 이전에는 환불 후 어떤 알림도 안 가서 사용자가 "왜 환불 안 됐냐" 문의가 폭주했음.
// amount: 이번에 실제 환불된 금액 (부분환불이면 부분 금액). 미전달 시 주문 총액 폴백.
export async function notifyRefundCompleted({ order, reason, amount }) {
  return callSendNotification({
    notificationType: "refund_completed",
    recipientPhone: order.shipping_recipient_phone || order.buyer_phone,
    recipientName: order.shipping_recipient_name || order.buyer_name,
    recipientUserId: order.user_id,
    refType: "order",
    refId: order.id,
    templateVariables: {
      orderNumber: order.order_number,
      totalAmount: Number(amount ?? order.total_amount ?? 0).toLocaleString("ko-KR"),
      reason: reason || "환불 처리",
    },
  });
}

// 정산 회수 알림은 제거됨 — 정산완료 후 환불은 회사 손실로만 처리(셀러 정산 유지, 회수하지 않음).
