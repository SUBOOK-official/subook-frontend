export const RESHIPMENT_STATE_LABELS = {
  claimed: '발급 처리 중', booking: 'CJ 접수 확인 필요', registered: '발급 완료', failed: '발급 실패',
};

export function canReshipOrder(order) {
  return ['shipping', 'delivered', 'confirmed'].includes(order?.status)
    && order?.payment_status === 'paid'
    && (order.items ?? []).some((item) => !item.refunded_at);
}

export function reshipmentProductOptions(product) {
  const options = product.options?.length ? product.options : [{ option: product.option, stock_count: product.inventory_count }];
  return options.map((row) => {
    const option = String(row.option ?? '').trim();
    return {
      replacementProductId: product.id, replacementOption: option || null,
      title: [product.title, option].filter(Boolean).join(' · '),
      label: option || '기본 교재', stock: Number(row.stock_count) || 0,
    };
  });
}

export function toReshipmentItem(item) {
  return {
    orderItemId: item.orderItemId, title: item.title.trim(), quantity: Number(item.quantity),
    // 이전 발급 건의 재시도는 저장된 요청 내용을 그대로 유지한다.
    ...(item.replacementProductId ? {
      replacementProductId: item.replacementProductId, replacementOption: item.replacementOption ?? null,
    } : {}),
  };
}
