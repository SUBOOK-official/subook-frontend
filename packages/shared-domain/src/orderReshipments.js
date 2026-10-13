export const RESHIPMENT_STATE_LABELS = {
  claimed: '발급 처리 중', booking: 'CJ 접수 확인 필요', registered: '발급 완료', failed: '발급 실패',
};

export function canReshipOrder(order) {
  return ['shipping', 'delivered', 'confirmed'].includes(order?.status)
    && order?.payment_status === 'paid'
    && (order.items ?? []).some((item) => !item.refunded_at);
}
