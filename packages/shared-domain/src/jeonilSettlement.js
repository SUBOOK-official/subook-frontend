export const JEONIL_SETTLEMENT_FEE_PERCENT = 50;

// 지급액은 서버가 검증한 주문 가격/지급 스냅샷을 합산한다. 현재 상품 가격으로 재계산하지 않는다.
export function summarizeJeonilSettlements(rows = []) {
  const summary = { quantity: 0, saleAmount: 0, feeAmount: 0, netAmount: 0, products: [] };
  const products = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.product_id, row.book_title, row.book_option]);
    if (!products.has(key)) products.set(key, { key, title: row.book_title, option: row.book_option, quantity: 0, saleAmount: 0, feeAmount: 0, netAmount: 0 });
    const product = products.get(key);
    for (const [target, source] of [["quantity", "quantity"], ["saleAmount", "sale_amount"], ["feeAmount", "fee_amount"], ["netAmount", "net_amount"]]) {
      const value = Number(row[source]);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("전일학원 정산 금액을 확인해 주세요.");
      summary[target] += value;
      product[target] += value;
    }
  }
  summary.products = [...products.values()];
  return summary;
}
