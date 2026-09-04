// 통합 구매 후기 섹션 — 모든 상품 상세에 같은 후기 풀을 노출한다.
// (상품별 후기는 1권=1행 구조상 대부분 0건이라 신뢰 신호가 되지 못함 — 2026-09-02 결정)
// productId를 주면 같은 상품이 포함된 주문의 후기가 위로 올라온다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InfoIcon, StarIcon } from "./icons";
import { ResponsiveSheet } from "./PublicMypageUi.jsx";
import {
  trackEmptyState,
  trackEvent,
  trackException,
  trackImageZoom,
  trackSelectItem,
} from "../lib/analytics";
import { useInViewOnce } from "../lib/useInViewOnce";
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
    // GA4 exception — 후기 목록 로드 실패(빈 후기와 구분)
    if (result.error) {
      trackException("reviews_load_failed", {
        ...(productId != null ? { itemId: String(productId) } : {}),
      });
    }
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
    } else {
      // GA4 exception — 더보기 실패는 화면에 아무 표시가 없어 계측으로만 보인다
      trackException("reviews_load_more_failed", {
        ...(productId != null ? { itemId: String(productId) } : {}),
      });
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

// 통합 후기임을 먼저 알려주는 콜아웃 — "이 책의 평점"으로 오해하지 않게.
function UnifiedNotice({ sameProductCount }) {
  return (
    <div className="public-reviews__callout" role="note">
      <InfoIcon className="public-reviews__callout-icon" size={18} />
      <div>
        <p className="public-reviews__callout-title">수북에서 교재를 구매한 모든 분들의 후기입니다</p>
        <p className="public-reviews__callout-body">
          이 교재 하나에 대한 후기가 아니라, <strong>수북 전체 구매 후기</strong>를 모아 보여드려요.
          검수 상태·배송·포장이 어땠는지 참고해 주세요. 이 교재를 구매한 분의 후기는{" "}
          <strong>이 교재 구매</strong> 표시와 함께 맨 위에 보여드립니다.
        </p>
        {sameProductCount > 0 ? (
          <span className="public-reviews__callout-chip">
            <StarIcon filled size={12} />이 교재 후기 {sameProductCount}개
          </span>
        ) : null}
      </div>
    </div>
  );
}

// "○○○ 외 N권" 후기의 구매 교재 전체 목록
function ReviewItemsSheet({ review, onClose }) {
  const items = review?.items ?? [];
  return (
    <ResponsiveSheet
      eyebrow="구매 후기"
      onClose={onClose}
      open={Boolean(review)}
      title={review ? `${review.author}님이 구매한 교재 ${review.itemCount}권` : ""}
    >
      <ul className="public-review-items">
        {items.map((item) => {
          const body = (
            <>
              <div aria-hidden="true" className="public-review-items__thumb">
                {item.coverImageUrl ? (
                  <img alt="" src={getThumbnailImageUrl(item.coverImageUrl)} />
                ) : null}
              </div>
              <div>
                <p className="public-review-items__title">{item.title}</p>
                <p className="public-review-items__meta">
                  {item.quantity > 1 ? `${item.quantity}권` : "1권"}
                  {item.productId ? " · 상품 보기" : ""}
                </p>
              </div>
            </>
          );
          return (
            <li key={`${item.productId ?? "x"}-${item.title}`}>
              {item.productId ? (
                <Link
                  className="public-review-items__row"
                  onClick={() => {
                    // GA4 select_item — 후기 시트에서 구매 교재로 이동
                    trackSelectItem("후기 구매 교재", {
                      productId: item.productId,
                      title: item.title,
                      quantity: item.quantity ?? 1,
                    });
                    onClose?.();
                  }}
                  to={`/store/${item.productId}`}
                >
                  {body}
                </Link>
              ) : (
                <div className="public-review-items__row">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </ResponsiveSheet>
  );
}

function ReviewCard({ review, onOpenPhoto, onOpenItems, productId }) {
  const productTitle = formatReviewProductTitle(review.productTitle, review.itemCount);
  const hasMultiple = review.itemCount > 1 && review.items.length > 0;
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
      {hasMultiple ? (
        <button
          className="public-review-card__product public-review-card__product--button"
          onClick={() => {
            // GA4 — "외 N권" 구매 교재 목록 열기
            trackEvent("review_items_open", {
              reviewId: String(review.id),
              itemCount: review.itemCount,
              ...(productId != null ? { itemId: String(productId) } : {}),
            });
            onOpenItems?.(review);
          }}
          type="button"
        >
          {productTitle}
        </button>
      ) : review.productId ? (
        <Link
          className="public-review-card__product"
          onClick={() => {
            // GA4 select_item — 후기 카드에서 그 교재 상세로 이동
            trackSelectItem("구매 후기", {
              productId: review.productId,
              title: review.productTitle,
              quantity: 1,
            });
          }}
          to={`/store/${review.productId}`}
        >
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
              onClick={() => {
                // GA4 product_image_zoom — 히어로 확대와 같은 이벤트를 zoom_source로 가른다
                trackImageZoom(productId, {
                  zoomSource: "review",
                  reviewId: String(review.id),
                  photoIndex: index,
                  photoCount: review.photoUrls.length,
                  isSameProduct: Boolean(review.isSameProduct),
                });
                onOpenPhoto?.(review.photoUrls, index, review.author);
              }}
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

function ProductReviewsSection({ reviews, onOpenPhoto, productId }) {
  const { summary, status, isLoadingMore, loadMore } = reviews;
  const [itemsReview, setItemsReview] = useState(null);
  const hasMore = summary.items.length < summary.total;
  const headingRef = useRef(null);

  // GA4 view_review_list / empty_state_view — 후기 섹션이 실제로 화면에 들어온 순간 1회.
  // (상세페이지 최하단이라 마운트 기준으로 세면 대부분 안 본 노출이 섞인다)
  useInViewOnce(
    headingRef,
    () => {
      const itemIdParam = productId != null ? { itemId: String(productId) } : {};
      if (summary.total === 0) {
        trackEmptyState("reviews", itemIdParam);
        return;
      }
      trackEvent("view_review_list", {
        reviewCount: summary.total,
        ...(summary.average != null
          ? { averageRating: Number(summary.average.toFixed(1)) }
          : {}),
        sameProductCount: summary.sameProductCount ?? 0,
        ...itemIdParam,
      });
    },
    { enabled: status === "ready", resetKey: productId },
  );

  return (
    <>
      <h3 className="public-detail-tab-content__heading" ref={headingRef}>
        수북 구매 후기
      </h3>

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
          <UnifiedNotice sameProductCount={summary.sameProductCount} />
          <div className="public-reviews__summary">
            <div className="public-reviews__score">
              <span className="public-reviews__score-value">
                {summary.average != null ? summary.average.toFixed(1) : "-"}
              </span>
              <ReviewStars rating={Math.round(summary.average ?? 0)} size={18} />
              <span className="public-reviews__score-count">전체 후기 {summary.total}개</span>
            </div>
            <RatingBars ratingCounts={summary.ratingCounts} total={summary.total} />
          </div>
          <ul className="public-reviews__list">
            {summary.items.map((review) => (
              <ReviewCard
                key={review.id}
                onOpenItems={setItemsReview}
                onOpenPhoto={onOpenPhoto}
                productId={productId}
                review={review}
              />
            ))}
          </ul>
          {hasMore ? (
            <button
              className="public-reviews__more"
              disabled={isLoadingMore}
              onClick={() => {
                // GA4 — 후기 더보기(현재 노출 수 = offset)
                trackEvent("review_load_more", {
                  offset: summary.items.length,
                  totalCount: summary.total,
                  ...(productId != null ? { itemId: String(productId) } : {}),
                });
                void loadMore();
              }}
              type="button"
            >
              {isLoadingMore ? "불러오는 중..." : `후기 더보기 (${summary.items.length}/${summary.total})`}
            </button>
          ) : null}
        </>
      )}

      <ReviewItemsSheet onClose={() => setItemsReview(null)} review={itemsReview} />
    </>
  );
}

export default ProductReviewsSection;
