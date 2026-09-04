// 마이페이지 포인트 — 구매현황 상단 카드 + 내역 시트 (2026-09-02 포인트 제도)
import { ResponsiveSheet } from "./PublicMypageUi.jsx";
import { ChevronRightIcon, CoinIcon } from "./icons";
import {
  POINT_POLICY,
  formatPoints,
  getPointKindLabel,
} from "../lib/publicPointsUtils";
import { formatDateTime } from "../lib/publicMypageUtils";
import "./MypagePoints.css";

export function MypagePointsCard({ points, onOpenHistory }) {
  const balance = points?.balance ?? 0;
  const expiring = points?.expiringWithin30Days ?? 0;
  return (
    <button className="public-mypage-points-card" onClick={onOpenHistory} type="button">
      <span className="public-mypage-points-card__icon" aria-hidden="true">
        <CoinIcon size={18} />
      </span>
      <span className="public-mypage-points-card__body">
        <span className="public-mypage-points-card__label">보유 포인트</span>
        <strong className="public-mypage-points-card__value">{formatPoints(balance)}</strong>
        <span className="public-mypage-points-card__hint">
          {expiring > 0
            ? `${formatPoints(expiring)}이 30일 내 소멸 예정`
            : `상품금액 ${POINT_POLICY.minReviewOrderSubtotal.toLocaleString("ko-KR")}원 이상 주문 후기부터 적립`}
        </span>
      </span>
      <span className="public-mypage-points-card__more">
        내역
        <ChevronRightIcon size={16} />
      </span>
    </button>
  );
}

export function PointsHistorySheet({ open, onClose, points }) {
  const transactions = points?.transactions ?? [];
  return (
    <ResponsiveSheet
      analyticsExtra={{ itemCount: transactions.length }}
      analyticsName="points_history"
      eyebrow="포인트"
      onClose={onClose}
      open={open}
      title="포인트 내역"
    >
      <div className="public-mypage-points-summary">
        <span>보유 포인트</span>
        <strong>{formatPoints(points?.balance ?? 0)}</strong>
      </div>
      <p className="public-mypage-points-policy">
        1P = 1원. 상품금액 {POINT_POLICY.minReviewOrderSubtotal.toLocaleString("ko-KR")}원 이상 주문의 글
        후기는 {formatPoints(POINT_POLICY.earnText)}, 사진 후기는 {formatPoints(POINT_POLICY.earnPhoto)}가
        적립됩니다. 적립 포인트는{" "}
        {formatPoints(POINT_POLICY.minBalanceToUse)}부터 상품금액{" "}
        {POINT_POLICY.minOrderSubtotal.toLocaleString("ko-KR")}원 이상 주문에서 상품금액의{" "}
        {Math.round(POINT_POLICY.maxUseRatio * 100)}%까지 사용할 수 있고, 적립일로부터{" "}
        {POINT_POLICY.expiryMonths}개월 뒤 소멸됩니다.
      </p>
      {transactions.length === 0 ? (
        <p className="public-mypage-points-empty">아직 포인트 내역이 없어요.</p>
      ) : (
        <ul className="public-mypage-points-list">
          {transactions.map((item) => (
            <li className="public-mypage-points-item" key={item.id}>
              <div>
                <p className="public-mypage-points-item__title">
                  {getPointKindLabel(item.kind)}
                  {item.note ? <span className="public-mypage-points-item__note"> · {item.note}</span> : null}
                </p>
                <p className="public-mypage-points-item__meta">
                  {formatDateTime(item.createdAt)}
                  {item.orderNumber ? ` · ${item.orderNumber}` : ""}
                  {item.amount > 0 && item.expiresAt ? ` · ${formatDateTime(item.expiresAt).slice(0, 10)} 소멸` : ""}
                </p>
              </div>
              <strong
                className={`public-mypage-points-item__amount${
                  item.amount < 0 ? " public-mypage-points-item__amount--minus" : ""
                }`}
              >
                {item.amount > 0 ? "+" : ""}
                {formatPoints(item.amount)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveSheet>
  );
}
