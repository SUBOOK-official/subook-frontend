import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@shared-domain/format";
import { getBuyerReturnLabel } from "@shared-domain/returns";
import { pickupBoxLabel } from "@shared-domain/pickupBoxes";
import { MypageEmptyState, ResponsiveSheet } from "./PublicMypageUi.jsx";
import { ArrowRightIcon, BookIcon, BoxIcon, ChevronRightIcon, CoinIcon, SearchIcon } from "./icons";
import { OrderReviewAction, ReviewInviteBanner } from "./MypageReviews";
import { formatPoints } from "../lib/publicPointsUtils";
import { canWriteOrderReview } from "../lib/publicReviewsUtils";
import { KAKAO_CHANNEL_URL } from "../lib/supportChannels";
import { getThumbnailImageUrl } from "../lib/storageImage";
import { BANK_ACCOUNT, BANK_HOLDER, BANK_NAME, PAYMENT_DEADLINE_HOURS, buildDepositorName } from "../lib/paymentBankInfo";
import { trackContactClick, trackCopyClick, trackEvent, trackListFilterChange } from "../lib/analytics";
import { PURCHASE_SUMMARY_CARDS, SALES_STATUS_FILTERS, SHIPMENT_PROGRESS_STEPS, deriveSettlementMetrics, deriveShipmentMetrics, filterPurchaseOrders, filterShipmentsByStatus, formatCompactDate, formatDateTime, formatShipmentReference, getOrderStatusLabel, getOrderStatusTone, getPaymentMethodLabel, getShipmentProgressIndex, getShipmentStatusLabel, getShipmentStatusTone, groupOrdersByDate } from "../lib/publicMypageUtils";

function ShipmentBookRow({ item }) {
  const discarded = Boolean(item.isRejected || item.rejectionReason);
  return (
    <div className="public-mypage-book-row" id={`public-mypage-book-${item.id}`}>
      <div className="public-mypage-book-row__copy">
        <strong>{item.title}</strong>
        {!discarded ? <p>등급: {item.gradeLabel ?? "-"} | 판매가: {item.price ? formatCurrency(item.price) : "-"}</p> : null}
      </div>
      <span className={`public-mypage-chip public-mypage-chip--${discarded ? "neutral" : item.tone ?? "neutral"}`}>
        {discarded ? "폐기" : item.statusLabel}
      </span>
    </div>
  );
}

