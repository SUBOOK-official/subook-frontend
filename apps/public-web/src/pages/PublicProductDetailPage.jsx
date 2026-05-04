import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatCurrency, formatDate } from "@shared-domain/format";
import ContentContainer from "../components/ContentContainer";
import ProductCard from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { addToCart } from "../lib/cart";
import usePublicMemberGate from "../lib/publicMemberGate";
import {
  fetchStorefrontProductDetail,
  fetchStorefrontProducts,
  sortStorefrontProducts,
} from "../lib/storefront";
import "./PublicProductDetailPage.css";

const FALLBACK_MAX_QUANTITY = 9;
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
  const maxQuantity =
    normalizedAvailableCount !== null && normalizedAvailableCount > 0
      ? normalizedAvailableCount
      : FALLBACK_MAX_QUANTITY;

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

function ProductChips({ subject, bookType, brand, conditionGradeLabel }) {
  const items = [
    subject ? { type: "subject", label: subject } : null,
    bookType ? { type: "type", label: bookType } : null,
    brand ? { type: "brand", label: brand } : null,
    conditionGradeLabel ? { type: "grade", label: conditionGradeLabel } : null,
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="public-detail-chips">
      {items.map((item) => (
        <span className={`public-detail-chip public-detail-chip--${item.type}`} key={`${item.type}-${item.label}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ProductPriceLine({ priceValue, originalPriceValue, discountRate }) {
  if (priceValue === null) {
    return (
      <div className="public-detail-price-line">
        <span className="public-detail-price-line__amount">가격 미입력</span>
      </div>
    );
  }

  const computedDiscount =
    typeof discountRate === "number" && discountRate > 0
      ? discountRate
      : originalPriceValue && originalPriceValue > priceValue
        ? Math.round(((originalPriceValue - priceValue) / originalPriceValue) * 100)
        : null;

  return (
    <div className="public-detail-price-line">
      {computedDiscount ? (
        <span className="public-detail-price-line__discount">{computedDiscount}%</span>
      ) : null}
      <span className="public-detail-price-line__amount">{formatCurrency(priceValue)}</span>
      {originalPriceValue && originalPriceValue > priceValue ? (
        <span className="public-detail-price-line__original">{formatCurrency(originalPriceValue)}</span>
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

function DetailTabPanel({ activeKey, product, activeDisplay }) {
  if (activeKey === "grade") {
    return (
      <div className="public-detail-tab-content">
        <h3 className="public-detail-tab-content__heading">상태 등급 안내</h3>
        <ul className="public-detail-tab-content__list">
          <li><strong>S(새책)</strong> · 사용감이 거의 없는 새 책 수준의 상태 (필기 5% 이하)</li>
          <li><strong>A+(극미한 사용감)</strong> · 일부 페이지에 가벼운 필기/표시는 있으나 전반적으로 깨끗 (필기 6~20%)</li>
          <li><strong>A(보통 사용감)</strong> · 학습용 필기/체크가 있으나 학습에 무리 없음 (필기 21~50%)</li>
        </ul>
        <p className="public-detail-tab-content__note">
          모든 교재는 4단계 검수 (외관 · 내지 · 누락 · 훼손) 후 등급이 부여됩니다.
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
          <li>배송비: 일반 3,500원 / 5만원 이상 구매 시 무료 배송</li>
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
          <li>마이페이지 &gt; 구매 내역에서 신청해 주세요.</li>
          <li>주문 제작 / 사용 흔적이 더해진 교재는 교환·반품이 제한될 수 있습니다.</li>
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
        <div><dt>검수일</dt><dd>{product.inspectedAt ? formatDate(product.inspectedAt) : "미등록"}</dd></div>
        <div>
          <dt>필기 비율</dt>
          <dd>
            {activeDisplay?.writingPercentage === null || activeDisplay?.writingPercentage === undefined
              ? "미등록"
              : `${activeDisplay.writingPercentage}%`}
          </dd>
        </div>
        <div>
          <dt>훼손 여부</dt>
          <dd>
            {activeDisplay?.hasDamage === null || activeDisplay?.hasDamage === undefined
              ? "미등록"
              : activeDisplay.hasDamage ? "있음" : "없음"}
          </dd>
        </div>
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
              <a
                className="public-detail-info-images__item"
                href={imageUrl}
                key={`${imageUrl}-${index}`}
                rel="noreferrer"
                target="_blank"
              >
                <img alt={`${product.title} 검수 사진 ${index + 1}`} src={imageUrl} />
              </a>
            ))}
          </div>
        </div>
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
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cartToast, setCartToast] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState("info");

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
  const canPurchase = !activeAvailability.isSoldOut;

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
    // selectedOption.id 는 books.id 의 string 표현 — 우선 사용
    const bookId = selectedOption?.id ?? null;
    if (!bookId) {
      showCartToast("옵션이 선택되지 않았습니다.", "error");
      return;
    }
    const { data: cartData, error: cartError } = await addToCart({
      bookId,
      productId: product?.productId ?? null,
      quantity,
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
    const bookId = selectedOption?.id ?? product?.id;
    if (!bookId) return;
    const orderPayload = [{
      bookId,
      productId: product?.productId ?? null,
      quantity,
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
                <div className="public-detail-hero__main-image">
                  {selectedImageUrl ? (
                    <img alt={product.title} src={selectedImageUrl} />
                  ) : (
                    <div className="public-detail-hero__placeholder">
                      <span>SUBOOK</span>
                      <p>이미지 준비 중</p>
                    </div>
                  )}
                </div>
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
                        <img alt="" src={imageUrl} />
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

                <dl className="public-detail-hero__summary">
                  <div>
                    <dt>배송비</dt>
                    <dd>{priceValue !== null && priceValue >= 50000 ? "무료" : "3,500원"}</dd>
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
                  <button
                    className="public-detail-hero__btn public-detail-hero__btn--cart"
                    disabled={!canPurchase}
                    onClick={handleAddToCart}
                    type="button"
                  >
                    {canPurchase ? "장바구니 담기" : "품절"}
                  </button>
                  <button
                    className="public-detail-hero__btn public-detail-hero__btn--buy"
                    disabled={!canPurchase}
                    onClick={handleBuyNow}
                    type="button"
                  >
                    {canPurchase ? "바로 구매하기" : "입고 알림 확인"}
                  </button>
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

            <DetailTabPanel activeKey={activeTabKey} activeDisplay={activeDisplay} product={product} />

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
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicProductDetailPage;
