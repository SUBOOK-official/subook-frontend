// 통합 구매 후기 섹션 — 모든 상품 상세에 같은 후기 풀을 노출한다.
// (상품별 후기는 1권=1행 구조상 대부분 0건이라 신뢰 신호가 되지 못함 — 2026-09-02 결정)
// productId를 주면 같은 상품이 포함된 주문의 후기가 위로 올라온다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StarIcon } from "./icons";
import { fetchPublicReviews } from "../lib/publicReviews";
import {
  REVIEW_PAGE_SIZE,
  formatReviewDate,
  formatReviewProductTitle,
  mergeReviewItems,
  normalizeReviewSummary,
} from "../lib/publicReviewsUtils";
import { getThumbnailImageUrl } from "../lib/storageImage";
import "./PublicReviews.css";

export function ReviewStars({ rating, size = 14, label }) {
  const value = Math.min(5, Math.max(0, Number(rating) || 0));
  return (
    <span
      aria-label={label ?? `별점 ${value}점`}
      className="public-review-stars"
      role="img"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          className={star <= value ? undefined : "public-review-stars__star--empty"}
          filled
          key={star}
          size={size}
        />
      ))}
    </span>
  );
}

// 상세페이지·섹션이 같은 데이터를 공유하도록 훅으로 분리
export function useProductReviews(productId) {
  const [summary, setSummary] = useState(() => normalizeReviewSummary(null));
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    const result = await fetchPublicReviews({ productId, limit: REVIEW_PAGE_SIZE, offset: 0 });
    if (requestIdRef.current !== requestId) {
      return;
    }
    setSummary(result.summary);
    setStatus(result.error ? "error" : "ready");
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    const requestId = requestIdRef.current;
    const result = await fetchPublicReviews({
      productId,
      limit: REVIEW_PAGE_SIZE,
      offset: summary.items.length,
    });
    if (requestIdRef.current !== requestId) {
      return;
    }
    if (!result.error) {
      setSummary((previous) => ({
        ...previous,
        total: result.summary.total,
        average: result.summary.average,
        ratingCounts: result.summary.ratingCounts,
        items: mergeReviewItems(previous.items, result.summary.items),
      }));
    }
    setIsLoadingMore(false);
  }, [isLoadingMore, productId, summary.items.length]);

  return { summary, status, isLoadingMore, loadMore, reload: load };
}

function RatingBars({ ratingCounts, total }) {
  return (
    <dl className="public-reviews__bars">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = ratingCounts?.[star] ?? 0;
        const ratio = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div className="public-reviews__bar-row" key={star}>
            <dt>{star}점</dt>
            <dd>
              <div aria-hidden="true" className="public-reviews__bar-track">
                <div className="public-reviews__bar-fill" style={{ width: `${ratio}%` }} />
              </div>
            </dd>
            <dd>{count}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function ReviewCard({ review, onOpenPhoto }) {
  const productTitle = formatReviewProductTitle(review.productTitle, review.itemCount);
  return (
    <li className="public-review-card">
      <div className="public-review-card__head">
        <ReviewStars rating={review.rating} />
        <span className="public-review-card__author">{review.author}</span>
        <span className="public-review-card__date">{formatReviewDate(review.createdAt)}</span>
        {review.isSameProduct ? (
          <span className="public-review-card__same-badge">이 교재 구매</span>
        ) : null}
      </div>
      {review.productId ? (
        <Link className="public-review-card__product" to={`/store/${review.productId}`}>
          {productTitle}
        </Link>
      ) : (
        <span className="public-review-card__product">{productTitle}</span>
      )}
      <p className="public-review-card__content">{review.content}</p>
      {review.photoUrls.length > 0 ? (
        <div className="public-review-card__photos">
          {review.photoUrls.map((url, index) => (
            <button
              aria-label={`후기 사진 ${index + 1} 크게 보기`}
              className="public-review-card__photo"
              key={url}
              onClick={() => onOpenPhoto?.(review.photoUrls, index, review.author)}
              type="button"
            >
              <img alt="" loading="lazy" src={getThumbnailImageUrl(url)} />
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function ProductReviewsSection({ reviews, onOpenPhoto }) {
  const { summary, status, isLoadingMore, loadMore } = reviews;
  const hasMore = summary.items.length < summary.total;

  return (
    <>
      <h3 className="public-detail-tab-content__heading">구매 후기</h3>

      {status === "loading" && summary.items.length === 0 ? (
        <>
          <div className="public-reviews__skeleton" />
          <div className="public-reviews__skeleton" />
        </>
      ) : status === "error" ? (
        <p className="public-reviews__error">후기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      ) : summary.total === 0 ? (
        <p className="public-reviews__empty">아직 등록된 후기가 없어요.</p>
      ) : (
        <>
          <div className="public-reviews__summary">
            <div className="public-reviews__score">
              <span className="public-reviews__score-value">
                {summary.average != null ? summary.average.toFixed(1) : "-"}
              </span>
              <ReviewStars rating={Math.round(summary.average ?? 0)} size={18} />
              <span className="public-reviews__score-count">후기 {summary.total}개</span>
            </div>
            <RatingBars ratingCounts={summary.ratingCounts} total={summary.total} />
          </div>
          <p className="public-reviews__note">구매확정 회원의 후기이며, 전체 교재 후기를 함께 표시합니다.</p>
          <ul className="public-reviews__list">
            {summary.items.map((review) => (
              <ReviewCard key={review.id} onOpenPhoto={onOpenPhoto} review={review} />
            ))}
          </ul>
          {hasMore ? (
            <button
              className="public-reviews__more"
              disabled={isLoadingMore}
              onClick={() => {
                void loadMore();
              }}
              type="button"
            >
              {isLoadingMore ? "불러오는 중..." : `후기 더보기 (${summary.items.length}/${summary.total})`}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

export default ProductReviewsSection;
