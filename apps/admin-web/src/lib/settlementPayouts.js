const text = (value) => String(value ?? "").trim();
const amount = (value) => Number(value ?? 0);

export function hasPayoutAccount(row) {
  return Boolean(text(row.bank_name) && text(row.account_holder) && /^[\d\s-]+$/.test(text(row.account_number)));
}

// 금액은 정산 원장의 스냅샷을 합산한다. 현재 수수료 정책으로 다시 계산하지 않는다.
export function settlementDeduction(row) {
  return Math.max(0, amount(row.sale_amount) - amount(row.fee_amount) - amount(row.net_amount));
}

export function groupSettlementPayouts(rows) {
  const groups = new Map();
  for (const row of rows) {
    // 비회원은 이름만으로 합치지 않는다. 연락처도 없으면 수거 건별로 구분한다.
    const sellerKey = row.seller_user_id
      ? ["member", row.seller_user_id]
      : text(row.seller_name) && text(row.seller_phone)
        ? ["guest", text(row.seller_name), text(row.seller_phone).replace(/\D/g, "")]
        : ["shipment", row.shipment_id ?? `settlement-${row.id}`];
    const key = JSON.stringify([
      ...sellerKey,
      text(row.bank_name), text(row.account_number).replace(/[\s-]/g, ""), text(row.account_holder),
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        key, sellerKey: JSON.stringify(sellerKey),
        seller_name: row.seller_name || "판매자 미연결",
        seller_phone: row.seller_phone, seller_email: row.seller_email,
        bank_name: row.bank_name, account_number: row.account_number, account_holder: row.account_holder,
        hasAccount: hasPayoutAccount(row),
        items: [], settlement_ids: [], total_sale_amount: 0, total_fee_amount: 0,
        total_deduction: 0, total_net_amount: 0, completed_at: "",
      });
    }
    const group = groups.get(key);
    group.items.push(row);
    group.settlement_ids.push(row.id);
    group.total_sale_amount += amount(row.sale_amount);
    group.total_fee_amount += amount(row.fee_amount);
    group.total_deduction += settlementDeduction(row);
    group.total_net_amount += amount(row.net_amount);
    if (row.completed_at > group.completed_at) group.completed_at = row.completed_at;
  }
  return [...groups.values()].sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at) || b.total_net_amount - a.total_net_amount || a.key.localeCompare(b.key),
  );
}

// 교재로 검색해도 해당 셀러의 지급 묶음 전체를 반환한다. 부분 합계 송금을 방지한다.
export function filterSettlementPayouts(groups, search) {
  const query = text(search).toLocaleLowerCase("ko-KR");
  if (!query) return groups;
  return groups.filter((group) => [
    group.seller_name, group.seller_phone, group.seller_email, group.bank_name,
    group.account_number, group.account_holder,
    ...group.items.flatMap((item) => [item.book_title, item.book_option, item.order_number]),
  ].some((value) => text(value).toLocaleLowerCase("ko-KR").includes(query)));
}
