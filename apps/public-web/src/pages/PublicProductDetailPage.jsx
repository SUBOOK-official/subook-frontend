import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import ContentContainer from "../components/ContentContainer";
import ProductCard, { HeartIcon } from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { BellIcon, CloseIcon } from "../components/icons";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, addToCart } from "../lib/cart";
import usePublicMemberGate from "../lib/publicMemberGate";
import {
  clearPendingMemberAction,
  readPendingMemberAction,
} from "../lib/pendingMemberAction";
import { usePageMeta } from "../lib/usePageMeta";
import {
  getDetailImageUrl,
  getThumbnailImageUrl,
  getZoomImageUrl,
} from "../lib/storageImage";
import {
  allocateSelectedBooks,
  buildCartArgsFromBooks,
  buildOrderItemsFromBooks,
  getLineTotalForGroup,
  groupOptionsByVariant,
} from "../lib/productOptionGroups";
import {
  fetchStorefrontProductDetail,
  fetchStorefrontProducts,
  sortStorefrontProducts,
} from "../lib/storefront";
import "./PublicProductDetailPage.css";

const RELATED_RAIL_LIMIT = 12;
const SCROLL_EDGE_THRESHOLD_PX = 4;
// 고정 사이트 헤더 높이(PublicSiteHeader 기본값과 동일) — sticky 섹션 nav의 top 오프셋과
// 앵커 스크롤 시 헤더에 가려지지 않도록 빼줄 여백 계산에 사용.
const HEADER_OFFSET_PX = 72;

// 상세페이지 내부 이동용 섹션. 예전엔 클릭 시 패널을 바꿔치는 탭이었지만, 이제는 세 섹션이
// 모두 항상 렌더링되고 nav는 앵커 스크롤 + 스크롤스파이만 담당한다.
const DETAIL_SECTIONS = [
  { key: "info", label: "교재 상세 정보" },
  { key: "grade", label: "수북 검수 정책" },
  {
    key: "shipping",
    // 모바일에서는 '안내'를 숨겨 라벨을 짧게 (배송 및 교환 반품)
    label: (
      <>
        배송 및 교환 반품
        <span className="public-detail-tabs__btn-suffix"> 안내</span>
      </>
    ),
  },
];

// 등급 라벨 → CSS modifier(--grade-s/a-plus/a). 색상 변별력을 위해 등급별 다른 톤.
function getGradeTone(label) {
  if (!label) return null;
  const normalized = String(label).trim().toUpperCase();
  if (normalized === "S") return "s";
  if (normalized === "A+") return "a-plus";
  if (normalized === "A") return "a";
  return null;
}

