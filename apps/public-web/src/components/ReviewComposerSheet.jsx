// 후기 작성/수정 시트 — 마이페이지 구매확정 주문 카드에서 열린다.
// 주문 1건당 후기 1개. 별점 필수, 본문 10~500자, 사진 최대 3장(선택, 업로드 전 리사이즈).
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog, ResponsiveSheet } from "./PublicMypageUi.jsx";
import { CloseIcon, PlusIcon, StarIcon } from "./icons";
import { trackReviewSubmit } from "../lib/analytics";
import {
  createReview,
  deleteReview,
  removeReviewPhotos,
  updateReview,
  uploadReviewPhotos,
} from "../lib/publicReviews";
import {
  REVIEW_CONTENT_MAX_LENGTH,
  REVIEW_CONTENT_MIN_LENGTH,
  REVIEW_PHOTO_MAX_COUNT,
  formatReviewProductTitle,
  getReviewRatingLabel,
  validateReviewDraft,
} from "../lib/publicReviewsUtils";
import { getThumbnailImageUrl } from "../lib/storageImage";
import "./PublicReviews.css";

function buildInitialDraft(review) {
  return {
    rating: review?.rating ?? 0,
    content: review?.content ?? "",
    // { key, url?, file?, previewUrl } — url=기존 업로드본, file=새로 고른 파일
    photos: (review?.photoUrls ?? []).map((url) => ({ key: url, url, previewUrl: url })),
  };
}

function ReviewComposerSheet({ open, order, review, user, onClose, onSaved, onDeleted }) {
  const [draft, setDraft] = useState(() => buildInitialDraft(review));
  const [hoverRating, setHoverRating] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());

  const isEditing = Boolean(review?.id);
  const primaryItem = order?.items?.find((item) => !item.refundedAt) ?? order?.items?.[0] ?? null;
  const itemCount = useMemo(
    () =>
      (order?.items ?? [])
        .filter((item) => !item.refundedAt)
        .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    [order],
  );

  // 시트를 열 때마다 초기화 (다른 주문으로 다시 열리는 경우 포함)
  useEffect(() => {
    if (open) {
      setDraft(buildInitialDraft(review));
      setHoverRating(0);
      setErrorMessage("");
      setIsSubmitting(false);
      setIsDeleteConfirmOpen(false);
    }
  }, [open, review, order?.id]);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const contentLength = draft.content.trim().length;
  const displayRating = hoverRating || draft.rating;

  const handlePickFiles = (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    const remaining = REVIEW_PHOTO_MAX_COUNT - draft.photos.length;
    if (remaining <= 0) {
      setErrorMessage(`사진은 최대 ${REVIEW_PHOTO_MAX_COUNT}장까지 첨부할 수 있어요.`);
      return;
    }
    const accepted = files.filter((file) => file.type.startsWith("image/")).slice(0, remaining);
    if (accepted.length === 0) {
      setErrorMessage("이미지 파일만 첨부할 수 있어요.");
      return;
    }
    const nextPhotos = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return { key: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file, previewUrl };
    });
    setErrorMessage("");
    setDraft((previous) => ({ ...previous, photos: [...previous.photos, ...nextPhotos] }));
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
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    let uploadedUrls = [];
    try {
      const newFiles = draft.photos.filter((photo) => photo.file).map((photo) => photo.file);
      if (newFiles.length > 0) {
        uploadedUrls = await uploadReviewPhotos({ userId: user?.id, orderId: order?.id, files: newFiles });
      }
      // 기존 URL은 순서 유지, 새 파일은 업로드 결과로 치환
      let uploadIndex = 0;
      const photoUrls = draft.photos.map((photo) => {
        if (photo.url) {
          return photo.url;
        }
        const url = uploadedUrls[uploadIndex];
        uploadIndex += 1;
        return url;
      }).filter(Boolean);

      const payload = { rating: draft.rating, content: draft.content.trim(), photoUrls };
      const result = isEditing
        ? await updateReview({ reviewId: review.id, ...payload })
        : await createReview({ orderId: order.id, ...payload });

      if (result.error) {
        // RPC 실패 시 방금 올린 사진은 고아가 되지 않게 정리
        await removeReviewPhotos(uploadedUrls);
        setErrorMessage(result.error.message || "후기를 저장하지 못했어요.");
        setIsSubmitting(false);
        return;
      }

      // 수정 시 빠진 기존 사진은 스토리지에서 제거
      if (isEditing) {
        const removed = (review.photoUrls ?? []).filter((url) => !photoUrls.includes(url));
        await removeReviewPhotos(removed);
      }

      trackReviewSubmit({
        orderId: order?.id,
        rating: draft.rating,
        photoCount: photoUrls.length,
        mode: isEditing ? "update" : "create",
      });
      setIsSubmitting(false);
      onSaved?.(result.review);
    } catch (error) {
      await removeReviewPhotos(uploadedUrls);
      setErrorMessage(error?.message || "후기를 저장하지 못했어요.");
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditing || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    const result = await deleteReview({ reviewId: review.id, photoUrls: review.photoUrls });
    setIsSubmitting(false);
    setIsDeleteConfirmOpen(false);
    if (result.error) {
      setErrorMessage(result.error.message || "후기를 삭제하지 못했어요.");
      return;
    }
    onDeleted?.(review);
  };

  return (
    <>
      <ResponsiveSheet
        actions={
          <>
            <button
              className="public-auth-button public-auth-button--secondary"
              disabled={isSubmitting}
              onClick={onClose}
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
              {isSubmitting ? "저장 중..." : isEditing ? "후기 수정" : "후기 등록"}
            </button>
          </>
        }
        eyebrow={isEditing ? "후기 수정" : "후기 작성"}
        onClose={isSubmitting ? () => {} : onClose}
        open={open}
        title={isEditing ? "후기를 수정할까요?" : "이번 구매는 어떠셨나요?"}
      >
        <div className="public-review-form">
          {order ? (
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
          ) : null}

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
                    onClick={() => setDraft((previous) => ({ ...previous, rating: star }))}
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
                  <img alt={`첨부 사진 ${index + 1}`} src={photo.file ? photo.previewUrl : getThumbnailImageUrl(photo.url)} />
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

          {errorMessage ? <p className="public-review-form__error" role="alert">{errorMessage}</p> : null}

          {isEditing ? (
            <button
              className="public-review-form__delete"
              disabled={isSubmitting}
              onClick={() => setIsDeleteConfirmOpen(true)}
              type="button"
            >
              후기 삭제
            </button>
          ) : null}
        </div>
      </ResponsiveSheet>

      <ConfirmDialog
        body="삭제한 후기는 되돌릴 수 없어요."
        confirmLabel="삭제"
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          void handleDelete();
        }}
        open={isDeleteConfirmOpen}
        title="후기를 삭제할까요?"
      />
    </>
  );
}

export default ReviewComposerSheet;
