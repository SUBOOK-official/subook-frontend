// 2026-09-13 사용자 제공 더미 후기. 회원·주문·실구매 평점 원장에는 저장하지 않는다.
import { FEATURED_PRODUCTS } from "./publicFeaturedProducts.js";
import { REVIEW_PAGE_SIZE } from "./publicReviewsUtils.js";

const SAMPLE_CONTENTS = [
  {
    productKey: "j1-full",
    contents: [
      "아직 제대로 풀진 않았는데 문제랑 편집 퀄은 꽤 좋아 보입니다ㅎㅎ",
      "실모 부족해서 주문했는데 7회분이면 딱 적당한 거 같음 막판 실전연습용으로 괜찮은듯 배송도 빠름",
      "문제들이 막 억지로 꼬아놓은 느낌도 아니고 인쇄퀄이 좋음 OMR까지 포함돼 있어서 파이널 실모용으로 좋았슴니다",
      "인스타 광고 보고 기다렸다가 샀는데ㅋㅋ 배송이 엄청나게 빠르네여 이번 주말에 첫 회 풀어보겠습니다 감사합니다~~",
    ],
  },
  {
    productKey: "j1-mini",
    contents: [
      "9모 망하고 하루에 하나씩이라도 풀자 싶어서 샀어욥.. 분량이 많지 않아서 덜 부담스럽고 좋은 거 같아요",
      "오늘 첫날 거 풀어봤는데 등교해서 아침에 하나씩 풀기 괜찮을 것 같음",
      "국어 감 떨어지는 게 걱정이라 친구 추천으로 삼 한 달 동안 꾸준히 풀고 싶어서 샀는데 퀄리티가 괜찮아서 굿",
    ],
  },
];

export function getSampleReviews(productId) {
  return SAMPLE_CONTENTS.flatMap(({ productKey, contents }) => {
    const product = FEATURED_PRODUCTS.find((entry) => entry.key === productKey);
    if (!product?.productId) return [];
    return contents.map((content, index) => ({
      // 실제 후기(양수)·식스샵 이전 후기(음수)와 절대 충돌하지 않는 별도 id.
      id: `sample-${productKey}-${index + 1}`,
      author: `예시 작성자 ${index + 1}`,
      rating: 5,
      content,
      productId: product.productId,
      productTitle: product.title,
      itemCount: 1,
      isSameProduct: Number(productId) === product.productId,
      isSample: true,
      photoUrls: [],
      items: [],
      createdAt: null,
    }));
  });
}

// 실제 후기와 샘플의 정렬을 합친 페이지에 필요한 서버 구간만 읽는다.
// 앞쪽에 샘플이 최대 N개 끼어들 수 있으므로 offset-N부터 limit+N개면 충분하다.
export function getReviewPageRequest({ limit = REVIEW_PAGE_SIZE, offset = 0 } = {}, sampleCount = 0) {
  const pageLimit = Math.max(1, Math.min(REVIEW_PAGE_SIZE, Math.trunc(Number(limit)) || REVIEW_PAGE_SIZE));
  const pageOffset = Math.max(0, Math.trunc(Number(offset)) || 0);
  return {
    limit: pageLimit,
    offset: pageOffset,
    serverLimit: pageLimit + sampleCount,
    serverOffset: Math.max(0, pageOffset - sampleCount),
  };
}

function compareReviews(a, b) {
  const sameProductOrder = Number(b.isSameProduct) - Number(a.isSameProduct);
  if (sameProductOrder) return sameProductOrder;
  // 작성일이 없는 샘플은 같은 상품 그룹의 실구매 후기 뒤에 둔다.
  const dateOrder = (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  if (dateOrder) return dateOrder;
  if (a.isSample || b.isSample) return String(a.id).localeCompare(String(b.id));
  return b.id - a.id;
}

export function mergeSampleReviewPage(summary, samples, request) {
  const start = request.offset - request.serverOffset;
  return {
    ...summary,
    // 평균·별점 분포·동일 상품 실구매 수는 서버 원장 값 그대로 유지한다.
    purchaseTotal: summary.total,
    total: summary.total + samples.length,
    sampleCount: samples.length,
    items: [...summary.items, ...samples].sort(compareReviews).slice(start, start + request.limit),
  };
}