function ProductChips({ subject, bookType, brand, conditionGradeLabel }) {
  const gradeTone = getGradeTone(conditionGradeLabel);
  const items = [
    subject ? { type: "subject", label: subject } : null,
    bookType ? { type: "type", label: bookType } : null,
    brand ? { type: "brand", label: brand } : null,
    conditionGradeLabel
      ? { type: "grade", label: conditionGradeLabel, tone: gradeTone }
      : null,
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="public-detail-chips">
      {items.map((item) => {
        const className =
          item.type === "grade" && item.tone
            ? `public-detail-chip public-detail-chip--grade public-detail-chip--grade-${item.tone}`
            : `public-detail-chip public-detail-chip--${item.type}`;
        return (
          <span className={className} key={`${item.type}-${item.label}`}>
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

function ProductPriceLine({ priceValue, originalPriceValue, discountRate }) {
  if (priceValue === null) {
    return (
      <div className="public-detail-price-line">
        <span className="public-detail-price-line__amount" aria-label="판매가">
          가격 미입력
        </span>
      </div>
    );
  }

  const computedDiscount =
    typeof discountRate === "number" && discountRate > 0
      ? discountRate
      : originalPriceValue && originalPriceValue > priceValue
        ? Math.round(
            ((originalPriceValue - priceValue) / originalPriceValue) * 100,
          )
        : null;

  return (
    <div className="public-detail-price-line-group">
      <div className="public-detail-price-line">
        {computedDiscount ? (
          <span
            className="public-detail-price-line__discount"
            aria-label={`정가 대비 ${computedDiscount}퍼센트 할인`}
          >
            {computedDiscount}%
          </span>
        ) : null}
        <span className="public-detail-price-line__amount" aria-label="판매가">
          {formatCurrency(priceValue)}
        </span>
        {originalPriceValue && originalPriceValue > priceValue ? (
          <s
            className="public-detail-price-line__original"
            aria-label={`정가 ${formatCurrency(originalPriceValue)}`}
          >
            {formatCurrency(originalPriceValue)}
          </s>
        ) : null}
      </div>
    </div>
  );
}

// 옵션 dropdown 트리거의 chevron 아이콘. 열림 상태는 CSS에서 회전시켜 표현.
function OptionChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="public-detail-option-row__chevron"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

// 회차(option) 선택 dropdown — 고르면 아래 선택목록에 추가만 하고 placeholder로 되돌아간다.
// 라벨에서 등급('S (새 책)')은 빼고 회차명만 노출. 전량 품절 회차는 비활성화.
// 네이티브 <select>는 OS 다크모드 등 환경에 따라 팝업 배색을 브라우저가 강제해 디자인을
// 완전히 통제할 수 없어, 버튼 + listbox 조합의 커스텀 드롭다운으로 직접 구현한다.
function VariantSelect({ groups, onAdd, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const labelId = "public-detail-option-label";

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // 비활성(재고 없음) 전환 시 열려 있던 팝업은 닫아준다.
  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  if (!groups.length) return null;

  const handleSelect = (group) => {
    if (group.soldOut) return;
    onAdd(group.key);
    setIsOpen(false);
  };

  return (
    <div className="public-detail-option-row">
      <label className="public-detail-option-row__label" id={labelId}>
        옵션 선택
      </label>
      <div className="public-detail-option-row__dropdown" ref={containerRef}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-labelledby={`${labelId} public-detail-option-trigger`}
          className={`public-detail-option-row__trigger${isOpen ? " is-open" : ""}`}
          disabled={disabled}
          id="public-detail-option-trigger"
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
        >
          <span className="public-detail-option-row__trigger-label">
            옵션을 선택해 주세요
          </span>
          <OptionChevronIcon />
        </button>

        {isOpen ? (
          <ul
            aria-labelledby={labelId}
            className="public-detail-option-row__listbox"
            role="listbox"
          >
            {groups.map((group) => (
              <li
                aria-disabled={group.soldOut ? "true" : undefined}
                aria-selected="false"
                className={`public-detail-option-row__option${group.soldOut ? " is-disabled" : ""}`}
                key={group.key || "__default__"}
                onClick={() => handleSelect(group)}
                role="option"
              >
                <span className="public-detail-option-row__option-label">
                  {group.label}
                </span>
                {group.soldOut ? (
                  <span className="public-detail-option-row__option-badge">
                    품절
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// 선택된 회차 한 줄 — "라벨 + N개 남음" + 수량 stepper(재고로 캡) + 라인 합계 + 제거(✕).
// label: 표시 라벨(무옵션 단일상품은 상품명). removable: 단일옵션이면 false로 ✕ 숨김.
function SelectedOptionRow({
  group,
  label,
  quantity,
  removable = true,
  onDecrease,
  onIncrease,
  onRemove,
}) {
  const lineTotal = getLineTotalForGroup(group, quantity);
  const atMax = quantity >= group.availableCount;
  const displayLabel = label ?? group.label;

  return (
    <div className="public-detail-selected-option">
      <div className="public-detail-selected-option__head">
        <span className="public-detail-selected-option__name">
          {displayLabel}
          <span className="public-detail-selected-option__stock">
            {group.availableCount}개 남음
          </span>
        </span>
        {removable ? (
          <button
            aria-label={`${displayLabel} 옵션 제거`}
            className="public-detail-selected-option__remove"
            onClick={onRemove}
            type="button"
          >
            <CloseIcon size={14} />
          </button>
        ) : null}
      </div>
      <div className="public-detail-selected-option__controls">
        <div className="public-detail-qty-row">
          <button
            aria-label={`${displayLabel} 수량 줄이기`}
            className="public-detail-qty-row__btn"
            disabled={quantity <= 1}
            onClick={onDecrease}
            type="button"
          >
            −
          </button>
          <span className="public-detail-qty-row__value" aria-live="polite">
            {quantity}
          </span>
          <button
            aria-label={`${displayLabel} 수량 늘리기`}
            className="public-detail-qty-row__btn"
            disabled={atMax}
            onClick={onIncrease}
            type="button"
          >
            +
          </button>
        </div>
        <span className="public-detail-selected-option__price">
          {formatCurrency(lineTotal)}
        </span>
      </div>
    </div>
  );
}

// 검수 리포트(필기 비율 · 훼손 여부) — A+/A 등 "사용감 있는" 등급에만 노출한다.
// S 등급은 미사용(신규 입고 전량)이라 항상 "필기 0%·훼손 없음"이 되어, 모든 상품에
// 똑같이 붙이면 신호가 0인 cried-wolf가 된다. 그래서 S·미등급에서는 통째로 숨긴다.
function ConditionReport({ display }) {
  const gradeTone = getGradeTone(display?.conditionGradeLabel);
  // a-plus / a 만 노출 대상. s · null(미등급)은 숨김.
  if (gradeTone !== "a-plus" && gradeTone !== "a") return null;

  const writing =
    typeof display?.writingPercentage === "number" &&
    Number.isFinite(display.writingPercentage)
      ? Math.max(0, Math.min(100, Math.trunc(display.writingPercentage)))
      : null;
  const hasDamage =
    typeof display?.hasDamage === "boolean" ? display.hasDamage : null;

  // 보여줄 지표가 하나도 없으면(둘 다 미입력) 블록 자체를 숨긴다.
  if (writing === null && hasDamage === null) return null;

  return (
    <div className="public-detail-condition-report">
      <span className="public-detail-info-notes__label">검수 리포트</span>
      <div className="public-detail-condition-report__items">
        {writing !== null ? (
          <span className="public-detail-condition-report__item">
            <span className="public-detail-condition-report__key">
              필기·표시
            </span>
            <span className="public-detail-condition-report__val">
              {writing === 0 ? "거의 없음" : `약 ${writing}%`}
            </span>
          </span>
        ) : null}
        {hasDamage !== null ? (
          <span
            className={`public-detail-condition-report__item${
              hasDamage ? " public-detail-condition-report__item--warn" : ""
            }`}
          >
            <span className="public-detail-condition-report__key">훼손</span>
            <span className="public-detail-condition-report__val">
              {hasDamage ? "있음 (검수 메모 확인)" : "없음"}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

// AI 요약 아이콘 — public/ai/ai-summary-icon.png 가 없으면(아직 안 올렸으면) 기존
// 스파클 SVG로 폴백. 파일만 그 경로에 추가하면 자동으로 실제 아이콘이 노출된다.
const AI_SUMMARY_ICON_URL = "/ai/ai-summary-icon.png";

function AiSummaryIcon() {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <svg
        aria-hidden="true"
        className="public-detail-ai-summary__icon"
        fill="none"
        height="18"
        viewBox="0 0 24 24"
        width="18"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2L13.8 8.2L20 10L13.8 11.8L12 18L10.2 11.8L4 10L10.2 8.2L12 2Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className="public-detail-ai-summary__icon"
      height={18}
      onError={() => setImageFailed(true)}
      src={AI_SUMMARY_ICON_URL}
      width={18}
    />
  );
}

// AI 요약 — 아직 실제 모델 연동 전이라 틀만 제공. 데이터 연결 전까지 skeleton으로 표시.
function AiSummarySection() {
  return (
    <div aria-label="AI 요약 (준비 중)" className="public-detail-ai-summary">
      <div className="public-detail-ai-summary__header">
        <AiSummaryIcon />
        <span>AI 요약</span>
      </div>
      <div className="public-detail-ai-summary__body">
        <span className="public-detail-ai-summary__line public-store-skeleton" />
        <span className="public-detail-ai-summary__line public-store-skeleton" />
        <span className="public-detail-ai-summary__line public-detail-ai-summary__line--short public-store-skeleton" />
      </div>
    </div>
  );
}

// 상품 상세 사진 — 아직 실제 이미지 연동 전이라 틀만 제공. 데스크톱 2열, 좁은 화면에서 1열.
function DetailPhotoSection() {
  return (
    <div className="public-detail-photo-section">
      <h3 className="public-detail-tab-content__heading">상품 상세 사진</h3>
      <div
        aria-label="상품 상세 사진 (준비 중)"
        className="public-detail-photo-grid"
      >
        <div className="public-detail-photo-grid__item">
          <span>교재 이미지</span>
        </div>
        <div className="public-detail-photo-grid__item">
          <span>교재 이미지</span>
        </div>
      </div>
    </div>
  );
}

// 교재 상세 정보 섹션 — 교재 정보 칸(과목/브랜드/유형 등)과 검수 사진은 삭제.
// 검수 사진은 위쪽 "상품 상세 사진" 섹션으로 이동했다.
function DetailInfoContent({ activeDisplay }) {
  return (
    <>
      <ConditionReport display={activeDisplay} />
      {activeDisplay?.inspectionNotes ? (
        <div className="public-detail-info-notes">
          <span className="public-detail-info-notes__label">검수 메모</span>
          <p className="public-detail-info-notes__body">
            {activeDisplay.inspectionNotes}
          </p>
        </div>
      ) : null}
    </>
  );
}

// 강사 사진 — public/policy/grade-policy.jpg 가 없으면(아직 안 올렸으면) 회색 틀로 폴백.
// 파일만 그 경로에 추가하면 자동으로 실제 사진이 노출된다.
const GRADE_POLICY_IMAGE_URL = "/policy/grade-policy.jpg";

function GradePolicyImage() {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <div
        aria-label="강사 사진 (준비 중)"
        className="public-detail-grade-layout__image"
      >
        <span>강사 사진</span>
      </div>
    );
  }

  return (
    <div className="public-detail-grade-layout__image public-detail-grade-layout__image--photo">
      <img
        alt="수북 검수 담당자"
        onError={() => setImageFailed(true)}
        src={GRADE_POLICY_IMAGE_URL}
      />
    </div>
  );
}

// 수북 검수 정책 섹션 (구 "상태 등급 안내" 탭) — 강사 사진 + 검수 항목 칩 + 등급 안내.
function DetailGradeContent() {
  return (
    <>
      <h3 className="public-detail-tab-content__heading">수북 검수 정책</h3>
      <div className="public-detail-grade-layout">
        <GradePolicyImage />
        <div className="public-detail-grade-layout__content">
          <p className="public-detail-grade-intro">
            수북은 전문 QC센터에서 검수를 마친 상태가 검증된 교재만을
            판매합니다.
          </p>
          <div className="public-detail-grade-checks">
            <span className="public-detail-grade-checks__item">필기율 검사</span>
            <span className="public-detail-grade-checks__item">
              표지/페이지 찢김, 구겨짐 등 하자 검사
            </span>
            <span className="public-detail-grade-checks__item">교재 적합성 검사</span>
            <span className="public-detail-grade-checks__item">불법 복제본 검열</span>
          </div>
          <h4 className="public-detail-grade-subheading">등급 안내</h4>
          <div className="public-detail-grade-list">
            <div className="public-detail-grade-list__item">
              <p className="public-detail-grade-list__title">
                <strong className="public-detail-grade-list__label">S급</strong>{" "}
                - 미사용 새책
              </p>
              <p className="public-detail-grade-list__desc">
                랩핑조차 뜯지 않았거나, 사용감이 느껴지지 않는 완전한 새 책
                상태.
              </p>
            </div>
            <div className="public-detail-grade-list__item">
              <p className="public-detail-grade-list__title">
                <strong className="public-detail-grade-list__label">
                  A+급
                </strong>{" "}
                - 극미한 사용감
              </p>
              <p className="public-detail-grade-list__desc">
                10%미만의 연필 필기 ,이름만 적은 수준, 거의 새책에 준하는
                상태.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// 배송 및 교환 반품 안내 섹션 (구 "배송 안내" + "교환 및 반품 안내" 탭을 한 섹션으로 통합)
function DetailShippingContent() {
  return (
    <>
      <h3 className="public-detail-tab-content__heading">배송 안내</h3>
      <ul className="public-detail-tab-content__list">
        <li>택배사: CJ대한통운</li>
        <li>발송 기준: 결제 확인 후 영업일 기준 1~2일 이내 출고</li>
        <li>
          배송비: 국내 일반 지역 {formatCurrency(SHIPPING_FEE)} ({formatCurrency(FREE_SHIPPING_THRESHOLD)} 이상 구매 시 무료 배송)
        </li>
        <li>제주 지역 추가: 5,000원</li>
        <li>제주 외 도서 산간 지역 추가: 5,000원</li>
        <li>주말 및 공휴일 발송은 익영업일 처리됩니다.</li>
      </ul>

      <h3 className="public-detail-tab-content__heading public-detail-tab-content__heading--spaced">
        교환 및 반품 안내
      </h3>
      <ul className="public-detail-tab-content__list">
        <li>
          상품 수령 후 7일 이내에는 단순 변심으로도 교환·반품이 가능합니다. 이 경우 반품
          배송비(편도)는 구매자 부담입니다.
        </li>
        <li>
          실제 상태가 검수 등급과 다르거나 페이지 누락·심한 훼손이 확인된 경우, 왕복 배송비
          부담 없이 무료로 교환·반품해 드립니다.
        </li>
        <li>
          <strong>포장을 개봉해 사용 흔적이 생겼거나 필기·표시가 추가된 경우</strong>에는 단순
          변심에 의한 교환·반품이 제한될 수 있습니다.
        </li>
        <li>교환·반품 신청은 마이페이지 &gt; 구매내역에서 해주세요.</li>
      </ul>
    </>
  );
}

// 인라인 lightbox: 같은 페이지 내 closure로 구현. ESC 키로 닫기, 좌/우 화살표로 이전/다음.
// 모바일 검수 사진 확대 + 메인 이미지 클릭 줌을 모두 처리.
function ProductImageLightbox({
  images,
  initialIndex,
  captionPrefix,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const overlayRef = useRef(null);
  const total = images?.length ?? 0;

  useEffect(() => {
    setCurrentIndex(
      Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)),
    );
  }, [initialIndex, total]);

  // 모달 열린 동안 body 스크롤 잠금 (모바일에서 배경 스크롤 방지) — 공용 훅으로 중첩 모달 안전
  useBodyScrollLock(true);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      } else if (event.key === "ArrowLeft") {
        setCurrentIndex((idx) => Math.max(0, idx - 1));
      } else if (event.key === "ArrowRight") {
        setCurrentIndex((idx) => Math.min(total - 1, idx + 1));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, total]);

  if (!images || images.length === 0) return null;

  const currentUrl = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  return (
    <div
      aria-label="이미지 크게 보기"
      aria-modal="true"
      className="public-detail-lightbox"
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose?.();
      }}
      ref={overlayRef}
      role="dialog"
    >
      <button
        aria-label="닫기"
        className="public-detail-lightbox__close"
        onClick={onClose}
        type="button"
      >
        <CloseIcon size={20} />
      </button>
      {hasPrev ? (
        <button
          aria-label="이전 이미지"
          className="public-detail-lightbox__nav public-detail-lightbox__nav--prev"
          onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
          type="button"
        >
          ‹
        </button>
      ) : null}
      <figure className="public-detail-lightbox__figure">
        <img
          alt={`${captionPrefix ?? "이미지"} ${currentIndex + 1}`}
          src={getZoomImageUrl(currentUrl)}
        />
        {total > 1 ? (
          <figcaption className="public-detail-lightbox__caption">
            {currentIndex + 1} / {total}
          </figcaption>
        ) : null}
      </figure>
      {hasNext ? (
        <button
          aria-label="다음 이미지"
          className="public-detail-lightbox__nav public-detail-lightbox__nav--next"
          onClick={() => setCurrentIndex((idx) => Math.min(total - 1, idx + 1))}
          type="button"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}

function RelatedProductsRail({ products, favoriteIds, onToggleFavorite }) {
  const railRef = useRef(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const sync = () => {
      const { scrollLeft, scrollWidth, clientWidth } = rail;
      const overflow = scrollWidth - clientWidth > SCROLL_EDGE_THRESHOLD_PX;
      setHasOverflow(overflow);
      setCanScrollPrev(scrollLeft > SCROLL_EDGE_THRESHOLD_PX);
      setCanScrollNext(
        overflow &&
          scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE_THRESHOLD_PX,
      );
    };

    sync();
    rail.addEventListener("scroll", sync, { passive: true });

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(rail);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", sync);
    }

    return () => {
      rail.removeEventListener("scroll", sync);
      if (resizeObserver) resizeObserver.disconnect();
      else if (typeof window !== "undefined")
        window.removeEventListener("resize", sync);
    };
  }, [products.length]);

  const handleScroll = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const firstCard = rail.querySelector(".public-detail-related-rail__item");
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 220;
    const visibleCards = Math.max(
      1,
      Math.floor(rail.clientWidth / (cardWidth + 16)),
    );
    rail.scrollBy({
      left: (cardWidth + 16) * Math.max(1, visibleCards - 1) * direction,
      behavior: "smooth",
    });
  };

  return (
    <section aria-label="비슷한 교재 추천" className="public-detail-related">
      <div className="public-detail-related__header">
        <h2 className="public-detail-related__title">비슷한 교재 추천</h2>
        {hasOverflow ? (
          <div
            className="public-detail-related__nav-group"
            role="group"
            aria-label="가로 스크롤"
          >
            <button
              aria-label="이전 교재 보기"
              className="public-detail-related__nav"
              disabled={!canScrollPrev}
              onClick={() => handleScroll(-1)}
              type="button"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              aria-label="다음 교재 보기"
              className="public-detail-related__nav"
              disabled={!canScrollNext}
              onClick={() => handleScroll(1)}
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}
      </div>

      {products.length ? (
        <div className="public-detail-related-rail" ref={railRef} role="list">
          {products.map((relatedProduct) => (
            <div
              className="public-detail-related-rail__item"
              key={relatedProduct.id}
              role="listitem"
            >
              <ProductCard
                isFavorite={favoriteIds.includes(String(relatedProduct.id))}
                onToggleFavorite={onToggleFavorite}
                product={relatedProduct}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="public-detail-related-empty">
          비슷한 교재가 아직 없어요.
        </div>
      )}
    </section>
  );
}

function PublicProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { requireMember, memberGateDialog, isAuthenticated } =
    usePublicMemberGate();
  const { favoriteIds, isFavoritePending, toggleFavorite } =
    usePublicWishlist();
  const [product, setProduct] = useState(null);
  // 상품명·과목 동적 title + description (SEO/공유 미리보기에 노출)
  usePageMeta({
    title: product?.title
      ? `${product.title}${product.subject ? ` · ${product.subject}` : ""}`
      : undefined,
    description: product?.title
      ? `${product.title}${product.instructor_name ? ` (${product.instructor_name})` : ""} ${product.subject ?? ""} 위탁판매 — 검수 완료된 새 책 수준의 교재를 합리적인 가격에.`
      : undefined,
  });
  const [relatedProducts, setRelatedProducts] = useState([]);
  // 다중 옵션 선택: [{ key: 회차, quantity }]. 단일재고 모델이라 회차별 수량은 그 회차의
  // 남은 책 수로 캡되고, 담기/구매 시 회차별로 distinct한 book_id가 할당된다.
  const [selections, setSelections] = useState([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cartToast, setCartToast] = useState(null);
  // 섹션 nav는 스크롤스파이로 활성 항목을 표시 — 클릭 시 즉시 갱신, 스크롤 중엔 관찰로 갱신.
  const [activeSectionKey, setActiveSectionKey] = useState(
    DETAIL_SECTIONS[0].key,
  );
  const sectionRefs = useRef({});
  const sectionNavRef = useRef(null);
  // P0: 옵션을 못 불러오면 사용자 책임으로 둔갑하는 토스트 대신 explicit error state.
  const [optionLoadError, setOptionLoadError] = useState(false);
  // P1: lightbox 상태 — 메인 이미지 클릭, 검수 사진 클릭 모두 이 모달로 통합.
  const [lightboxState, setLightboxState] = useState(null);
  // P0: 페이지 진입 후 전 회차 품절로 바뀌면 인라인 메시지 표시.
  const wasInStockRef = useRef(false);
  const [justSoldOut, setJustSoldOut] = useState(false);

  const showCartToast = useCallback((message, type = "info") => {
    setCartToast({ message, type });
    setTimeout(() => setCartToast(null), 3000);
  }, []);

  // 회차(option) 단위로 묶은 옵션 그룹 + 파생값.
  const variantGroups = useMemo(
    () => groupOptionsByVariant(product?.options ?? []),
    [product],
  );
  const productHasStock = useMemo(
    () => variantGroups.some((group) => !group.soldOut),
    [variantGroups],
  );
  // 선택을 실제 distinct book 목록으로 펼친 것 — 금액·담기·주문 모두 이걸 기준으로.
  const allocatedBooks = useMemo(
    () => allocateSelectedBooks(variantGroups, selections),
    [variantGroups, selections],
  );
  const selectionSubtotal = useMemo(
    () => allocatedBooks.reduce((sum, book) => sum + (book.price ?? 0), 0),
    [allocatedBooks],
  );
  const selectionCount = allocatedBooks.length;
  const hasSelection = selectionCount > 0;

  // 장바구니 담기 실제 실행 — 사용자 클릭과 "로그인 후 이어서 담기" 양쪽에서 공용.
  // 단일재고 모델이라 책 단위로 add_to_cart를 N번 호출한다(권당 1권).
  const runAddToCartBatch = useCallback(
    async (cartArgsList) => {
      const list = Array.isArray(cartArgsList) ? cartArgsList : [];
      if (list.length === 0) return;
      let ok = 0;
      let fail = 0;
      let demo = false;
      for (const args of list) {
        // 순차 호출: 단일재고 책마다 add_to_cart를 1번씩. (동시 호출해도 무방하나 순서 유지)
        const { data, error } = await addToCart(args);
        if (error) {
          fail += 1;
        } else {
          ok += 1;
          if (data?.demo) demo = true;
        }
      }
      if (ok > 0 && fail === 0) {
        showCartToast(
          demo
            ? `데모 장바구니에 ${ok}개 담았어요.`
            : `장바구니에 ${ok}개 담았어요.`,
        );
      } else if (ok > 0) {
        showCartToast(
          `${ok}개는 담았지만 ${fail}개는 재고가 바뀌어 담지 못했어요.`,
          "error",
        );
      } else {
        showCartToast(
          "장바구니 담기에 실패했어요. 잠시 후 다시 시도해 주세요.",
          "error",
        );
      }
    },
    [showCartToast],
  );

  useEffect(() => {
    let isActive = true;

    const loadDetail = async () => {
      try {
        setIsLoading(true);
        setError("");

        const detailResult = await fetchStorefrontProductDetail(productId);
        if (!isActive) return;

        setProduct(detailResult.product);
        // 옵션이 회차 하나뿐인 단권 상품은 자동 선택해 1-클릭 구매 동선을 유지한다.
        // 회차가 여러 개면 사용자가 직접 고르게 빈 선택으로 시작.
        const initialGroups = groupOptionsByVariant(
          detailResult.product?.options ?? [],
        );
        setSelections(
          initialGroups.length === 1 && !initialGroups[0].soldOut
            ? [{ key: initialGroups[0].key, quantity: 1 }]
            : [],
        );
        setSelectedImageIndex(0);

        if (!detailResult.product) {
          setError(
            detailResult.error
              ? "교재 상세 정보를 불러오지 못했습니다."
              : "해당 교재를 찾지 못했습니다.",
          );
          return;
        }

        // 비슷한 교재 추천: 동일 과목 + 동일 유형(가능하면) + 동일 강사 우선
        const broadResult = await fetchStorefrontProducts({
          subject: detailResult.product.subject,
          limit: 80,
          sort: "popular",
        });
        if (!isActive) return;

        const candidates = (
          broadResult.products ??
          broadResult.books ??
          []
        ).filter((item) => String(item.id) !== String(detailResult.product.id));

        // 점수: 동일 강사(+30) + 동일 유형(+15) + 동일 브랜드(+5)
        const scored = candidates.map((item) => {
          let score = 0;
          if (
            detailResult.product.instructorName &&
            item.instructorName === detailResult.product.instructorName
          ) {
            score += 30;
          }
          if (
            detailResult.product.bookType &&
            item.bookType === detailResult.product.bookType
          ) {
            score += 15;
          }
          if (
            detailResult.product.brand &&
            item.brand === detailResult.product.brand
          ) {
            score += 5;
          }
          return { item, score };
        });

        // 점수 높은 순 → 동일 점수면 인기순(원래 정렬 유지)
        scored.sort((a, b) => b.score - a.score);
        const ranked = scored
          .map((entry) => entry.item)
          .slice(0, RELATED_RAIL_LIMIT);

        // 후보 부족 시 broadResult 의 popular 정렬 그대로 채워 넣음
        if (ranked.length < RELATED_RAIL_LIMIT) {
          const sorted = sortStorefrontProducts(candidates, "popular");
          for (const item of sorted) {
            if (ranked.length >= RELATED_RAIL_LIMIT) break;
            if (
              !ranked.some(
                (existing) => String(existing.id) === String(item.id),
              )
            ) {
              ranked.push(item);
            }
          }
        }

        setRelatedProducts(ranked);
      } catch {
        if (isActive) {
          setProduct(null);
          setRelatedProducts([]);
          setError("교재 상세 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadDetail();
    setActiveSectionKey(DETAIL_SECTIONS[0].key);
    return () => {
      isActive = false;
    };
  }, [productId]);

  // 섹션 nav 스크롤스파이 — 기준선(헤더 + sticky nav 바로 아래)을 마지막으로 지난 섹션을 활성화.
  // isLoading 동안엔 섹션 DOM이 없으므로 로딩이 끝난 뒤에 붙인다. (product만 보면
  // 추천 상품 fetch를 기다리는 중간 렌더에 걸려 리스너가 영영 안 붙는다.)
  useEffect(() => {
    if (isLoading || !product) return undefined;
    const keys = DETAIL_SECTIONS.map((section) => section.key);
    if (keys.every((key) => !sectionRefs.current[key])) return undefined;

    let rafId = null;

    const updateActiveSection = () => {
      rafId = null;
      const navHeight = sectionNavRef.current?.offsetHeight ?? 52;
      // 클릭 스크롤이 섹션 top을 (헤더 + nav + 16px)에 맞추므로 기준선은 그보다 살짝 아래.
      const baselineY = HEADER_OFFSET_PX + navHeight + 24;
      let nextKey = keys[0];
      for (const key of keys) {
        const element = sectionRefs.current[key];
        if (!element) continue;
        if (element.getBoundingClientRect().top <= baselineY) nextKey = key;
      }
      // 페이지 맨 아래에 닿으면 마지막 섹션 — 짧은 화면에서 기준선에 못 닿는 경우 보정.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      ) {
        nextKey = keys[keys.length - 1];
      }
      setActiveSectionKey(nextKey);
    };

    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isLoading, product]);

  // nav 클릭 시 헤더 + sticky nav 높이만큼 오프셋을 빼고 해당 섹션으로 스크롤.
  const scrollToSection = useCallback((key) => {
    const element = sectionRefs.current[key];
    if (!element) return;
    const navHeight = sectionNavRef.current?.offsetHeight ?? 52;
    const top =
      element.getBoundingClientRect().top +
      window.scrollY -
      (HEADER_OFFSET_PX + navHeight + 16);
    window.scrollTo({ top, behavior: "smooth" });
    setActiveSectionKey(key);
  }, []);

  // 옵션 그룹이 비어 있으면(구매 정보 누락) explicit error 표시.
  useEffect(() => {
    if (!product) {
      setOptionLoadError(false);
      return;
    }
    setOptionLoadError(variantGroups.length === 0);
  }, [product, variantGroups]);

  // 더 이상 존재하지 않는(품절·삭제) 회차가 선택목록에 남지 않도록 정리.
  useEffect(() => {
    if (variantGroups.length === 0) return;
    setSelections((prev) => {
      let changed = false;
      const next = [];
      for (const selection of prev) {
        const group = variantGroups.find((item) => item.key === selection.key);
        if (!group || group.soldOut) {
          changed = true;
          continue;
        }
        const clampedQuantity = Math.max(
          1,
          Math.min(selection.quantity, group.availableCount),
        );
        if (clampedQuantity !== selection.quantity) changed = true;
        next.push({ key: selection.key, quantity: clampedQuantity });
      }
      return changed ? next : prev;
    });
  }, [variantGroups]);

  // P0: 페이지 진입 시 in-stock → 전 회차 품절 전환 감지.
  useEffect(() => {
    if (!product) {
      wasInStockRef.current = false;
      setJustSoldOut(false);
      return;
    }
    const soldOut = !productHasStock;
    if (wasInStockRef.current && soldOut) {
      setJustSoldOut(true);
    }
    if (!soldOut) {
      wasInStockRef.current = true;
      setJustSoldOut(false);
    }
  }, [product, productHasStock]);

  // 재입고 알림 구독 상태
  const [isSubscribedRestock, setIsSubscribedRestock] = useState(false);
  const [restockBusy, setRestockBusy] = useState(false);

  // 상품 로드 + 로그인 변경 시 구독 상태 재확인
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!product?.id) {
        setIsSubscribedRestock(false);
        return;
      }
      const { supabase: sb } =
        await import("@shared-supabase/publicSupabaseClient");
      if (!sb) return;
      const { data: sessionData } = await sb.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) setIsSubscribedRestock(false);
        return;
      }
      const { data, error } = await sb.rpc("is_subscribed_restock", {
        p_product_id: Number(product.id),
      });
      if (cancelled) return;
      if (!error) setIsSubscribedRestock(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  const handleToggleRestockSubscribe = async () => {
    if (!product?.id) return;
    if (!requireMember("restockSubscribe")) return;
    const { supabase: sb } =
      await import("@shared-supabase/publicSupabaseClient");
    if (!sb) return;

    setRestockBusy(true);
    try {
      const productIdNum = Number(product.id);
      if (isSubscribedRestock) {
        const { error } = await sb.rpc("unsubscribe_restock", {
          p_product_id: productIdNum,
        });
        if (error) {
          showCartToast(error.message || "구독 취소에 실패했어요.", "error");
        } else {
          setIsSubscribedRestock(false);
          showCartToast("재입고 알림을 해제했어요.");
        }
      } else {
        const { error } = await sb.rpc("subscribe_restock", {
          p_product_id: productIdNum,
        });
        if (error) {
          showCartToast(error.message || "구독에 실패했어요.", "error");
        } else {
          setIsSubscribedRestock(true);
          showCartToast("재입고되면 알림을 보내드릴게요.");
        }
      }
    } finally {
      setRestockBusy(false);
    }
  };

  const galleryImages = useMemo(() => {
    if (!product) return [];
    const nextImages = [
      product.coverImageUrl,
      ...(product.inspectionImageUrls ?? []),
    ].filter(Boolean);
    return Array.from(new Set(nextImages));
  }, [product]);

  useEffect(() => {
    if (selectedImageIndex >= galleryImages.length) setSelectedImageIndex(0);
  }, [galleryImages, selectedImageIndex]);

  const selectedImageUrl =
    galleryImages[selectedImageIndex] ?? product?.coverImageUrl ?? "";
  // 상단 큰 가격/할인/등급칩은 상품 대표값(최저가·대표 등급) 기준 — 회차마다 가격이 같은
  // 모의고사 세트가 대부분이라 대표값으로 충분하고, 라인별 정확 금액은 선택 목록이 보여준다.
  const priceValue = product?.price ?? null;
  const originalPriceValue = product?.originalPrice ?? null;
  const isProductFavorite = product
    ? favoriteIds.includes(String(product.id))
    : false;
  const isProductFavoritePending = product
    ? isFavoritePending(product.id)
    : false;
  // 구매 가능 = 재고 있는 회차가 하나라도 있고, 구매 정보 로드 정상.
  const canPurchase = productHasStock && !optionLoadError;

  // ── 옵션 선택 핸들러 ──────────────────────────────────────────
  const handleAddVariant = useCallback(
    (key) => {
      setSelections((prev) => {
        const group = variantGroups.find((item) => item.key === key);
        if (!group || group.soldOut) return prev;
        const existing = prev.find((selection) => selection.key === key);
        if (existing) {
          // 이미 담긴 회차를 또 고르면 +1, 재고를 다 채웠으면 그대로 두고 안내.
          if (existing.quantity >= group.availableCount) {
            showCartToast("이미 담은 옵션이에요. 남은 수량을 모두 골랐어요.");
            return prev;
          }
          return prev.map((selection) =>
            selection.key === key
              ? { ...selection, quantity: selection.quantity + 1 }
              : selection,
          );
        }
        return [...prev, { key, quantity: 1 }];
      });
    },
    [variantGroups, showCartToast],
  );

  const handleChangeQuantity = useCallback(
    (key, delta) => {
      setSelections((prev) =>
        prev.map((selection) => {
          if (selection.key !== key) return selection;
          const group = variantGroups.find((item) => item.key === key);
          const max = group?.availableCount ?? 1;
          const next = Math.max(1, Math.min(selection.quantity + delta, max));
          return { ...selection, quantity: next };
        }),
      );
    },
    [variantGroups],
  );

  const handleRemoveVariant = useCallback((key) => {
    setSelections((prev) => prev.filter((selection) => selection.key !== key));
  }, []);

  const handleAddToCart = async () => {
    if (!canPurchase || !hasSelection) return;
    const cartArgsList = buildCartArgsFromBooks(product, allocatedBooks);
    if (cartArgsList.length === 0) {
      // 안전망: 할당 실패는 비정상 상태 → explicit error 후 새로고침 유도.
      setOptionLoadError(true);
      return;
    }
    if (
      !requireMember("addToCart", null, {
        type: "addToCart",
        productId: product?.id ?? null,
        cartArgsList,
      })
    )
      return;
    await runAddToCartBatch(cartArgsList);
  };

  const handleBuyNow = async () => {
    if (!canPurchase || !hasSelection) return;
    const orderItems = buildOrderItemsFromBooks(product, allocatedBooks);
    if (orderItems.length === 0) {
      setOptionLoadError(true);
      return;
    }
    if (
      !requireMember("buyNow", null, {
        type: "buyNow",
        productId: product?.id ?? null,
        orderItems,
      })
    )
      return;
    navigate("/order", { state: { items: orderItems } });
  };

  const handleToggleFavorite = async (targetProductId) => {
    if (!targetProductId) return;
    if (
      !requireMember("favorite", null, {
        type: "favorite",
        productId: targetProductId,
      })
    )
      return;
    const result = await toggleFavorite(targetProductId);
    if (result.error) {
      showCartToast("찜 상태를 변경하지 못했어요.", "error");
      return;
    }
    showCartToast(
      result.isFavorite ? "찜 목록에 추가했어요." : "찜을 해제했어요.",
    );
  };

  // 비회원이 담기/바로구매/찜을 눌러 로그인한 경우, 로그인 후 같은 상품으로 돌아오면
  // 저장해 둔 행동을 1회 이어서 실행한다. (이메일 로그인은 from 복귀로 이 페이지에 다시 진입)
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (resumeHandledRef.current) return;
    if (!isAuthenticated || !product) return;
    const pending = readPendingMemberAction();
    if (!pending || String(pending.productId) !== String(product.id)) return;
    resumeHandledRef.current = true;
    clearPendingMemberAction();
    if (pending.type === "addToCart") {
      // 신버전은 cartArgsList(배열). 구버전 단일 cartArgs도 호환.
      const list = Array.isArray(pending.cartArgsList)
        ? pending.cartArgsList
        : pending.cartArgs
          ? [pending.cartArgs]
          : [];
      if (list.length > 0) void runAddToCartBatch(list);
    } else if (pending.type === "buyNow" && Array.isArray(pending.orderItems)) {
      navigate("/order", { state: { items: pending.orderItems } });
    } else if (pending.type === "favorite") {
      void toggleFavorite(product.id).then((result) => {
        if (result?.error) {
          showCartToast("찜 상태를 변경하지 못했어요.", "error");
          return;
        }
        showCartToast(
          result?.isFavorite ? "찜 목록에 추가했어요." : "찜을 해제했어요.",
        );
      });
    }
  }, [
    isAuthenticated,
    product,
    runAddToCartBatch,
    navigate,
    toggleFavorite,
    showCartToast,
  ]);

  // 옵션 선택 목록(데스크톱·모바일 공용 렌더). 미선택 시엔 아무것도 노출하지 않는다.
  const renderSelectedOptions = () => {
    if (selections.length === 0) return null;
    // 옵션이 하나뿐(무옵션 단일상품/단일회차)이면 제거(✕)를 숨기고, 무옵션 그룹은 상품명을 라벨로.
    const isSingleOption = variantGroups.length === 1;
    return (
      <div className="public-detail-selected-options">
        {selections.map((selection) => {
          const group = variantGroups.find(
            (item) => item.key === selection.key,
          );
          if (!group) return null;
          const label = group.key === "" ? product.title : group.label;
          return (
            <SelectedOptionRow
              group={group}
              key={selection.key || "__default__"}
              label={label}
              onDecrease={() => handleChangeQuantity(selection.key, -1)}
              onIncrease={() => handleChangeQuantity(selection.key, 1)}
              onRemove={() => handleRemoveVariant(selection.key)}
              quantity={selection.quantity}
              removable={!isSingleOption}
            />
          );
        })}
      </div>
    );
  };

  const pageContent = (
    <div className="public-product-detail-page">
      <PublicSiteHeader />

      <ContentContainer
        as="section"
        className="public-detail-route"
        aria-label="상품 경로"
      >
        <div className="public-detail-route__crumbs">
          <Link className="public-detail-route__crumb-link" to="/">
            홈
          </Link>
          <span aria-hidden="true">›</span>
          <span className="is-muted">
            {product ? product.title : "교재 상세"}
          </span>
        </div>
      </ContentContainer>

      <ContentContainer as="section" className="public-detail-content">
        {isLoading ? (
          <div
            className="public-detail-skeleton"
            aria-label="교재 상세 정보를 불러오는 중입니다"
          >
            <div className="public-detail-skeleton__media public-store-skeleton" />
            <div className="public-detail-skeleton__info public-store-skeleton" />
          </div>
        ) : error ? (
          <div className="public-detail-error" role="alert">
            {error}
          </div>
        ) : product ? (
          <>
            <div className="public-detail-hero">
              {/* 좌측 이미지 */}
              <div className="public-detail-hero__media">
                {/* P1: 메인 이미지 클릭 시 lightbox로 줌. 모바일에서 핀치 줌 대용. */}
                {/* P2: LCP 최적화 — eager + high priority. */}
                <button
                  aria-label="이미지 크게 보기"
                  className="public-detail-hero__main-image public-detail-hero__main-image--button"
                  disabled={!selectedImageUrl}
                  onClick={() =>
                    selectedImageUrl &&
                    setLightboxState({
                      images: galleryImages,
                      initialIndex: selectedImageIndex,
                      captionPrefix: product.title,
                    })
                  }
                  type="button"
                >
                  {selectedImageUrl ? (
                    <img
                      alt={product.title}
                      decoding="async"
                      fetchpriority="high"
                      loading="eager"
                      src={getDetailImageUrl(selectedImageUrl)}
                    />
                  ) : (
                    <div className="public-detail-hero__placeholder">
                      <span>SUBOOK</span>
                      <p>이미지 준비 중</p>
                    </div>
                  )}
                </button>
                {galleryImages.length > 1 ? (
                  <div className="public-detail-hero__thumbs">
                    {galleryImages.map((imageUrl, index) => (
                      <button
                        aria-label={`${index + 1}번 이미지 보기`}
                        className={`public-detail-hero__thumb${index === selectedImageIndex ? " is-active" : ""}`}
                        key={`${imageUrl}-${index}`}
                        onClick={() => setSelectedImageIndex(index)}
                        type="button"
                      >
                        <img
                          alt=""
                          loading="lazy"
                          src={getThumbnailImageUrl(imageUrl)}
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* 우측 정보 */}
              <div className="public-detail-hero__info">
                <ProductChips
                  brand={product.brand}
                  bookType={product.bookType}
                  conditionGradeLabel={product.conditionGradeLabel}
                  subject={product.subject}
                />

                <h1 className="public-detail-hero__title">{product.title}</h1>

                <ProductPriceLine
                  discountRate={product.discountRate}
                  originalPriceValue={originalPriceValue}
                  priceValue={priceValue}
                />

                {/* 품절 상태만 명시 — 재고 있는 동안은 회차별 "N개 남음"이 선택 목록에서 안내한다.
                    (모든 상품에 똑같은 "단 N권" 시급성을 붙이면 cried-wolf가 되어 학생들이 무시한다.) */}
                {!productHasStock ? (
                  justSoldOut ? (
                    <div className="public-detail-soldout-flash" role="status">
                      방금 다른 분이 구매했어요. 재입고 알림을 받아 보세요.
                    </div>
                  ) : (
                    <div
                      className="public-detail-urgency-badge public-detail-urgency-badge--soldout"
                      role="status"
                    >
                      품절
                    </div>
                  )
                ) : null}

                {/* P0: 구매 정보 누락 → explicit error */}
                {optionLoadError ? (
                  <div className="public-detail-option-error" role="alert">
                    구매 정보를 불러오지 못했어요. 새로고침 후에도 같은 문제면
                    고객센터로 알려주세요.
                  </div>
                ) : null}

                {/* 회차/옵션 선택 — 재고 있을 때만 노출. 품절이면 아래 재입고 알림으로 대체.
                    옵션이 2개 이상일 때만 드롭다운 노출. 단일옵션(수능특강 등)은 드롭다운 없이
                    상품이 바로 선택된 상태로 표시(자동 선택). */}
                {canPurchase ? (
                  <>
                    {variantGroups.length > 1 ? (
                      <VariantSelect
                        disabled={!productHasStock}
                        groups={variantGroups}
                        onAdd={handleAddVariant}
                      />
                    ) : null}
                    {renderSelectedOptions()}
                  </>
                ) : null}

                <dl className="public-detail-hero__summary">
                  <div>
                    <dt>배송비</dt>
                    <dd>
                      {hasSelection &&
                      selectionSubtotal >= FREE_SHIPPING_THRESHOLD
                        ? "무료"
                        : formatCurrency(SHIPPING_FEE)}
                    </dd>
                  </div>
                  <div>
                    <dt>총 상품 금액 ({selectionCount}개)</dt>
                    <dd className="public-detail-hero__summary-total">
                      {hasSelection ? formatCurrency(selectionSubtotal) : "-"}
                    </dd>
                  </div>
                </dl>

                <div className="public-detail-hero__actions">
                  <button
                    aria-label={isProductFavorite ? "찜 취소" : "찜하기"}
                    aria-pressed={isProductFavorite}
                    className={`public-detail-hero__favorite${isProductFavorite ? " is-active" : ""}`}
                    disabled={isProductFavoritePending}
                    onClick={() => {
                      void handleToggleFavorite(product.id);
                    }}
                    type="button"
                  >
                    <HeartIcon filled={isProductFavorite} size={24} />
                  </button>
                  {canPurchase ? (
                    <>
                      <button
                        className="public-detail-hero__btn public-detail-hero__btn--cart"
                        disabled={!hasSelection}
                        onClick={handleAddToCart}
                        type="button"
                      >
                        장바구니 담기
                      </button>
                      <button
                        className="public-detail-hero__btn public-detail-hero__btn--buy"
                        disabled={!hasSelection}
                        onClick={handleBuyNow}
                        type="button"
                      >
                        바로 구매하기
                      </button>
                    </>
                  ) : (
                    <button
                      className="public-detail-hero__btn public-detail-hero__btn--buy"
                      disabled={restockBusy}
                      onClick={handleToggleRestockSubscribe}
                      type="button"
                    >
                      {restockBusy
                        ? "처리 중..."
                        : isSubscribedRestock
                          ? <><BellIcon size={14} /> 재입고 알림 받는 중 (해제)</>
                          : <><BellIcon size={14} /> 재입고 알림 받기</>}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* sticky 범위 한정: 탭 nav + 3개 섹션까지만 감싸 '비슷한 교재 추천' 앞에서 sticky가 풀리도록 */}
            <div className="public-detail-sticky-scope">
            {/* 섹션 nav — sticky. 클릭하면 아래 섹션으로 스크롤, 스크롤 중엔 현재 섹션을 하이라이트. */}
            <nav
              aria-label="상품 안내 섹션"
              className="public-detail-tabs"
              ref={sectionNavRef}
            >
              {DETAIL_SECTIONS.map((section) => (
                <button
                  aria-current={
                    activeSectionKey === section.key ? "true" : undefined
                  }
                  className={`public-detail-tabs__btn${activeSectionKey === section.key ? " is-active" : ""}`}
                  key={section.key}
                  onClick={() => scrollToSection(section.key)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <section
              aria-label="교재 상세 정보"
              className="public-detail-tab-content"
              id="detail-section-info"
              ref={(element) => {
                sectionRefs.current.info = element;
              }}
            >
              <AiSummarySection />
              <DetailPhotoSection />
              <DetailInfoContent activeDisplay={product} />
            </section>

            <section
              aria-label="수북 검수 정책"
              className="public-detail-tab-content"
              id="detail-section-grade"
              ref={(element) => {
                sectionRefs.current.grade = element;
              }}
            >
              <DetailGradeContent />
            </section>

            <section
              aria-label="배송 및 교환 반품 안내"
              className="public-detail-tab-content"
              id="detail-section-shipping"
              ref={(element) => {
                sectionRefs.current.shipping = element;
              }}
            >
              <DetailShippingContent />
            </section>
            </div>

            {/* 비슷한 교재 추천 (가로 스크롤) */}
            <RelatedProductsRail
              favoriteIds={favoriteIds}
              onToggleFavorite={handleToggleFavorite}
              products={relatedProducts}
            />
          </>
        ) : null}
      </ContentContainer>

      <PublicFooter />
      {memberGateDialog}

      {cartToast && (
        <div
          className={`public-detail-toast${cartToast.type === "error" ? " public-detail-toast--error" : ""}`}
          role="alert"
        >
          {cartToast.message}
        </div>
      )}

      {/* P1: 이미지 lightbox — 메인 이미지 클릭 + 검수 사진 통합 */}
      {lightboxState ? (
        <ProductImageLightbox
          captionPrefix={lightboxState.captionPrefix}
          images={lightboxState.images}
          initialIndex={lightboxState.initialIndex}
          onClose={() => setLightboxState(null)}
        />
      ) : null}

      {/* 모바일 sticky 구매바 — 모바일에서만 표시 (CSS @media로 제어) */}
      <div
        className="public-detail-sticky-bar"
        role="region"
        aria-label="구매 액션 바"
      >
        <button
          aria-label={isProductFavorite ? "찜 취소" : "찜하기"}
          aria-pressed={isProductFavorite}
          className={`public-detail-sticky-bar__favorite${isProductFavorite ? " is-active" : ""}`}
          disabled={isProductFavoritePending}
          onClick={() => {
            void handleToggleFavorite(product.id);
          }}
          type="button"
        >
          <HeartIcon filled={isProductFavorite} size={22} />
        </button>
        <div className="public-detail-sticky-bar__price">
          <span className="public-detail-sticky-bar__price-label">
            총 {selectionCount}개
          </span>
          <span className="public-detail-sticky-bar__price-value">
            {hasSelection ? formatCurrency(selectionSubtotal) : "-"}
          </span>
        </div>
        {canPurchase ? (
          <>
            <button
              className="public-detail-sticky-bar__btn public-detail-sticky-bar__btn--cart"
              disabled={!hasSelection}
              onClick={handleAddToCart}
              type="button"
            >
              장바구니
            </button>
            <button
              className="public-detail-sticky-bar__btn public-detail-sticky-bar__btn--buy"
              disabled={!hasSelection}
              onClick={handleBuyNow}
              type="button"
            >
              구매하기
            </button>
          </>
        ) : (
          <button
            className="public-detail-sticky-bar__btn public-detail-sticky-bar__btn--buy"
            disabled={restockBusy}
            onClick={handleToggleRestockSubscribe}
            type="button"
          >
            {restockBusy
              ? "처리 중..."
              : isSubscribedRestock
                ? <><BellIcon size={14} /> 알림 해제</>
                : <><BellIcon size={14} /> 재입고 알림</>}
          </button>
        )}
      </div>
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicProductDetailPage;