// P2-7: 운송장 번호 + 복사 버튼.
function TrackingNumberRow({ company, trackingNumber }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // GA4 복사 — 값(운송장 번호)은 보내지 않고 대상만
      trackCopyClick("tracking_number", "purchase_card", "ok");
    } catch {
      /* ignore */
      trackCopyClick("tracking_number", "purchase_card", "fail");
    }
  };
  return (
    <div className="public-mypage-purchase-card__tracking">
      <span className="public-mypage-purchase-card__tracking-label">
        {company ?? "CJ대한통운"}
      </span>
      <code className="public-mypage-purchase-card__tracking-number">{trackingNumber}</code>
      <button
        aria-label="운송장 번호 복사"
        className="public-mypage-purchase-card__tracking-copy"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

// 입금 대기(pending) 주문의 계좌·입금자명·금액 재확인 안내.
// 결제 직후 주문완료 화면을 놓쳐도(탭 닫힘/세션 만료) 여기서 다시 입금할 수 있게 한다.
// 입금자명·계좌·마감 정의는 주문완료 페이지(PublicOrderCompletePage)와 동일 소스를 공유.
// copyTarget: bank_account / deposit_amount / depositor_name — 복사한 "값"은 절대 보내지 않는다.
function OrderDepositRow({ label, value, copyLabel, copyTarget = "unknown", highlight = false, hint = null }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      trackCopyClick(copyTarget, "mypage_order", "ok");
    } catch {
      /* ignore */
      trackCopyClick(copyTarget, "mypage_order", "fail");
    }
  };
  return (
    <div
      className={`public-mypage-deposit__row${
        highlight ? " public-mypage-deposit__row--highlight" : ""
      }`}
    >
      <div className="public-mypage-deposit__cell">
        <span className="public-mypage-deposit__label">{label}</span>
        <span className="public-mypage-deposit__value">{value}</span>
        {hint ? <span className="public-mypage-deposit__hint">{hint}</span> : null}
      </div>
      <button
        aria-label={copyLabel}
        className="public-mypage-deposit__copy"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function OrderDepositInfo({ order, isDemoPreview = false }) {
  const depositorName = buildDepositorName(order.recipientName, order.reference);
  const bankAccount = isDemoPreview ? "000-000-000000" : BANK_ACCOUNT;
  const bankAccountPlain = bankAccount.replace(/-/g, "");
  const shownRef = useRef(false);

  // GA4 입금 안내 노출 — 주문당 1회. 미입금 이탈 분석의 분모.
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    trackEvent("bank_info_shown", {
      uiSurface: "mypage_order",
      orderId: String(order.id),
      value: Number(order.totalAmount) || 0,
    });
  }, [order.id, order.totalAmount]);

  return (
    <div className="public-mypage-deposit" role="group" aria-label="입금 안내">
      <p className="public-mypage-deposit__title">입금 계좌 안내</p>
      <OrderDepositRow
        copyLabel="계좌번호 복사"
        copyTarget="bank_account"
        label={isDemoPreview ? "예시 은행 · 입금하지 마세요" : `${BANK_NAME} · 예금주 ${BANK_HOLDER}`}
        value={bankAccount}
        hint={`복사 시 ${bankAccountPlain}`}
      />
      {order.totalAmount != null ? (
        <OrderDepositRow
          copyLabel="입금 금액 복사"
          copyTarget="deposit_amount"
          label="입금 금액"
          value={formatCurrency(order.totalAmount)}
        />
      ) : null}
      {depositorName ? (
        <OrderDepositRow
          copyLabel="입금자명 복사"
          copyTarget="depositor_name"
          highlight
          hint="본인 성함 + 주문번호 마지막 4자리. 다르게 입력하면 입금 확인이 늦어질 수 있어요."
          label="입금자명 (필수)"
          value={depositorName}
        />
      ) : null}
      <p className="public-mypage-deposit__notice">
        주문 후 <strong>{PAYMENT_DEADLINE_HOURS}시간 이내</strong>에 입금해주세요. 미입금 시 주문이
        자동 취소됩니다.
      </p>
    </div>
  );
}

