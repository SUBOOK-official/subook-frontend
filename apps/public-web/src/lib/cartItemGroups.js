// 장바구니 표시용 그룹핑 — 단일재고 모델 보정.
//
// 배경: 단일재고라 같은 회차(option)·등급의 책이 여러 권이면 cart_items가 book_id별로
// 따로 쌓인다. 사용자에겐 "기하 1권 / 기하 1권"이 아니라 "기하 2권 (−/+)" 한 줄로 보여야
// 한다. 이 모듈은 cart_item을 (상품·회차·등급·가격) 기준으로 묶고, 회차별로 더 담을 수 있는
// 재고 book을 골라내는 순수 함수를 제공한다.
//
// 수량 +/-는 단일재고라 한 book_id의 quantity를 바꾸는 게 아니라:
//   - "-" → 그 그룹의 cart_item(book_id) 하나를 삭제
//   - "+" → 같은 회차·등급의 "재고 있는 다른 book_id"를 새로 담기
// 로 구현된다. 그래서 "+"는 상세 RPC가 주는 회차별 재고 book 목록이 필요하다.

function normalizeCartGrade(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "A+" || normalized === "A_PLUS" || normalized === "A PLUS") {
    return "A_PLUS";
  }
  if (normalized === "S" || normalized === "A") {
    return normalized;
  }
  return normalized;
}

function isPurchasableCartItem(item) {
  return !item?.is_sold_out && item?.price !== null && item?.price !== undefined;
}

// 같은 (상품·회차·등급·가격) cart_item을 한 그룹으로 묶는다. 입력 순서(최신순)를 유지한다.
function groupCartItems(items = []) {
  const orderedGroups = [];
  const groupByKey = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const grade = normalizeCartGrade(item.condition_grade);
    const optionLabel = item.option_label ?? "";
    const key = [item.product_id, optionLabel, grade, item.price ?? ""].join("::");
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        key,
        productId: item.product_id,
        optionLabel: item.option_label ?? null,
        grade,
        items: [],
      };
      groupByKey.set(key, group);
      orderedGroups.push(group);
    }
    group.items.push(item);
  }

  return orderedGroups.map((group) => {
    const purchasableItems = group.items.filter(isPurchasableCartItem);
    const representative = group.items[0] ?? null;
    const unitPrice = representative?.price ?? null;
    const count = purchasableItems.length;
    const lineTotal = purchasableItems.reduce((sum, item) => sum + (item.price ?? 0), 0);
    const isSoldOut = count === 0 && group.items.some((item) => item.is_sold_out);
    const isPriceMissing = unitPrice === null || unitPrice === undefined;

    return {
      key: group.key,
      productId: group.productId,
      optionLabel: group.optionLabel,
      grade: group.grade,
      items: group.items,
      purchasableItems,
      allItemIds: group.items.map((item) => item.id),
      purchasableItemIds: purchasableItems.map((item) => item.id),
      bookIds: group.items.map((item) => item.book_id),
      representative,
      unitPrice,
      count,
      lineTotal,
      isSoldOut,
      isPriceMissing,
    };
  });
}

// 한 그룹에 더 담을 수 있는 재고 book 목록. stockBooks는 상세 RPC에서 뽑은
// 재고 있는 옵션 book들([{ bookId, option, grade, price }], grade는 normalize된 값).
// 이미 장바구니에 있는 book_id(cartBookIds)는 제외한다.
function getAddableBooks(group, stockBooks = [], cartBookIds = []) {
  if (!group) return [];
  const inCart = new Set((Array.isArray(cartBookIds) ? cartBookIds : []).map((id) => String(id)));
  return (Array.isArray(stockBooks) ? stockBooks : []).filter(
    (book) =>
      book &&
      (book.option ?? "") === (group.optionLabel ?? "") &&
      normalizeCartGrade(book.grade) === group.grade &&
      !inCart.has(String(book.bookId)),
  );
}

export {
  getAddableBooks,
  groupCartItems,
  isPurchasableCartItem,
  normalizeCartGrade,
};
