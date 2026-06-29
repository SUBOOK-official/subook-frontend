// 상품 상세 페이지의 옵션 선택 로직 — 회차(option) 단위 그룹핑 + 다중 선택 할당.
//
// 데이터 모델 배경(중요):
//   단일재고 모델에서 books 한 row = 물리적으로 1권. 같은 회차(예: "확률과 통계")의
//   책이 N권 입고되면 books row도 N개가 되고, 상세 RPC(get_public_store_product_detail)는
//   이들을 option_books 배열의 개별 항목으로 그대로 내려준다. 그래서 가공 없이 dropdown에
//   뿌리면 "S (새 책) · 확률과 통계"가 재고 수만큼 중복으로 보였다.
//
// 이 모듈은 그 개별 book들을 회차(option) 기준으로 묶어:
//   - 중복 회차를 하나로 합치고(라벨에서 등급 'S (새 책)' 제거)
//   - 회차별 남은 재고 수("N개 남음")를 계산하며
//   - 사용자가 여러 회차를 골라 담을 때, 회차별 수량만큼 distinct한 book_id를 할당한다.
//
// 왜 distinct book_id인가:
//   백엔드 create_order는 book_id별 수량을 반드시 1로 강제한다(권당 1권). "기하 2권"은
//   같은 book의 수량 2가 아니라 서로 다른 2개의 기하 book_id로 주문/장바구니에 들어가야 한다.

// 회차 라벨이 비어 있는(무옵션) 단권 상품을 위한 기본 그룹 키/라벨.
const DEFAULT_GROUP_KEY = "";
const DEFAULT_GROUP_LABEL = "기본 옵션";

function normalizeVariantKey(option) {
  const label = typeof option?.option === "string" ? option.option.trim() : "";
  return label || DEFAULT_GROUP_KEY;
}

// 회차(option)별로 개별 book을 묶는다. 입력은 storefront.js가 정규화한 option row 배열.
// 반환: [{ key, label, books, availableBooks, availableCount, soldOut, unitPrice, originalPrice }]
// books 배열은 RPC가 내려준 정렬(재고 우선 → 등급 → 가격)을 그대로 유지하므로,
// availableBooks 앞에서부터 할당하면 가장 저렴/좋은 등급부터 빠진다.
function groupOptionsByVariant(options = []) {
  const orderedGroups = [];
  const groupByKey = new Map();

  for (const option of Array.isArray(options) ? options : []) {
    if (!option || option.id === null || option.id === undefined) {
      continue;
    }
    const key = normalizeVariantKey(option);
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        key,
        label: key || DEFAULT_GROUP_LABEL,
        books: [],
      };
      groupByKey.set(key, group);
      orderedGroups.push(group);
    }
    group.books.push(option);
  }

  return orderedGroups.map((group) => {
    const availableBooks = group.books.filter((book) => !book.isSoldOut);
    const availablePrices = availableBooks
      .map((book) => book.price)
      .filter((price) => typeof price === "number" && Number.isFinite(price));
    const representativeBook = availableBooks[0] ?? group.books[0] ?? null;
    const unitPrice =
      availablePrices.length > 0
        ? Math.min(...availablePrices)
        : representativeBook?.price ?? null;

    return {
      key: group.key,
      label: group.label,
      books: group.books,
      availableBooks,
      availableCount: availableBooks.length,
      soldOut: availableBooks.length === 0,
      unitPrice,
      originalPrice: representativeBook?.originalPrice ?? null,
    };
  });
}

// 선택(selections: [{ key, quantity }])을 실제 distinct book 목록으로 변환한다.
// 회차별 수량은 그 회차의 남은 재고로 캡되며, 같은 book이 두 번 잡히지 않도록
// availableBooks를 앞에서부터 slice 한다.
function allocateSelectedBooks(groups = [], selections = []) {
  const groupByKey = new Map((Array.isArray(groups) ? groups : []).map((group) => [group.key, group]));
  const allocated = [];

  for (const selection of Array.isArray(selections) ? selections : []) {
    const group = groupByKey.get(selection?.key);
    if (!group) {
      continue;
    }
    const requested = Number.isFinite(selection?.quantity) ? Math.trunc(selection.quantity) : 0;
    const quantity = Math.max(0, Math.min(requested, group.availableCount));
    for (let index = 0; index < quantity; index += 1) {
      const book = group.availableBooks[index];
      if (book) {
        allocated.push(book);
      }
    }
  }

  return allocated;
}

// 할당된 book들의 합계 금액(= 실제 주문/담기 금액). 회차 내 가격이 섞여 있어도 정확.
function sumAllocatedBookPrices(books = []) {
  return (Array.isArray(books) ? books : []).reduce(
    (sum, book) => sum + (typeof book?.price === "number" ? book.price : 0),
    0,
  );
}

// 선택된 한 회차 라인의 표시 금액 — 그 회차에서 앞 quantity권의 실제 가격 합.
function getLineTotalForGroup(group, quantity) {
  if (!group) {
    return 0;
  }
  const safeQuantity = Math.max(0, Math.min(Number(quantity) || 0, group.availableCount));
  return sumAllocatedBookPrices(group.availableBooks.slice(0, safeQuantity));
}

// 바로구매용 order item 배열. PublicOrderPage가 기대하는 형태(권당 quantity:1)로 만든다.
function buildOrderItemsFromBooks(product, books = []) {
  return (Array.isArray(books) ? books : []).map((book) => ({
    bookId: book.id,
    productId: product?.productId ?? null,
    quantity: 1,
    title: product?.title ?? "",
    optionLabel: book.option ?? "",
    conditionGrade: book.conditionGrade ?? "",
    coverImageUrl: book.coverImageUrl ?? product?.coverImageUrl ?? "",
    price: book.price ?? null,
    originalPrice: book.originalPrice ?? product?.originalPrice ?? null,
  }));
}

// 장바구니 담기용 인자 배열. cart.addToCart를 book 단위로 호출한다(권당 quantity:1).
function buildCartArgsFromBooks(product, books = []) {
  return (Array.isArray(books) ? books : []).map((book) => ({
    bookId: book.id,
    productId: product?.productId ?? null,
    quantity: 1,
    productMeta: {
      title: product?.title ?? null,
      subject: product?.subject ?? null,
      brand: product?.brand ?? null,
      optionLabel: book.option ?? null,
      conditionGrade: book.conditionGradeLabel ?? book.conditionGrade ?? null,
      coverImageUrl: book.coverImageUrl ?? product?.coverImageUrl ?? null,
      price: book.price ?? null,
    },
  }));
}

export {
  DEFAULT_GROUP_KEY,
  DEFAULT_GROUP_LABEL,
  allocateSelectedBooks,
  buildCartArgsFromBooks,
  buildOrderItemsFromBooks,
  getLineTotalForGroup,
  groupOptionsByVariant,
  sumAllocatedBookPrices,
};