// P1-5: 정산 카드 — 클릭 시 주문번호·판매일·구매확정일·입금일 타임라인 노출.
function OrderDetailSheet({ order, onClose }) {
  if (!order) {
    return null;
  }

  const couponDiscount = Number(order.couponDiscountAmount) || 0;
  const pointsUsed = Number(order.pointsUsed) || 0;
  const shippingFee = Number(order.shippingFee) || 0;
  const totalAmount = Number(order.totalAmount) || 0;
  // 환불 누계 (품목별 부분환불 포함) — 0이면 환불 행 자체를 숨긴다
  const refundedAmount = Number(order.refundedAmount) || 0;
  // 총 상품금액: subtotal 컬럼 우선, 없으면 합산금액에서 역산(결제금액 + 쿠폰할인 − 배송비).
  const productTotal =
    Number(order.subtotal) || Math.max(0, totalAmount + couponDiscount + pointsUsed - shippingFee);
  // paid_at은 2026-07-13부터 입금확인·PG 승인 시 트리거로 기록된다. 그 이전의
  // 무통장 주문은 결제 시각이 어디에도 없으므로 '주문일시'로 라벨링해 허위 시각을 피한다.
  const paidAt = order.paidAt || null;

  return (
    <ResponsiveSheet
      analyticsExtra={{
        orderId: String(order.id),
        orderStatus: order.status,
        paymentType: order.paymentMethod,
        value: totalAmount,
      }}
      analyticsName="order_detail"
      eyebrow="주문 상세"
      onClose={onClose}
      open={Boolean(order)}
      title="결제 정보"
    >
      <dl className="public-mypage-order-detail">
        {order.reference ? (
          <div className="public-mypage-order-detail__row">
            <dt>주문번호</dt>
            <dd>{order.reference}</dd>
          </div>
        ) : null}
        <div className="public-mypage-order-detail__row">
          <dt>{paidAt ? "결제일시" : "주문일시"}</dt>
          <dd>{formatDateTime(paidAt || order.createdAt)}</dd>
        </div>
        <div className="public-mypage-order-detail__row">
          <dt>결제방법</dt>
          <dd>{getPaymentMethodLabel(order.paymentMethod)}</dd>
        </div>

        <div className="public-mypage-order-detail__divider" aria-hidden="true" />

        <div className="public-mypage-order-detail__row">
          <dt>총 상품금액</dt>
          <dd>{formatCurrency(productTotal)}</dd>
        </div>
        <div className="public-mypage-order-detail__row">
          <dt>쿠폰할인</dt>
          <dd>{couponDiscount > 0 ? `−${formatCurrency(couponDiscount)}` : formatCurrency(0)}</dd>
        </div>
        {pointsUsed > 0 ? (
          <div className="public-mypage-order-detail__row">
            <dt>포인트 사용</dt>
            <dd>−{formatCurrency(pointsUsed)}</dd>
          </div>
        ) : null}
        <div className="public-mypage-order-detail__row">
          <dt>배송비</dt>
          <dd>{shippingFee > 0 ? formatCurrency(shippingFee) : "무료"}</dd>
        </div>

        <div className="public-mypage-order-detail__divider" aria-hidden="true" />

        <div className="public-mypage-order-detail__row public-mypage-order-detail__row--total">
          <dt>{order.status === "pending" ? "입금할 금액" : order.status === "cancelled" && !paidAt ? "주문금액" : "결제금액"}</dt>
          <dd>{formatCurrency(totalAmount)}</dd>
        </div>

        {/* 환불 내역 (2026-08-01 품목별 부분환불) — 부분환불이면 환불 후 금액도 함께 */}
        {refundedAmount > 0 ? (
          <>
            <div className="public-mypage-order-detail__row">
              <dt>환불 금액</dt>
              <dd>−{formatCurrency(refundedAmount)}</dd>
            </div>
            {order.status !== "refunded" ? (
              <div className="public-mypage-order-detail__row public-mypage-order-detail__row--total">
                <dt>환불 후 결제금액</dt>
                <dd>{formatCurrency(Math.max(0, totalAmount - refundedAmount))}</dd>
              </div>
            ) : null}
          </>
        ) : null}
      </dl>
    </ResponsiveSheet>
  );
}

