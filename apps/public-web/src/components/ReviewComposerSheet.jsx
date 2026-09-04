// 후기 작성 시트 — 마이페이지 구매확정 주문 카드에서 열린다.
// 주문 1건당 후기 1개. 별점 필수, 본문 10~500자, 사진 최대 3장(선택, 업로드 전 리사이즈).
// 한 번 작성한 후기는 수정·삭제할 수 없다(2026-09-02 결정) — 이미 쓴 주문은 읽기 전용으로 보여준다.
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveSheet } from "./PublicMypageUi.jsx";
import { CloseIcon, PlusIcon, StarIcon } from "./icons";
import {
  trackDialogClose,
  trackEvent,
  trackFormError,
  trackReviewSubmit,
} from "../lib/analytics";
import { createReview, removeReviewPhotos, uploadReviewPhotos } from "../lib/publicReviews";
import {
  REVIEW_CONTENT_MAX_LENGTH,
  REVIEW_CONTENT_MIN_LENGTH,
  REVIEW_PHOTO_MAX_COUNT,
  formatReviewDate,
  formatReviewProductTitle,
  getReviewRatingLabel,
  validateReviewDraft,
} from "../lib/publicReviewsUtils";
import {
  POINT_POLICY,
  formatPoints,
  isReviewRewardEligible,
} from "../lib/publicPointsUtils";
import { getThumbnailImageUrl } from "../lib/storageImage";
import "./PublicReviews.css";

const EMPTY_DRAFT = { rating: 0, content: "", photos: [] };

function OrderSummary({ order }) {
  const primaryItem = order?.items?.find((item) => !item.refundedAt) ?? order?.items?.[0] ?? null;
  const itemCount = useMemo(
    () =>
      (order?.items ?? [])
        .filter((item) => !item.refundedAt)
        .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    [order],
  );
  if (!order) {
    return null;
  }
  return (
    <div className="public-review-form__order">
      <div aria-hidden="true" className="public-review-form__order-thumb">
        {primaryItem?.coverImageUrl ? (
          <img alt="" src={getThumbnailImageUrl(primaryItem.coverImageUrl)} />
        ) : null}
      </div>
      <div>
        <p className="public-review-form__order-title">
          {formatReviewProductTitle(primaryItem?.title, itemCount)}
        </p>
        {order.reference ? (
          <p className="public-review-form__order-meta">주문번호 {order.reference}</p>
        ) : null}
      </div>
    </div>
  );
}

// 이미 작성한 후기 — 읽기 전용
function ReviewReadOnly({ order, review, onClose, open }) {
  const readViewTrackedRef = useRef(false);

  // GA4 작성 완료 후기 열람 — 한 번의 열림당 1회.
  useEffect(() => {
    if (!open) {
      readViewTrackedRef.current = false;
      return;
    }
    if (readViewTrackedRef.current) {
      return;
    }
    readViewTrackedRef.current = true;
    trackEvent("review_read_view", {
      orderId: order?.id != null ? String(order.id) : undefined,
      rating: Number(review?.rating) || 0,
    });
  }, [open, order?.id, review?.rating]);

  return (
    <ResponsiveSheet
      actions={
        <button
          className="public-auth-button public-auth-button--primary"
          onClick={() => {
            trackDialogClose("review_read", "close_button");
            onClose?.();
          }}
          type="button"
        >
          닫기
        </button>
      }
      analyticsName="review_read"
      eyebrow="내 후기"
      onClose={onClose}
      open={open}
      title="작성한 후기"
    >
      <div className="public-review-form">
        <OrderSummary order={order} />
        <div className="public-review-form__rating">
          <span aria-label={`별점 ${review.rating}점`} className="public-review-stars" role="img">
            {[1, 2, 3, 4, 5].map((star) => (
              <StarIcon
                className={star <= review.rating ? undefined : "public-review-stars__star--empty"}
                filled
                key={star}
                size={22}
              />
            ))}
          </span>
          <span className="public-review-form__rating-label">{getReviewRatingLabel(review.rating)}</span>
          <span className="public-review-form__order-meta">{formatReviewDate(review.createdAt)}</span>
        </div>
        <p className="public-review-card__content">{review.content}</p>
        {review.photoUrls?.length > 0 ? (
          <div className="public-review-form__photos">
            {review.photoUrls.map((url, index) => (
              <div className="public-review-form__photo" key={url}>
                <img alt={`첨부 사진 ${index + 1}`} src={getThumbnailImageUrl(url)} />
              </div>
            ))}
          </div>
        ) : null}
        <p className="public-review-form__hint">작성한 후기는 수정하거나 삭제할 수 없어요.</p>
      </div>
    </ResponsiveSheet>
  );
}

