const fields = {
  status: "상태", title: "제목", name: "이름", description: "설명", note: "메모",
  price: "가격", selling_price: "판매가", sale_price: "판매가", original_price: "정가",
  cover_image_url: "표지", detail_image_urls: "상세 사진", location: "보관 위치", serial_number: "일련번호",
  grade: "등급", brand: "브랜드", subject: "과목", book_type: "교재 유형", year: "연도",
  is_listed: "공개 여부", stock: "재고", quantity: "수량", product_id: "연결 상품",
  confirmed_at: "구매확정 시각", paid_at: "결제 시각", shipped_at: "발송 시각", delivered_at: "배송완료 시각",
  tracking_number: "운송장", tracking_carrier: "택배사", total_amount: "주문 금액", refunded_amount: "환불 금액",
  refund_requested_at: "환불 신청 시각", refund_request_resolved_at: "환불 신청 처리 시각", refund_request_reason: "환불 사유",
  pickup_date: "수거일", seller_name: "판매자 이름", seller_phone: "판매자 연락처", box_count: "박스 수", box_cost_charged: "박스 비용",
  inspection_completed_at: "검수 완료 시각", customer_name: "고객 이름", contact: "연락처", assignee: "담당자",
  priority: "우선순위", due_date: "처리 기한", order_id: "연결 주문", pickup_request_id: "연결 수거", member_user_id: "연결 회원",
  code: "쿠폰 코드", discount_type: "할인 방식", discount_value: "할인 값", valid_from: "시작 시각", valid_until: "종료 시각",
  valid_days: "사용 기간", is_active: "활성 여부", total_quantity: "발급 한도", issued_count: "발급 수", min_order_amount: "최소 주문 금액",
  content: "본문", question: "질문", answer: "답변", sort_order: "순서", is_published: "게시 여부", is_pinned: "상단 고정",
  done: "처리 건수", failures: "실패 결과", target_ids: "작업 대상", label: "작업 이름", total: "전체 건수",
};

export function historyActionLabel(action) {
  return { insert: "등록", update: "수정", delete: "삭제", status: "상태 변경" }[action] || (fields[action] ? `${fields[action]} 변경` : "정보 변경");
}

export function historySearchTerm(value = "") {
  const query = value.trim();
  return { 등록: "insert", 수정: "update", 삭제: "delete" }[query]
    || Object.entries(fields).find(([, label]) => label === query)?.[0]
    || query;
}

export function historyDetailLabel(detail) {
  if (!detail) return "";
  try {
    const changed = JSON.parse(detail);
    if (Array.isArray(changed)) {
      const labels = [...new Set(changed.filter((field) => !["id", "created_at", "updated_at", "created_by"].includes(field)).map((field) => fields[field] || "기타 정보"))];
      return labels.length ? `변경 항목: ${labels.join(" · ")}` : "기록 생성";
    }
  } catch { /* 기존 값 비교 이력은 원문을 유지한다. */ }
  return detail;
}

export function notificationHistoryLabel(notification) {
  const type = { pickup_accepted: "수거접수", arrived: "입고 완료", inspection_done: "검수 완료", sold: "판매 완료", settlement_done: "정산 완료", order_confirmed: "주문 확인", shipping_started: "배송 시작", delivery_done: "배송 완료" }[notification.notification_type] || "알림";
  const status = { sent: "발송됨", failed: "실패", fallback_sms: "SMS 대체", pending: "대기" }[notification.status] || "결과 확인 필요";
  return `${type} · ${status}`;
}