export function PurchasesView({
  isDemoPreview = false, busyOrderId, onCancelOrder, onConfirmOrder, onRequestReturn,
  onTrackParcel, onOpenPoints, onWriteReview, orders, points, reviewsByOrderId,
  reviewsReady, isFirstReview, onOpenReviews,
}) {
  const [detailOrderId, setDetailOrderId] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const filteredOrders = useMemo(() => filterPurchaseOrders(orders, activeFilter, query), [orders, activeFilter, query]);
  const groupedOrders = useMemo(() => groupOrdersByDate(filteredOrders.slice(0, visibleCount)), [filteredOrders, visibleCount]);
  const detailOrder = orders.find((order) => order.id === detailOrderId) ?? null;
  const changeFilter = (filter) => {
    trackListFilterChange("purchases", filter, { fromFilter: activeFilter, resultCount: filterPurchaseOrders(orders, filter).length });
    setActiveFilter(filter);
    setVisibleCount(10);
  };
  return (
    <div className="mypage-history">
      <header className="mypage-history-heading">
        <div><p className="mypage-history-eyebrow">MY ORDERS</p><h2>구매 내역 <span>{orders.length}</span></h2></div>
        {points ? <button className="mypage-points-link" type="button" onClick={onOpenPoints}>
          <span>보유 포인트</span><strong>{formatPoints(points.balance ?? 0)}</strong><ChevronRightIcon size={16} />
          {points.expiringWithin30Days > 0 ? <small>{formatPoints(points.expiringWithin30Days)} 소멸 예정</small> : null}
        </button> : null}
      </header>
      <div className="mypage-history-toolbar">
        <label className="mypage-history-search"><SearchIcon size={18} /><input type="search" aria-label="주문 검색" placeholder="교재명 또는 주문번호" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(10); }} /></label>
      </div>
      <div className="mypage-history-filters" role="group" aria-label="구매 상태 필터">
        {PURCHASE_SUMMARY_CARDS.map((filter) => <button type="button" key={filter.key} aria-pressed={activeFilter === filter.key} onClick={() => changeFilter(filter.key)}>
          {filter.label}<span>{filterPurchaseOrders(orders, filter.key).length}</span>
        </button>)}
      </div>
      {!orders.length ? <MypageEmptyState icon={<BoxIcon size={32} />} title="아직 구매한 교재가 없어요" actionLabel="교재 둘러보기" actionTo="/" /> :
        !filteredOrders.length ? <div className="mypage-history-empty"><p>조건에 맞는 주문이 없어요.</p><button className="public-mypage-inline-link" type="button" onClick={() => { setQuery(""); changeFilter("all"); }}>전체 주문 보기</button></div> : (
        <div className="mypage-orders">
          {groupedOrders.map((group) => <section key={group.dateKey} className="mypage-order-date-group" aria-label={group.dateLabel}>
            {group.orders.map((order) => {
              const items = order.items ?? [];
              const hasActiveItems = items.some((item) => !item.refundedAt);
              const isPending = order.status === "pending" && order.paymentStatus !== "paid" && order.paymentMethod !== "card";
              return <article className="mypage-order" key={order.id} aria-label={`주문 ${order.reference ?? order.id}`}>
                <header className="mypage-order-header">
                  <div><time>{group.dateLabel}</time><span className="mypage-order-reference">{order.reference}</span></div>
                  <button className="mypage-text-button" aria-label={`주문 ${order.reference ?? order.id} 상세보기`} type="button" onClick={() => setDetailOrderId(order.id)}>주문 상세<ChevronRightIcon size={15} /></button>
                </header>
                <div className="mypage-order-status">
                  <strong className={`mypage-status mypage-status--${getOrderStatusTone(order.status)}`}>{order.status === "preparing" ? "배송 준비중" : getOrderStatusLabel(order.status)}</strong>
                  <span>{isPending ? "입금할 금액" : order.status === "cancelled" && !order.paidAt ? "주문금액" : "결제금액"} <b>{formatCurrency(order.totalAmount)}</b></span>
                </div>
                <div className="mypage-order-items">{items.map((item) => {
                  const refundPending = !item.refundedAt && order.refundRequestedAt && order.status !== "refunded" &&
                    (order.refundRequestItemsError || !order.refundRequestedItemIds?.length || order.refundRequestedItemIds.some((id) => String(id) === String(item.id)));
                  return <div className="mypage-order-item" key={item.id}>
                    <div className="mypage-order-cover" aria-hidden="true">{item.coverImageUrl ? <img alt="" loading="lazy" src={getThumbnailImageUrl(item.coverImageUrl)} /> : <BookIcon size={24} />}</div>
                    <div className="mypage-order-item-copy">
                      <h3>{item.title}</h3>
                      <p>{[item.optionLabel, item.gradeLabel, `${item.quantity}권`].filter(Boolean).join(" · ")}</p>
                      <strong>{formatCurrency(item.price)}</strong>
                      {item.refundedAt ? <span className="mypage-item-return">환불완료</span> : refundPending ? <span className="mypage-item-return">{order.refundRequestItemsError ? "환불 대상 조회 실패 · 다시 불러와주세요" : !order.refundRequestedItemIds?.length ? "환불 접수 · 대상 확인 중" : getBuyerReturnLabel(order.returnProgress?.status) || "환불 접수"}</span> : null}
                    </div>
                  </div>;
                })}</div>
                {isPending ? <details className="mypage-deposit-disclosure"><summary>입금 계좌 확인 <ChevronRightIcon size={15} /></summary><OrderDepositInfo order={order} isDemoPreview={isDemoPreview} /></details> : null}
                <footer className="mypage-order-footer">
                  {order.trackingNumber ? <TrackingNumberRow company={order.trackingCompany} trackingNumber={order.trackingNumber} /> : null}
                  <div className="mypage-order-actions">
                    {order.trackingNumber ? <button className="public-mypage-purchase-card__btn" type="button" onClick={() => onTrackParcel(order.trackingNumber, "purchase_card", { orderStatus: order.status })}>배송 조회</button> : null}
                    {hasActiveItems && order.canCancel ? <button className="public-mypage-purchase-card__btn" type="button" disabled={busyOrderId === order.id} onClick={() => onCancelOrder(order)}>주문 취소</button> : null}
                    {hasActiveItems && order.status === "preparing" ? <a className="public-mypage-purchase-card__btn" href={KAKAO_CHANNEL_URL} target="_blank" rel="noopener noreferrer" onClick={() => trackContactClick("kakao", "purchase_card_cancel", { orderStatus: order.status })}>취소 문의</a> : null}
                    {hasActiveItems && order.canRequestRefund ? <button className="public-mypage-purchase-card__btn" type="button" disabled={busyOrderId === order.id} onClick={() => onRequestReturn(order)}>환불 신청</button> : null}
                    {hasActiveItems && order.canConfirm && !order.refundRequestedAt ? <button className="public-mypage-purchase-card__btn public-mypage-purchase-card__btn--primary" type="button" disabled={busyOrderId === order.id} onClick={() => onConfirmOrder(order)}>{busyOrderId === order.id ? "처리 중…" : "구매확정"}</button> : null}
                    {reviewsReady && canWriteOrderReview(order) && onWriteReview ? <OrderReviewAction order={order} review={reviewsByOrderId?.[order.id]} isFirstReview={isFirstReview} onClick={onWriteReview} /> : null}
                  </div>
                  {order.canConfirm && !order.refundRequestedAt && order.autoConfirmDaysRemaining != null ? <p className="mypage-order-note">{order.autoConfirmDaysRemaining <= 0 ? "곧 자동 구매확정됩니다." : `${order.autoConfirmDaysRemaining}일 뒤 자동 구매확정됩니다.`} 교재에 문제가 있다면 환불을 신청해주세요.</p> : null}
                </footer>
              </article>;
            })}
          </section>)}
        </div>
      )}
      {filteredOrders.length > visibleCount ? <button className="mypage-history-more" type="button" onClick={() => setVisibleCount((count) => count + 10)}>주문 더 보기 <span>{visibleCount} / {filteredOrders.length}</span></button> : null}
      {reviewsReady ? <ReviewInviteBanner orders={orders} reviewsByOrderId={reviewsByOrderId} isFirstReview={isFirstReview} onOpen={onOpenReviews} /> : null}
      <OrderDetailSheet order={detailOrder} onClose={() => setDetailOrderId(null)} />
    </div>
  );
}

