import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatCurrency, formatDate } from "@shared-domain/format";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import ContentContainer from "../components/ContentContainer";
import ProductCard from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, addToCart } from "../lib/cart";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePageMeta } from "../lib/usePageMeta";
import {
  fetchStorefrontProductDetail,
  fetchStorefrontProducts,
  sortStorefrontProducts,
} from "../lib/storefront";
import "./PublicProductDetailPage.css";

// 단일재고 모델(1 books row = 1 physical book)이므로 사용자가 1권만 살 수 있다.
// 추후 다중 재고 도입 시 이 상수만 풀면 된다.
const FALLBACK_MAX_QUANTITY = 1;
const RELATED_RAIL_LIMIT = 12;
const SCROLL_EDGE_THRESHOLD_PX = 4;

const DETAIL_TABS = [
  { key: "info", label: "정보" },
  { key: "grade", label: "상태 등급 안내" },
  { key: "shipping", label: "배송 안내" },
  { key: "return", label: "교환 및 반품 안내" },
];

function getAvailabilitySnapshot(item) {
  if (!item) {
    return {
      availableCount: null,
      isSoldOut: false,
      availabilityLabel: "재고 정보 없음",
      maxQuantity: FALLBACK_MAX_QUANTITY,
    };
  }

  const availableCount =
    item.availableCount ??
    item.stockCount ??
    item.quantityAvailable ??
    item.remainingCount ??
    item.available_quantity ??
    null;
  const normalizedAvailableCount =
    typeof availableCount === "number" && Number.isFinite(availableCount) && availableCount >= 0
      ? Math.trunc(availableCount)
      : null;
  const isSoldOut =
    Boolean(item.isSoldOut) ||
    item.status === "sold_out" ||
    normalizedAvailableCount === 0;
  // 단일재고 모델: option별 availableCount와 무관하게 한 books row는 1권만 판매됨.
  // 사용자는 항상 1권만 주문 가능. quantity stepper UX는 유지하되 최대값 1로 캡.
  const maxQuantity = 1;

  return {
    availableCount: normalizedAvailableCount,
    isSoldOut,
    availabilityLabel:
      item.availabilityLabel ??
      (isSoldOut
        ? "품절"
        : normalizedAvailableCount === null
          ? "재고 정보 없음"
          : `재고 ${normalizedAvailableCount}권`),
    maxQuantity,
  };
}

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
        <span className="public-detail-price-line__amount" aria-label="판매가">가격 미입력</span>
      </div>
    );
  }

  const computedDiscount =
    typeof discountRate === "number" && discountRate > 0
      ? discountRate
      : originalPriceValue && originalPriceValue > priceValue
        ? Math.round(((originalPriceValue - priceValue) / originalPriceValue) * 100)
        : null;

  const savings =
    originalPriceValue && originalPriceValue > priceValue
      ? originalPriceValue - priceValue
      : 0;

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
      {savings > 0 ? (
        <p className="public-detail-price-line__savings">
          정가 대비 {formatCurrency(savings)} 아꼈어요
        </p>
      ) : null}
    </div>
  );
}

