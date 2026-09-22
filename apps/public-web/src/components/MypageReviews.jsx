import { useRef, useState } from "react";
import { ChevronRightIcon, StarIcon } from "./icons";
import { trackEvent } from "../lib/analytics";
import { useInViewOnce } from "../lib/useInViewOnce";
import { POINT_POLICY, formatPoints, getReviewRewardPoints } from "../lib/publicPointsUtils";
import { canWriteOrderReview, formatReviewDate, formatReviewProductTitle, getReviewOrderSubtotal } from "../lib/publicReviewsUtils";
import "./MypageReviews.css";

export function ReviewInviteBanner({ orders, reviewsByOrderId, isFirstReview, onOpen }) {
  const eligible = orders.filter((order) => canWriteOrderReview(order) && !reviewsByOrderId[order.id]);
  const rewardable = eligible.some((order) => getReviewRewardPoints({ subtotal: getReviewOrderSubtotal(order) }) > 0);
  const bannerRef = useRef(null);
  useInViewOnce(bannerRef, () => trackEvent("review_invite_view", {
    uiSurface: "mypage_banner", isFirstReview, eligibleCount: eligible.length,
  }), { enabled: eligible.length > 0, resetKey: `${isFirstReview}-${eligible.length}` });
  if (!eligible.length) return null;
  const textReward = isFirstReview ? POINT_POLICY.earnFirstText : POINT_POLICY.earnText;
  const photoReward = isFirstReview ? POINT_POLICY.earnFirstPhoto : POINT_POLICY.earnPhoto;
  return (
    <button className="public-review-invite" type="button" ref={bannerRef} onClick={() => {
      trackEvent("review_invite_click", { uiSurface: "mypage_banner", isFirstReview });
      onOpen();
    }}>
      <span className="public-review-invite__body">
        <strong>{rewardable ? `${isFirstReview ? "첫 리뷰" : "리뷰"} 작성하고 ${formatPoints(textReward)} 받기` : "받아본 교재는 어땠나요?"}</strong>
        <span>{rewardable ? `사진을 첨부하면 ${formatPoints(photoReward)} · 상품금액 1만원 이상 주문` : "구매 후기를 남겨주세요."}</span>
      </span>
      <span className="public-review-invite__action">리뷰 쓰기<ChevronRightIcon size={16} /></span>
    </button>
  );
}

export function OrderReviewAction({ order, review, isFirstReview, onClick }) {
  const reward = getReviewRewardPoints({ subtotal: getReviewOrderSubtotal(order), isFirstReview });
  return (
    <div className="public-order-review-action">
      {!review && reward > 0 ? <span className="public-order-review-action__bubble">
        {isFirstReview ? "첫 리뷰 " : "리뷰 "}{formatPoints(reward)} 적립
      </span> : null}
      <button className={`public-mypage-purchase-card__btn${review ? "" : " public-order-review-action__button"}`} type="button" onClick={() => {
        trackEvent("review_cta_click", { orderId: String(order.id), uiAction: review ? "view" : "write", uiSurface: "purchase_card", isFirstReview });
        onClick(order);
      }}>{review ? "후기 보기" : "리뷰 작성"}</button>
    </div>
  );
}

export default function MypageReviews({ orders, reviewsByOrderId, isFirstReview, isReady, error, onRetry, onWrite, onRead }) {
  const [tab, setTab] = useState("available");
  const reviews = Object.values(reviewsByOrderId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const available = orders.filter((order) => canWriteOrderReview(order) && !reviewsByOrderId[order.id]);
  if (error) return <div className="public-my-reviews__empty" role="alert"><p>{error}</p><button className="public-auth-button public-auth-button--secondary" onClick={onRetry} type="button">다시 불러오기</button></div>;
  if (!isReady) return <div className="public-mypage-skeleton public-mypage-skeleton--panel" aria-label="리뷰 불러오는 중" />;
  return <div className="public-my-reviews">
    <h2 className="public-my-reviews__title">내 리뷰</h2>
    <div className="public-my-reviews__tabs" role="group" aria-label="리뷰 목록 선택">
      <button type="button" aria-pressed={tab === "available"} onClick={() => setTab("available")}>작성 가능 <strong>{available.length}</strong></button>
      <button type="button" aria-pressed={tab === "written"} onClick={() => setTab("written")}>작성한 리뷰 <strong>{reviews.length}</strong></button>
    </div>
    {tab === "available" ? <>
      {!available.length ? <p className="public-my-reviews__empty">작성할 리뷰가 없어요. 리뷰는 배송완료 후 주문당 한 번 작성할 수 있어요.</p> : null}
      <ul className="public-my-reviews__list">{available.map((order) => {
        const items = order.items.filter((item) => !item.refundedAt);
        const reward = getReviewRewardPoints({ subtotal: getReviewOrderSubtotal(order), isFirstReview });
        const photoReward = getReviewRewardPoints({ subtotal: getReviewOrderSubtotal(order), isFirstReview, photoCount: 1 });
        return <li className="public-my-reviews__item" key={order.id}>
          <div className="public-my-reviews__summary">
            <strong>{formatReviewProductTitle(items[0]?.title, items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0))}</strong>
            <span>{order.reference}</span>
            <span>{reward > 0 ? `${isFirstReview ? "첫 리뷰 " : ""}글 ${formatPoints(reward)} · 사진 ${formatPoints(photoReward)}` : "상품금액 1만원 이상 주문부터 포인트 적립"}</span>
          </div>
          <button className="public-auth-button public-auth-button--primary" type="button" onClick={() => {
            trackEvent("review_cta_click", { orderId: String(order.id), uiAction: "write", uiSurface: "my_reviews", isFirstReview });
            onWrite(order);
          }}>리뷰 작성</button>
        </li>;
      })}</ul>
    </> : <>
      {!reviews.length ? <p className="public-my-reviews__empty">아직 작성한 리뷰가 없어요.</p> : null}
      <ul className="public-my-reviews__list">{reviews.map((review) => <li className="public-my-reviews__item" key={review.id}>
        <div className="public-my-reviews__summary">
          <strong>{formatReviewProductTitle(review.productTitle, review.itemCount)}</strong>
          <span className="public-my-reviews__rating"><StarIcon size={14} filled />{review.rating} · {formatReviewDate(review.createdAt)}</span>
          <p>{review.content}</p>
          {review.isHidden ? <span>비공개 처리된 리뷰</span> : null}
        </div>
        <button className="public-auth-button public-auth-button--secondary" type="button" onClick={() => onRead(review)}>후기 보기</button>
      </li>)}</ul>
    </>}
  </div>;
}