export function SalesTab({ expandedShipmentId, onCancelPickup, onRequestPickup, onToggleShipment, onTrackParcel, shipments }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const metrics = useMemo(() => deriveShipmentMetrics(shipments), [shipments]);
  const filteredShipments = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return filterShipmentsByStatus(shipments, statusFilter).filter((shipment) => !keyword ||
      [shipment.reference, shipment.referenceLabel, shipment.summaryLabel, ...(shipment.items ?? []).map((item) => item.title)]
        .some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [shipments, statusFilter, searchKeyword]);
  const changeFilter = (value) => {
    trackListFilterChange("sales", value, { fromFilter: statusFilter, resultCount: filterShipmentsByStatus(shipments, value).length });
    setStatusFilter(value); setVisibleCount(12);
  };
  return <div className="mypage-history">
    <header className="mypage-history-heading">
      <div><p className="mypage-history-eyebrow">MY SELLING</p><h2>판매 내역 <span>{shipments.length}</span></h2></div>
      <button className="mypage-text-button" type="button" onClick={() => onRequestPickup("mypage_sales_header")}>수거 신청<ArrowRightIcon size={16} /></button>
    </header>
    <div className="mypage-sales-summary">
      {[["맡긴 교재", metrics.totalBookCount], ["판매중", metrics.onSaleBookCount], ["판매완료", metrics.soldBookCount]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}<small>권</small></strong></div>)}
    </div>
    <div className="mypage-history-toolbar"><label className="mypage-history-search"><SearchIcon size={18} /><input aria-label="판매 교재 검색" type="search" placeholder="교재명 또는 수거번호" value={searchKeyword} onChange={(event) => { setSearchKeyword(event.target.value); setVisibleCount(12); }} /></label></div>
    <div className="mypage-history-filters" role="group" aria-label="판매 상태 필터">{SALES_STATUS_FILTERS.map((filter) => <button key={filter.value} type="button" aria-pressed={statusFilter === filter.value} onClick={() => changeFilter(filter.value)}>{filter.label}<span>{filterShipmentsByStatus(shipments, filter.value).length}</span></button>)}</div>
    {!shipments.length ? <MypageEmptyState icon={<BoxIcon size={32} />} title="아직 맡긴 교재가 없어요" actionLabel="수거 신청하기" actionOnClick={() => onRequestPickup("mypage_sales_empty")} /> :
      !filteredShipments.length ? <div className="mypage-history-empty"><p>조건에 맞는 판매 내역이 없어요.</p><button className="public-mypage-inline-link" type="button" onClick={() => { setSearchKeyword(""); changeFilter("all"); }}>전체 내역 보기</button></div> :
      <div className="mypage-shipments">{filteredShipments.slice(0, visibleCount).map((shipment) => {
        const isExpanded = expandedShipmentId === shipment.id;
        const items = shipment.items ?? [];
        const reference = shipment.referenceLabel ?? (shipment.reference ? formatShipmentReference(shipment.reference) : "수거번호 확인 중");
        const cancelled = shipment.status === "cancelled";
        const progressIndex = getShipmentProgressIndex(shipment.status);
        const detailsId = `mypage-shipment-${shipment.id}`;
        return <article className={`mypage-shipment ${isExpanded ? "is-expanded" : ""}`} key={shipment.id}>
          <button type="button" className="mypage-shipment-toggle" aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => {
            trackEvent("pickup_detail_toggle", { pickupStatus: shipment.status, uiAction: isExpanded ? "collapse" : "expand" });
            onToggleShipment(isExpanded ? null : shipment.id);
          }}>
            <div className="mypage-shipment-date"><strong>{formatCompactDate(shipment.createdAt)}</strong><span>{reference}</span></div>
            <div className="mypage-shipment-copy"><strong>교재 {shipment.bookCount ?? items.length}권</strong><span>{items.length ? items.slice(0, 2).map((item) => item.title).join(" · ") + (items.length > 2 ? ` 외 ${items.length - 2}권` : "") : "수거 신청"}</span></div>
            <strong className={`mypage-status mypage-status--${getShipmentStatusTone(shipment.status)}`}>{getShipmentStatusLabel(shipment.status)}</strong>
            <ChevronRightIcon className="mypage-shipment-chevron" size={18} />
          </button>
          {isExpanded ? <div className="mypage-shipment-detail" id={detailsId}>
            {!cancelled && shipment.status !== "rejected" ? <ol className="mypage-shipment-progress" aria-label="수거 진행 단계">
              {SHIPMENT_PROGRESS_STEPS.map((step, index) => <li key={step.key} className={index <= progressIndex ? "is-done" : ""} aria-current={index === progressIndex && !["sold", "settled"].includes(shipment.status) ? "step" : undefined}><i aria-hidden="true" /><span>{step.label}</span></li>)}
            </ol> : null}
            <div className="mypage-shipment-detail-top">
              {shipment.boxTypeCodes?.length > 0 ? <p>{shipment.boxTypeCodes.map((code, index) => `박스 ${index + 1} · ${pickupBoxLabel(code)}`).join(" / ")}</p> : <span />}
              {shipment.trackingNumber ? <button className="mypage-text-button" type="button" onClick={() => onTrackParcel(shipment.trackingNumber, "sales_card", { pickupStatus: shipment.status })}>수거 배송 조회<ChevronRightIcon size={15} /></button> : null}
              {shipment.canCancel ? <button className="mypage-text-button" type="button" onClick={() => onCancelPickup(shipment)}>신청 취소</button> : null}
            </div>
            {items.length ? <div className="mypage-inspection-list">{items.map((item) => <ShipmentBookRow item={item} key={item.id} />)}</div> :
              <p className="mypage-shipment-awaiting">{cancelled ? "취소된 수거 신청입니다." : shipment.compact ? "교재 상세 정보를 불러오지 못했습니다. 다시 불러와주세요." : "교재가 입고되면 검수 내역이 표시됩니다."}</p>}
          </div> : null}
        </article>;
      })}</div>}
    {filteredShipments.length > visibleCount ? <button className="mypage-history-more" type="button" onClick={() => setVisibleCount((count) => count + 12)}>판매 내역 더 보기 <span>{visibleCount} / {filteredShipments.length}</span></button> : null}
  </div>;
}