function OptionDropdown({ options, selectedOptionId, onSelect, disabled }) {
  if (!options.length) return null;

  return (
    <div className="public-detail-option-row">
      <label className="public-detail-option-row__label" htmlFor="public-detail-option-select">
        옵션
      </label>
      <select
        className="public-detail-option-row__select"
        disabled={disabled}
        id="public-detail-option-select"
        onChange={(event) => onSelect(event.target.value)}
        value={selectedOptionId}
      >
        {options.map((option) => {
          const availability = getAvailabilitySnapshot(option);
          const priceLabel = option.price === null ? "가격 미정" : formatCurrency(option.price);
          const baseLabel = option.conditionGradeLabel || option.option || "옵션";
          const subLabel = option.option && option.conditionGradeLabel ? ` · ${option.option}` : "";
          const stockLabel = availability.isSoldOut ? " · 품절" : "";
          return (
            <option key={option.id} value={option.id} disabled={availability.isSoldOut}>
              {baseLabel}{subLabel} | {priceLabel}{stockLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function QuantityRow({ value, maxQuantity, disabled, onDecrease, onIncrease }) {
  return (
    <div className="public-detail-qty-row">
      <button
        aria-label="수량 줄이기"
        className="public-detail-qty-row__btn"
        disabled={disabled || value <= 1}
        onClick={onDecrease}
        type="button"
      >
        −
      </button>
      <span className="public-detail-qty-row__value" aria-live="polite">
        {value}
      </span>
      <button
        aria-label="수량 늘리기"
        className="public-detail-qty-row__btn"
        disabled={disabled || value >= maxQuantity}
        onClick={onIncrease}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function DetailTabPanel({ activeKey, product, activeDisplay, onOpenLightbox }) {
  if (activeKey === "grade") {
    return (
      <div className="public-detail-tab-content">
        <h3 className="public-detail-tab-content__heading">상태 등급 안내</h3>
        <ul className="public-detail-tab-content__list">
          <li><strong>S (새 책)</strong> · 필기·형광펜이 전혀 없고 표지·내지가 양호한 미사용 교재. 2026년 5월부터 신규 입고는 모두 S 등급으로 매입합니다. (비닐 개봉은 무관)</li>
          <li><strong>A+ (사용감 적음)</strong> · 일부 페이지에 가벼운 필기/표시가 있으나 전반적으로 깨끗 (필기 10% 이하). 기존 재고 소진까지 운영.</li>
        </ul>
        <p className="public-detail-tab-content__note">
          모든 교재는 4단계 검수 (외관 · 내지 · 누락 · 훼손) 후 등급이 부여됩니다.
          신규 입고는 S 기준 미달 시 즉시 폐기됩니다.
        </p>
      </div>
    );
  }

  if (activeKey === "shipping") {
    return (
      <div className="public-detail-tab-content">
        <h3 className="public-detail-tab-content__heading">배송 안내</h3>
        <ul className="public-detail-tab-content__list">
          <li>택배사: CJ대한통운</li>
          <li>발송 기준: 결제 확인 후 영업일 기준 1~2일 이내 출고</li>
          <li>
            배송비: 일반 {formatCurrency(SHIPPING_FEE)} / {formatCurrency(FREE_SHIPPING_THRESHOLD)} 이상 구매 시 무료 배송
          </li>
          <li>제주·도서산간 추가 배송비: 3,000원~</li>
          <li>주말 및 공휴일 발송은 익영업일 처리됩니다.</li>
        </ul>
      </div>
    );
  }

  if (activeKey === "return") {
    return (
      <div className="public-detail-tab-content">
        <h3 className="public-detail-tab-content__heading">교환 및 반품 안내</h3>
        <ul className="public-detail-tab-content__list">
          <li>수령 후 7일 이내 단순 변심으로 교환·반품 가능 (왕복 배송비 고객 부담)</li>
          <li>교재의 상태가 검수 등급과 다르거나, 페이지 누락·심한 훼손이 발견된 경우 무료 교환·반품</li>
          <li>
            <strong>포장을 개봉했거나 필기·표시가 추가된 경우</strong>에는 단순 변심에 의한 환불이 제한됩니다.
          </li>
          <li>주문 제작 / 사용 흔적이 더해진 교재는 교환·반품이 제한될 수 있습니다.</li>
          <li>마이페이지 &gt; 구매 내역에서 신청해 주세요.</li>
        </ul>
      </div>
    );
  }

  // 기본: 정보 탭
  return (
    <div className="public-detail-tab-content">
      <h3 className="public-detail-tab-content__heading">교재 정보</h3>
      <dl className="public-detail-info-dl">
        <div><dt>과목</dt><dd>{product.subject || "미등록"}</dd></div>
        <div><dt>브랜드</dt><dd>{product.brand || "미등록"}</dd></div>
        <div><dt>유형</dt><dd>{product.bookType || "미등록"}</dd></div>
        <div><dt>연도</dt><dd>{product.publishedYear || "미등록"}</dd></div>
        <div><dt>강사명</dt><dd>{product.instructorName || "미등록"}</dd></div>
      </dl>
      {activeDisplay?.inspectionNotes ? (
        <div className="public-detail-info-notes">
          <span className="public-detail-info-notes__label">검수 메모</span>
          <p className="public-detail-info-notes__body">{activeDisplay.inspectionNotes}</p>
        </div>
      ) : null}
      {product.inspectionImageUrls?.length ? (
        <div className="public-detail-info-images">
          <span className="public-detail-info-notes__label">검수 사진</span>
          <div className="public-detail-info-images__grid">
            {product.inspectionImageUrls.map((imageUrl, index) => (
              <button
                aria-label={`${product.title} 검수 사진 ${index + 1} 크게 보기`}
                className="public-detail-info-images__item"
                key={`${imageUrl}-${index}`}
                onClick={() => onOpenLightbox?.(product.inspectionImageUrls ?? [], index, `${product.title} 검수 사진`)}
                type="button"
              >
                <img alt={`${product.title} 검수 사진 ${index + 1}`} loading="lazy" src={imageUrl} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 인라인 lightbox: 같은 페이지 내 closure로 구현. ESC 키로 닫기, 좌/우 화살표로 이전/다음.
// 모바일 검수 사진 확대 + 메인 이미지 클릭 줌을 모두 처리.
function ProductImageLightbox({ images, initialIndex, captionPrefix, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const overlayRef = useRef(null);
  const total = images?.length ?? 0;

  useEffect(() => {
    setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)));
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
        ✕
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
        <img alt={`${captionPrefix ?? "이미지"} ${currentIndex + 1}`} src={currentUrl} />
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
      setCanScrollNext(overflow && scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE_THRESHOLD_PX);
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
      else if (typeof window !== "undefined") window.removeEventListener("resize", sync);
    };
  }, [products.length]);

  const handleScroll = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const firstCard = rail.querySelector(".public-detail-related-rail__item");
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 220;
    const visibleCards = Math.max(1, Math.floor(rail.clientWidth / (cardWidth + 16)));
    rail.scrollBy({ left: (cardWidth + 16) * Math.max(1, visibleCards - 1) * direction, behavior: "smooth" });
  };

  return (
    <section aria-label="비슷한 교재 추천" className="public-detail-related">
      <div className="public-detail-related__header">
        <h2 className="public-detail-related__title">비슷한 교재 추천</h2>
        {hasOverflow ? (
          <div className="public-detail-related__nav-group" role="group" aria-label="가로 스크롤">
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
            <div className="public-detail-related-rail__item" key={relatedProduct.id} role="listitem">
              <ProductCard
                isFavorite={favoriteIds.includes(String(relatedProduct.id))}
                onToggleFavorite={onToggleFavorite}
                product={relatedProduct}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="public-detail-related-empty">비슷한 교재가 아직 없어요.</div>
      )}
    </section>
  );
}

function PublicProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, isFavoritePending, toggleFavorite } = usePublicWishlist();
  const [product, setProduct] = useState(null);
  // 상품명·과목 동적 title + description (SEO/공유 미리보기에 노출)
  usePageMeta({
    title: product?.title ? `${product.title}${product.subject ? ` · ${product.subject}` : ""}` : undefined,
    description: product?.title
      ? `${product.title}${product.instructor_name ? ` (${product.instructor_name})` : ""} ${product.subject ?? ""} 위탁판매 — 검수 완료된 새 책 수준의 교재를 합리적인 가격에.`
      : undefined,
  });
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cartToast, setCartToast] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState("info");
  // P0: 옵션 미선택 시 사용자 책임으로 둔갑하는 토스트 대신 explicit error state.
  const [optionLoadError, setOptionLoadError] = useState(false);
  // P1: lightbox 상태 — 메인 이미지 클릭, 검수 사진 클릭 모두 이 모달로 통합.
  const [lightboxState, setLightboxState] = useState(null);
  // P0: 단일재고 정책 → 페이지 진입 후 sold_out으로 바뀌면 인라인 메시지 표시.
  // TODO(backend): Supabase Realtime 채널이 별도 작업. 현재는 옵션 변경/재방문 시점 갱신만.
  const wasInStockRef = useRef(false);
  const [justSoldOut, setJustSoldOut] = useState(false);

  const showCartToast = useCallback((message, type = "info") => {
    setCartToast({ message, type });
    setTimeout(() => setCartToast(null), 3000);
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadDetail = async () => {
      try {
        setIsLoading(true);
        setError("");

        const detailResult = await fetchStorefrontProductDetail(productId);
        if (!isActive) return;

        setProduct(detailResult.product);
        const availableOption =
          detailResult.options.find((option) => !getAvailabilitySnapshot(option).isSoldOut) ??
          detailResult.options[0] ??
          null;
        setSelectedOptionId(availableOption?.id ?? detailResult.product?.selectedOptionId ?? "");
        setSelectedImageIndex(0);
        setQuantity(1);

        if (!detailResult.product) {
          setError(detailResult.error ? "교재 상세 정보를 불러오지 못했습니다." : "해당 교재를 찾지 못했습니다.");
          return;
        }

        // 비슷한 교재 추천: 동일 과목 + 동일 유형(가능하면) + 동일 강사 우선
        const broadResult = await fetchStorefrontProducts({
          subject: detailResult.product.subject,
          limit: 80,
          sort: "popular",
        });
        if (!isActive) return;

        const candidates = (broadResult.products ?? broadResult.books ?? []).filter(
          (item) => String(item.id) !== String(detailResult.product.id),
        );

        // 점수: 동일 강사(+30) + 동일 유형(+15) + 동일 브랜드(+5)
        const scored = candidates.map((item) => {
          let score = 0;
          if (
            detailResult.product.instructorName &&
            item.instructorName === detailResult.product.instructorName
          ) {
            score += 30;
          }
          if (detailResult.product.bookType && item.bookType === detailResult.product.bookType) {
            score += 15;
          }
          if (detailResult.product.brand && item.brand === detailResult.product.brand) {
            score += 5;
          }
          return { item, score };
        });

        // 점수 높은 순 → 동일 점수면 인기순(원래 정렬 유지)
        scored.sort((a, b) => b.score - a.score);
        const ranked = scored.map((entry) => entry.item).slice(0, RELATED_RAIL_LIMIT);

        // 후보 부족 시 broadResult 의 popular 정렬 그대로 채워 넣음
        if (ranked.length < RELATED_RAIL_LIMIT) {
          const sorted = sortStorefrontProducts(candidates, "popular");
          for (const item of sorted) {
            if (ranked.length >= RELATED_RAIL_LIMIT) break;
            if (!ranked.some((existing) => String(existing.id) === String(item.id))) {
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
    setActiveTabKey("info");
    return () => {
      isActive = false;
    };
  }, [productId]);

  const selectedOption = useMemo(() => {
    if (!product?.options?.length) return null;
    return product.options.find((option) => option.id === selectedOptionId) ?? product.options[0] ?? null;
  }, [product, selectedOptionId]);

  useEffect(() => {
    if (!product?.options?.length) return;
    if (!selectedOptionId) {
      setSelectedOptionId(product.options[0]?.id ?? "");
      return;
    }
    if (!product.options.some((option) => option.id === selectedOptionId)) {
      setSelectedOptionId(product.options[0]?.id ?? "");
    }
  }, [product, selectedOptionId]);

  const activeDisplay = selectedOption ?? product;
  const activeAvailability = getAvailabilitySnapshot(activeDisplay);
  // P0: 구매 정보(bookId)를 못 불러오면 explicit error. 사용자 책임으로 둔갑하는
  // "옵션 선택해 주세요" 토스트보다 솔직한 안내가 신뢰감을 준다.
  const hasResolvedOption = Boolean(selectedOption?.id);
  const canPurchase = !activeAvailability.isSoldOut && hasResolvedOption && !optionLoadError;

  // 옵션이 비어 있고 product가 있으면 explicit error 표시.
  useEffect(() => {
    if (!product) {
      setOptionLoadError(false);
      return;
    }
    const hasAnyOption = (product.options ?? []).length > 0;
    setOptionLoadError(!hasAnyOption);
  }, [product]);

  // P0: 페이지 진입 시 in-stock → sold_out 전환 감지.
  useEffect(() => {
    if (!product) {
      wasInStockRef.current = false;
      setJustSoldOut(false);
      return;
    }
    const isCurrentlySoldOut = activeAvailability.isSoldOut;
    if (wasInStockRef.current && isCurrentlySoldOut) {
      setJustSoldOut(true);
    }
    if (!isCurrentlySoldOut) {
      wasInStockRef.current = true;
      setJustSoldOut(false);
    }
  }, [product, activeAvailability.isSoldOut]);

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
      const { supabase: sb } = await import("@shared-supabase/publicSupabaseClient");
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
    const { supabase: sb } = await import("@shared-supabase/publicSupabaseClient");
    if (!sb) return;

    setRestockBusy(true);
    try {
      const productIdNum = Number(product.id);
      if (isSubscribedRestock) {
        const { error } = await sb.rpc("unsubscribe_restock", { p_product_id: productIdNum });
        if (error) {
          showCartToast(error.message || "구독 취소에 실패했어요.", "error");
        } else {
          setIsSubscribedRestock(false);
          showCartToast("재입고 알림을 해제했어요.");
        }
      } else {
        const { error } = await sb.rpc("subscribe_restock", { p_product_id: productIdNum });
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

  useEffect(() => {
    setQuantity((current) => Math.min(Math.max(1, current), activeAvailability.maxQuantity));
  }, [activeAvailability.maxQuantity]);

  const galleryImages = useMemo(() => {
    if (!product) return [];
    const nextImages = [
      product.coverImageUrl,
      ...(product.inspectionImageUrls ?? []),
      selectedOption?.coverImageUrl,
      ...(selectedOption?.inspectionImageUrls ?? []),
    ].filter(Boolean);
    return Array.from(new Set(nextImages));
  }, [product, selectedOption]);

  useEffect(() => {
    if (selectedImageIndex >= galleryImages.length) setSelectedImageIndex(0);
  }, [galleryImages, selectedImageIndex]);

  const selectedImageUrl = galleryImages[selectedImageIndex] ?? activeDisplay?.coverImageUrl ?? "";
  const priceValue = activeDisplay?.price ?? product?.price ?? null;
  const originalPriceValue = activeDisplay?.originalPrice ?? product?.originalPrice ?? null;
  const totalPriceValue = priceValue === null ? null : priceValue * quantity;
  const isProductFavorite = product ? favoriteIds.includes(String(product.id)) : false;
  const isProductFavoritePending = product ? isFavoritePending(product.id) : false;

  const handleAddToCart = async () => {
    if (!canPurchase) return;
    if (!requireMember("addToCart")) return;
    // selectedOption.id 는 books.id 의 string 표현 — 우선 사용.
    // canPurchase 가드에서 이미 hasResolvedOption을 검사하므로 여기 도달하면 bookId가 있다.
    const bookId = selectedOption?.id ?? null;
    if (!bookId) {
      // 안전망: 비정상 상태이므로 explicit error를 보여주고 페이지 새로고침 유도.
      setOptionLoadError(true);
      return;
    }
    const { data: cartData, error: cartError } = await addToCart({
      bookId,
      productId: product?.productId ?? null,
      quantity: 1,
      productMeta: {
        title: product?.title,
        subject: product?.subject,
        brand: product?.brand,
        optionLabel: activeDisplay?.option ?? null,
        conditionGrade: activeDisplay?.conditionGradeLabel ?? activeDisplay?.conditionGrade ?? null,
        coverImageUrl: activeDisplay?.coverImageUrl ?? product?.coverImageUrl ?? null,
        price: priceValue,
      },
    });
    if (cartError) {
      const detailMessage =
        cartError?.message ||
        cartError?.details ||
        "장바구니 담기에 실패했습니다.";
      showCartToast(detailMessage, "error");
      return;
    }
    showCartToast(cartData?.demo ? "데모 장바구니에 담았습니다." : "장바구니에 담았습니다.");
  };

  const handleBuyNow = async () => {
    if (!canPurchase) return;
    if (!requireMember("buyNow")) return;
    // canPurchase 가드에서 hasResolvedOption 검사 완료. bookId 누락은 비정상 상태.
    const bookId = selectedOption?.id;
    if (!bookId) {
      setOptionLoadError(true);
      return;
    }
    const orderPayload = [{
      bookId,
      productId: product?.productId ?? null,
      quantity: 1,
      title: product?.title ?? "",
      optionLabel: activeDisplay?.option ?? activeDisplay?.conditionGradeLabel ?? "",
      conditionGrade: activeDisplay?.conditionGrade ?? "",
      coverImageUrl: activeDisplay?.coverImageUrl ?? product?.coverImageUrl ?? "",
      price: priceValue,
    }];
    navigate("/order", { state: { items: orderPayload } });
  };

  const handleToggleFavorite = async (targetProductId) => {
    if (!targetProductId) return;
    if (!requireMember("favorite")) return;
    const result = await toggleFavorite(targetProductId);
    if (result.error) {
      showCartToast("찜 상태를 변경하지 못했어요.", "error");
      return;
    }
    showCartToast(result.isFavorite ? "찜 목록에 추가했어요." : "찜을 해제했어요.");
  };

  const pageContent = (
    <div className="public-product-detail-page">
      <PublicSiteHeader />

      <ContentContainer as="section" className="public-detail-route" aria-label="상품 경로">
        <div className="public-detail-route__crumbs">
          <Link className="public-detail-route__crumb-link" to="/">
            홈
          </Link>
          <span aria-hidden="true">›</span>
          <span className="is-muted">{product ? product.title : "교재 상세"}</span>
        </div>
      </ContentContainer>

      <ContentContainer as="section" className="public-detail-content">
        {isLoading ? (
          <div className="public-detail-skeleton" aria-label="교재 상세 정보를 불러오는 중입니다">
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
                      src={selectedImageUrl}
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
                        <img alt="" loading="lazy" src={imageUrl} />
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
                  conditionGradeLabel={activeDisplay?.conditionGradeLabel}
                  subject={product.subject}
                />

                <h1 className="public-detail-hero__title">{product.title}</h1>

                <ProductPriceLine
                  discountRate={activeDisplay?.discountRate}
                  originalPriceValue={originalPriceValue}
                  priceValue={priceValue}
                />

                {/* 단일재고 정책 정보 — 시급성 톤이 아닌 사실 톤. */}
                {/* 모든 상품에 같은 "단 1권" 시급성을 붙이면 cried-wolf가 되어 학생들이 무시한다. */}
                {!activeAvailability.isSoldOut ? (
                  <div className="public-detail-urgency-badge public-detail-urgency-badge--info" role="status">
                    <span aria-hidden="true">📦</span>
                    <span>재고 1개 남음</span>
                  </div>
                ) : justSoldOut ? (
                  <div className="public-detail-soldout-flash" role="status">
                    방금 다른 분이 구매했어요. 재입고 알림을 받아 보세요.
                  </div>
                ) : (
                  <div className="public-detail-urgency-badge public-detail-urgency-badge--soldout" role="status">
                    {activeAvailability.availabilityLabel}
                  </div>
                )}

                {/* P0: 옵션 미선택 → "옵션 선택해주세요" 토스트 대신 explicit error */}
                {optionLoadError ? (
                  <div className="public-detail-option-error" role="alert">
                    구매 정보를 불러오지 못했어요. 새로고침 후에도 같은 문제면 고객센터로 알려주세요.
                  </div>
                ) : null}

                <dl className="public-detail-hero__summary">
                  <div>
                    <dt>배송비</dt>
                    <dd>
                      {priceValue !== null && priceValue >= FREE_SHIPPING_THRESHOLD
                        ? "무료"
                        : formatCurrency(SHIPPING_FEE)}
                    </dd>
                  </div>
                  <div>
                    <dt>총 상품 금액 ({quantity}개)</dt>
                    <dd className="public-detail-hero__summary-total">
                      {totalPriceValue === null ? "-" : formatCurrency(totalPriceValue)}
                    </dd>
                  </div>
                </dl>

                <OptionDropdown
                  disabled={!canPurchase}
                  onSelect={setSelectedOptionId}
                  options={product.options ?? []}
                  selectedOptionId={selectedOptionId}
                />

                <QuantityRow
                  disabled={!canPurchase}
                  maxQuantity={activeAvailability.maxQuantity}
                  onDecrease={() => setQuantity((current) => Math.max(1, current - 1))}
                  onIncrease={() =>
                    setQuantity((current) => Math.min(activeAvailability.maxQuantity, current + 1))
                  }
                  value={quantity}
                />

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
                    <span aria-hidden="true">{isProductFavorite ? "♥" : "♡"}</span>
                  </button>
                  {canPurchase ? (
                    <>
                      <button
                        className="public-detail-hero__btn public-detail-hero__btn--cart"
                        onClick={handleAddToCart}
                        type="button"
                      >
                        장바구니 담기
                      </button>
                      <button
                        className="public-detail-hero__btn public-detail-hero__btn--buy"
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
                          ? "🔔 재입고 알림 받는 중 (해제)"
                          : "🔔 재입고 알림 받기"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="public-detail-tabs" role="tablist" aria-label="상품 안내 탭">
              {DETAIL_TABS.map((tab) => (
                <button
                  aria-selected={activeTabKey === tab.key}
                  className={`public-detail-tabs__btn${activeTabKey === tab.key ? " is-active" : ""}`}
                  key={tab.key}
                  onClick={() => setActiveTabKey(tab.key)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <DetailTabPanel
              activeKey={activeTabKey}
              activeDisplay={activeDisplay}
              onOpenLightbox={(images, initialIndex, captionPrefix) =>
                setLightboxState({ images, initialIndex, captionPrefix })
              }
              product={product}
            />

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
      <div className="public-detail-sticky-bar" role="region" aria-label="구매 액션 바">
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
          <span aria-hidden="true">{isProductFavorite ? "♥" : "♡"}</span>
        </button>
        <div className="public-detail-sticky-bar__price">
          <span className="public-detail-sticky-bar__price-label">총 {quantity}개</span>
          <span className="public-detail-sticky-bar__price-value">
            {totalPriceValue === null ? "-" : formatCurrency(totalPriceValue)}
          </span>
        </div>
        {canPurchase ? (
          <>
            <button
              className="public-detail-sticky-bar__btn public-detail-sticky-bar__btn--cart"
              onClick={handleAddToCart}
              type="button"
            >
              장바구니
            </button>
            <button
              className="public-detail-sticky-bar__btn public-detail-sticky-bar__btn--buy"
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
                ? "🔔 알림 해제"
                : "🔔 재입고 알림"}
          </button>
        )}
      </div>
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicProductDetailPage;
