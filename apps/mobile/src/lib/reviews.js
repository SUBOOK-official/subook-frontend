import { fetchPublicReviewsPage } from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import { getPartnerReviews, getReviewPageRequest, mergePartnerReviewPage } from "../../../public-web/src/lib/publicPartnerReviews.js";
import { REVIEW_PAGE_SIZE, normalizeReviewSummary } from "../../../public-web/src/lib/publicReviewsUtils.js";
import { supabase } from "./supabase.js";

export { REVIEW_PAGE_SIZE };

// 통합 구매 후기 한 쪽(웹 상품 상세의 fetchPublicReviews와 같은 규칙).
// productId를 주면 같은 교재가 포함된 주문의 후기가 위로 올라온다.
export async function loadReviewPage({ productId, offset = 0 }) {
  if (!supabase) return normalizeReviewSummary(null);
  const partnerReviews = getPartnerReviews(productId);
  const request = getReviewPageRequest({ limit: REVIEW_PAGE_SIZE, offset }, partnerReviews.length);
  const data = await fetchPublicReviewsPage(supabase, { productId, limit: request.serverLimit, offset: request.serverOffset });
  return mergePartnerReviewPage(normalizeReviewSummary(data), partnerReviews, request);
}