function SettlementCard({ settlement, status }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = status === "completed";
  const detailId = `mypage-settlement-${settlement.id}`;
  const timeline = [
    { label: "판매일", value: settlement.soldAt },
    { label: "구매확정일", value: settlement.confirmedAt },
    { label: "입금예정일", value: settlement.scheduledAt },
    isCompleted ? { label: "입금일", value: settlement.completedAt ?? settlement.date } : null,
  ].filter((entry) => entry?.value);
  return <article className="mypage-settlement">
    <button type="button" className="mypage-settlement-toggle" aria-expanded={expanded} aria-controls={detailId} onClick={() => {
      trackEvent("settlement_detail_toggle", { settlementStatus: status, hasTimelineData: timeline.length > 0, uiAction: expanded ? "collapse" : "expand" });
      setExpanded((value) => !value);
    }}>
      <span className="mypage-settlement-date"><strong>{formatCompactDate(isCompleted ? settlement.completedAt ?? settlement.date : settlement.scheduledAt)}</strong><span>{isCompleted ? "입금완료" : settlement.statusLabel || "정산 예정"}</span></span>
      <span className="mypage-settlement-copy"><strong>{settlement.bookTitle && settlement.bookTitle !== "교재" ? settlement.bookTitle : `교재 ${settlement.bookCount}권`}</strong><span>수거 {settlement.pickupReference || "번호 확인 중"}</span></span>
      <strong className="mypage-settlement-amount">{formatCurrency(settlement.amount)}</strong><ChevronRightIcon size={18} />
    </button>
    {expanded ? <div className="mypage-settlement-detail" id={detailId}>
      <dl className="mypage-money-breakdown">
        <div><dt>판매금액</dt><dd>{formatCurrency(settlement.grossSales)}</dd></div>
        <div><dt>판매 수수료{settlement.grossSales > 0 ? ` (${Math.round((settlement.feeAmount / settlement.grossSales) * 100)}%)` : ""}</dt><dd>−{formatCurrency(settlement.feeAmount)}</dd></div>
        {settlement.boxCostDeducted > 0 ? <div><dt>박스비</dt><dd>−{formatCurrency(settlement.boxCostDeducted)}</dd></div> : null}
        <div className="is-total"><dt>{isCompleted ? "입금금액" : "입금 예정금액"}</dt><dd>{formatCurrency(settlement.amount)}</dd></div>
      </dl>
      {settlement.hasAccountInfo ? <p className="mypage-settlement-bank">{settlement.bankLabel} {settlement.maskedAccount}</p> : null}
      {settlement.orderReference ? <p className="mypage-settlement-reference">주문 {settlement.orderReference}</p> : null}
      {timeline.length ? <dl className="mypage-settlement-timeline">{timeline.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{formatCompactDate(entry.value)}</dd></div>)}</dl> : <p className="mypage-shipment-awaiting">상세 일자 정보가 없습니다.</p>}
    </div> : null}
  </article>;
}

