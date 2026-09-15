// 주문 품목을 같은 교재(주문 당시 제목) 단위로 묶는다 (2026-09-15).
// 한 고객이 같은 교재의 여러 회차를 한꺼번에 사는 주문이 많아, 한 줄씩 나열하면
// 총 권수·교재 수를 파악하기 어렵다는 운영 피드백 대응.
// 환불된 품목은 묶음 안에 남기되(이력 확인용) 권수·금액 합계에서는 뺀다.

const optionCollator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function quantityOf(item) {
  const quantity = Number(item?.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function amountOf(item) {
  const total = Number(item?.total_price);
  if (Number.isFinite(total)) return total;
  const unit = Number(item?.unit_price);
  return Number.isFinite(unit) ? unit * quantityOf(item) : 0;
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

export function groupOrderItems(items = []) {
  const groups = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const title = String(item?.title ?? "").trim();
    const key = title || `item-${item?.id}`;
    if (!groups.has(key)) {
      groups.set(key, { key, title: title || "제목 없음", items: [] });
    }
    groups.get(key).items.push(item);
  }

  return [...groups.values()].map((group) => {
    const sortedItems = [...group.items].sort((a, b) => {
      const byOption = optionCollator.compare(String(a.option_label ?? ""), String(b.option_label ?? ""));
      return byOption !== 0 ? byOption : Number(a.id) - Number(b.id);
    });
    const activeItems = sortedItems.filter((item) => !item.refunded_at);
    const grades = uniqueValues(sortedItems.map((item) => item.condition_grade));
    const unitPrices = uniqueValues(activeItems.map((item) => item.unit_price));

    return {
      key: group.key,
      title: group.title,
      items: sortedItems,
      bookCount: activeItems.reduce((sum, item) => sum + quantityOf(item), 0),
      amount: activeItems.reduce((sum, item) => sum + amountOf(item), 0),
      refundedCount: sortedItems.length - activeItems.length,
      missingLocationCount: activeItems.filter((item) => !item.book_location).length,
      // 묶음 전체가 같은 값이면 제목 옆에 한 번만, 섞여 있으면 품목마다 표시한다
      sharedGrade: grades.length === 1 ? grades[0] : null,
      sharedUnitPrice: unitPrices.length === 1 ? Number(unitPrices[0]) : null,
    };
  });
}

export function summarizeOrderItems(items = []) {
  const groups = groupOrderItems(items);
  return {
    groups,
    bookCount: groups.reduce((sum, group) => sum + group.bookCount, 0),
    titleCount: groups.filter((group) => group.bookCount > 0).length,
    refundedCount: groups.reduce((sum, group) => sum + group.refundedCount, 0),
    missingLocationCount: groups.reduce((sum, group) => sum + group.missingLocationCount, 0),
  };
}