function ReviewComposerSheet({ open, order, review, user, onClose, onSaved }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [hoverRating, setHoverRating] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  // 시트를 열 때마다 초기화 (다른 주문으로 다시 열리는 경우 포함)
  useEffect(() => {
    if (open) {
      setDraft(EMPTY_DRAFT);
      setHoverRating(0);
      setErrorMessage("");
      setIsSubmitting(false);
    }
  }, [open, order?.id]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  if (review?.id) {
    return <ReviewReadOnly onClose={onClose} open={open} order={order} review={review} />;
  }

  const contentLength = draft.content.trim().length;
  const displayRating = hoverRating || draft.rating;
  let orderItemCount = 0;
  let activeItemCount = 0;
  let activeItemSubtotal = 0;
  for (const item of order?.items ?? []) {
    if (item.refundedAt) continue;
    orderItemCount += Number(item.quantity) || 1;
    activeItemCount += 1;
    // 마이페이지 주문 정규화에서 price는 order_items.total_price다.
    activeItemSubtotal += Number(item.price) || 0;
  }
  const rewardSubtotal = activeItemCount > 0 ? activeItemSubtotal : Number(order?.subtotal) || 0;
  const isRewardEligible = isReviewRewardEligible(rewardSubtotal);

  // GA4 dialog_close에 실을 작성 진행도 — 닫는 시점 값이 필요해 함수로 넘긴다.
  const getAnalyticsCloseExtra = () => ({
    hadRating: draft.rating > 0,
    contentLength: draft.content.trim().length,
    photoCount: draft.photos.length,
  });

  const handlePickFiles = (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    const remaining = REVIEW_PHOTO_MAX_COUNT - draft.photos.length;
    if (remaining <= 0) {
      setErrorMessage(`사진은 최대 ${REVIEW_PHOTO_MAX_COUNT}장까지 첨부할 수 있어요.`);
      // GA4 사진 첨부 거절 — 장수 상한 초과
      trackEvent("review_photo_reject", {
        errorReason: "max_count",
        photoCount: draft.photos.length,
      });
      return;
    }
    const accepted = files.filter((file) => file.type.startsWith("image/")).slice(0, remaining);
    if (accepted.length === 0) {
      setErrorMessage("이미지 파일만 첨부할 수 있어요.");
      // GA4 사진 첨부 거절 — 이미지가 아닌 파일
      trackEvent("review_photo_reject", {
        errorReason: "not_image",
        photoCount: draft.photos.length,
      });
      return;
    }
    if (accepted.length < files.filter((file) => file.type.startsWith("image/")).length) {
      // GA4 사진 첨부 일부만 반영 — 남은 슬롯보다 많이 골랐을 때
      trackEvent("review_photo_reject", {
        errorReason: "truncated",
        photoCount: draft.photos.length,
      });
    }
    const nextPhotos = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return {
        key: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl,
      };
    });
    setErrorMessage("");
    setDraft((previous) => ({ ...previous, photos: [...previous.photos, ...nextPhotos] }));
    // GA4 사진 첨부 성공
    trackEvent("review_photo_add", {
      addedCount: nextPhotos.length,
      photoCount: draft.photos.length + nextPhotos.length,
    });
  };

  const handleRemovePhoto = (key) => {
    setDraft((previous) => ({
      ...previous,
      photos: previous.photos.filter((photo) => {
        if (photo.key !== key) {
          return true;
        }
        if (photo.previewUrl && objectUrlsRef.current.has(photo.previewUrl)) {
          URL.revokeObjectURL(photo.previewUrl);
          objectUrlsRef.current.delete(photo.previewUrl);
        }
        return false;
      }),
    }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }
    const validationMessage = validateReviewDraft({
      rating: draft.rating,
      content: draft.content,
      photoCount: draft.photos.length,
    });
    if (validationMessage) {
      setErrorMessage(validationMessage);
      // GA4 후기 검증 실패 — 본문은 보내지 않고 길이·사유만 남긴다.
      const ratingValue = Number(draft.rating);
      const isRatingInvalid =
        !Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5;
      const isPhotoOver = draft.photos.length > REVIEW_PHOTO_MAX_COUNT;
      const fieldName = isRatingInvalid ? "rating" : isPhotoOver ? "photos" : "content";
      const errorReason = isRatingInvalid
        ? "required"
        : isPhotoOver
          ? "max_count"
          : contentLength < REVIEW_CONTENT_MIN_LENGTH
            ? "too_short"
            : "too_long";
      trackFormError("review", fieldName, errorReason, { contentLength });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    let uploadedUrls = [];
    try {
      const files = draft.photos.map((photo) => photo.file).filter(Boolean);
      if (files.length > 0) {
        uploadedUrls = await uploadReviewPhotos({ userId: user?.id, orderId: order?.id, files });
      }

      const result = await createReview({
        orderId: order.id,
        rating: draft.rating,
        content: draft.content.trim(),
        photoUrls: uploadedUrls,
      });

      if (result.error) {
        // RPC 실패 시 방금 올린 사진은 고아가 되지 않게 정리
        await removeReviewPhotos(uploadedUrls);
        setErrorMessage(result.error.message || "후기를 저장하지 못했어요.");
        // GA4 후기 등록 실패 — RPC 거부(중복·미확정 주문 등)
        trackEvent("review_submit_fail", {
          errorReason: "rpc",
          errorMessage: result.error.message ?? "",
          photoCount: uploadedUrls.length,
          rating: draft.rating,
        });
        setIsSubmitting(false);
        return;
      }

      trackReviewSubmit({
        orderId: order?.id,
        rating: draft.rating,
        photoCount: uploadedUrls.length,
        mode: "create",
      });
      setIsSubmitting(false);
      onSaved?.(result.review);
    } catch (error) {
      await removeReviewPhotos(uploadedUrls);
      setErrorMessage(error?.message || "후기를 저장하지 못했어요.");
      // GA4 후기 등록 실패 — 사진 업로드 단계 예외
      trackEvent("review_submit_fail", {
        errorReason: "photo_upload",
        errorMessage: error?.message ?? "",
        photoCount: draft.photos.length,
        rating: draft.rating,
      });
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveSheet
      actions={
        <>
          <button
            className="public-auth-button public-auth-button--secondary"
            disabled={isSubmitting}
            onClick={() => {
              // GA4 — 푸터 취소는 시트가 잡지 못하므로 여기서 기록.
              trackDialogClose("review_composer", "cancel_button", getAnalyticsCloseExtra());
              onClose?.();
            }}
            type="button"
          >
            취소
          </button>
          <button
            className="public-auth-button public-auth-button--primary"
            disabled={isSubmitting}
            onClick={() => {
              void handleSubmit();
            }}
            type="button"
          >
            {isSubmitting ? "저장 중..." : "후기 등록"}
          </button>
        </>
      }
      analyticsCloseExtra={getAnalyticsCloseExtra}
      analyticsExtra={{
        orderId: order?.id != null ? String(order.id) : undefined,
        itemCount: orderItemCount,
      }}
      analyticsName="review_composer"
      eyebrow="후기 작성"
      onClose={isSubmitting ? () => {} : onClose}
      open={open}
      title="이번 구매는 어떠셨나요?"
    >
      <div className="public-review-form">
        <OrderSummary order={order} />

        <div>
          <span className="public-review-form__label" id="review-rating-label">
            별점
          </span>
          <div className="public-review-form__rating">
            <div
              aria-labelledby="review-rating-label"
              className="public-review-form__rating-stars"
              onMouseLeave={() => setHoverRating(0)}
              role="radiogroup"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  aria-checked={draft.rating === star}
                  aria-label={`${star}점 ${getReviewRatingLabel(star)}`}
                  className={`public-review-form__star${star <= displayRating ? " is-active" : ""}`}
                  key={star}
                  onClick={() => {
                    setDraft((previous) => ({ ...previous, rating: star }));
                    // GA4 별점 선택 — 재선택(변경) 여부까지 남긴다.
                    trackEvent("review_rating_set", {
                      rating: star,
                      isChange: draft.rating > 0 && draft.rating !== star,
                    });
                  }}
                  onMouseEnter={() => setHoverRating(star)}
                  role="radio"
                  type="button"
                >
                  <StarIcon filled size={30} />
                </button>
              ))}
            </div>
            <span className="public-review-form__rating-label">
              {getReviewRatingLabel(displayRating)}
            </span>
          </div>
        </div>

        <div>
          <label className="public-review-form__label" htmlFor="review-content">
            후기
          </label>
          <textarea
            className="public-review-form__textarea"
            id="review-content"
            maxLength={REVIEW_CONTENT_MAX_LENGTH + 50}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, content: event.target.value }))
            }
            placeholder={`교재 상태, 배송, 포장은 어땠나요? (${REVIEW_CONTENT_MIN_LENGTH}자 이상)`}
            value={draft.content}
          />
          <p
            className={`public-review-form__counter${
              contentLength > REVIEW_CONTENT_MAX_LENGTH ? " is-over" : ""
            }`}
          >
            {contentLength}/{REVIEW_CONTENT_MAX_LENGTH}자
          </p>
        </div>

        <div>
          <span className="public-review-form__label">사진 (선택, 최대 {REVIEW_PHOTO_MAX_COUNT}장)</span>
          <div className="public-review-form__photos">
            {draft.photos.map((photo, index) => (
              <div className="public-review-form__photo" key={photo.key}>
                <img alt={`첨부 사진 ${index + 1}`} src={photo.previewUrl} />
                <button
                  aria-label={`사진 ${index + 1} 삭제`}
                  className="public-review-form__photo-remove"
                  disabled={isSubmitting}
                  onClick={() => handleRemovePhoto(photo.key)}
                  type="button"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
            {draft.photos.length < REVIEW_PHOTO_MAX_COUNT ? (
              <button
                className="public-review-form__photo-add"
                disabled={isSubmitting}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <PlusIcon size={18} />
                사진 추가
              </button>
            ) : null}
          </div>
          <input
            accept="image/*"
            className="public-review-form__photo-input"
            multiple
            onChange={handlePickFiles}
            ref={fileInputRef}
            type="file"
          />
        </div>

        <p className="public-review-form__hint">
          {isRewardEligible
            ? `글 후기 ${formatPoints(POINT_POLICY.earnText)} · 사진 후기 ${formatPoints(POINT_POLICY.earnPhoto)} 적립. `
            : `상품금액 ${POINT_POLICY.minReviewOrderSubtotal.toLocaleString("ko-KR")}원 이상 주문부터 후기 포인트가 적립돼요. `}
          등록한 후기는 수정하거나 삭제할 수 없으니 한 번 더 확인해 주세요.
        </p>

        {errorMessage ? (
          <p className="public-review-form__error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </ResponsiveSheet>
  );
}

export default ReviewComposerSheet;