export function SettlementsTab({ completedSettlements, onRequestPickup, scheduledSettlements, settlementSummary, onManageAccount }) {
  const [activeFilter, setActiveFilter] = useState("scheduled");
  const [visibleCount, setVisibleCount] = useState(20);
  const metrics = deriveSettlementMetrics({ settlementSummary, completedSettlements, scheduledSettlements });
  const rows = [...(activeFilter === "scheduled" ? scheduledSettlements : completedSettlements)].sort((a, b) => {
    const left = new Date(a.scheduledAt ?? a.date).getTime() || 0;
    const right = new Date(b.scheduledAt ?? b.date).getTime() || 0;
    return activeFilter === "scheduled" ? left - right : new Date(b.completedAt ?? b.date) - new Date(a.completedAt ?? a.date);
  });
  const nextDate = [...scheduledSettlements].filter((entry) => entry.scheduledAt).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0]?.scheduledAt;
  return <div className="mypage-history">
    <header className="mypage-history-heading"><div><p className="mypage-history-eyebrow">MY SETTLEMENTS</p><h2>정산 내역</h2></div><button className="mypage-text-button" type="button" onClick={onManageAccount}>정산 계좌 관리<ChevronRightIcon size={16} /></button></header>
    <section className="mypage-settlement-summary" aria-label="정산 요약">
      <div className="mypage-settlement-expected"><span>받을 정산금</span><strong>{formatCurrency(metrics.expectedAmount)}</strong><p>{nextDate ? `${formatCompactDate(nextDate)} 입금 예정` : "구매확정된 판매분을 매월 1일 정산합니다."}</p></div>
      <div className="mypage-settlement-totals"><div><span>이번 달 받은 금액</span><strong>{formatCurrency(metrics.currentMonthAmount)}</strong></div><div><span>지금까지 받은 금액</span><strong>{formatCurrency(metrics.totalAmount)}</strong></div></div>
    </section>
    <div className="mypage-history-filters" role="group" aria-label="정산 상태 필터">
      {[["scheduled", "정산 예정", scheduledSettlements.length], ["completed", "입금완료", completedSettlements.length]].map(([key, label, count]) => <button key={key} type="button" aria-pressed={activeFilter === key} onClick={() => { setActiveFilter(key); setVisibleCount(20); }}>{label}<span>{count}</span></button>)}
    </div>
    {rows.length ? <div className="mypage-settlements">{rows.slice(0, visibleCount).map((settlement) => <SettlementCard key={settlement.id} settlement={settlement} status={activeFilter} />)}</div> :
      !scheduledSettlements.length && !completedSettlements.length ? <MypageEmptyState icon={<CoinIcon size={32} />} title="아직 정산 내역이 없어요" actionLabel="수거 신청하기" actionOnClick={() => onRequestPickup("mypage_settlements_empty")} /> :
        <div className="mypage-history-empty"><p>{activeFilter === "scheduled" ? "현재 정산 예정인 금액이 없어요." : "아직 입금완료 내역이 없어요."}</p></div>}
    {rows.length > visibleCount ? <button className="mypage-history-more" type="button" onClick={() => setVisibleCount((count) => count + 20)}>정산 내역 더 보기 <span>{visibleCount} / {rows.length}</span></button> : null}
  </div>;
}
