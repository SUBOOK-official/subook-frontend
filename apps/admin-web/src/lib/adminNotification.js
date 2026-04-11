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
  const items = (books || [])
    .filter((b) => b.condition_grade)
    .map((b) => ({
      title: b.title,
      grade: b.condition_grade,
      price: b.price ? `${Number(b.price).toLocaleString("ko-KR")}원` : "미정",
    }));

  return callSendNotification({
    notificationType: "inspection_done",
    recipientPhone: shipment.seller_phone,
    recipientName: shipment.seller_name,
    recipientUserId: shipment.user_id,
    refType: "shipment",
    refId: shipment.id,
    templateVariables: { items },
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

  return callSendNotification({
    notificationType: "order_confirmed",
    recipientPhone: order.shipping_recipient_phone || order.buyer_phone,
    recipientName: order.shipping_recipient_name || order.buyer_name,
    recipientUserId: order.user_id,
    refType: "order",
    refId: order.id,
    templateVariables: {
      orderNumber: order.order_number,
      firstItemTitle: firstItem?.title ?? "교재",
      extraCount,
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
