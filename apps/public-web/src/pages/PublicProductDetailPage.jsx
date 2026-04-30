import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatCurrency, formatDate } from "@shared-domain/format";
import StatusBadge from "@shared-domain/StatusBadge";
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

function formatAvailabilityLabel(option) {
  const snapshot = getAvailabilitySnapshot(option);
  return snapshot.availabilityLabel;
}

function ProductOptionSelector({ options, selectedOptionId, onSelect }) {
  if (!options.length) {
    return null;
  }

  return (
    <div className="public-detail-panel">
      <div className="public-detail-option-panel__header">
        <p className="public-detail-panel__eyebrow">상태별 옵션</p>
        <span className="public-detail-option-panel__hint">옵션을 선택하면 가격과 재고가 바뀝니다</span>
      </div>
      <div className="public-detail-option-panel__list">
        {options.map((option) => {
          const isSelected = option.id === selectedOptionId;
          const priceLabel =
            option.price === null ? "가격 미등록" : formatCurrency(option.price);
          const availability = getAvailabilitySnapshot(option);
          const isDisabled = availability.isSoldOut;

          return (
            <button
              aria-disabled={isDisabled}
              aria-pressed={isSelected}
              className={`public-detail-option-btn${isSelected ? " is-active" : ""}`}
              key={option.id ?? `${option.conditionGrade}-${option.option}-${priceLabel}`}
              onClick={() => {
                if (!isDisabled) {
                  onSelect(option.id);
                }
              }}
              type="button"
              disabled={isDisabled}
            >
              <div className="public-detail-option-btn__main">
                <p className="public-detail-option-btn__label">
                  {option.conditionGradeLabel || option.option || "옵션"}
                  {isSelected ? (
                    <span className="public-detail-option-btn__selected-chip">선택됨</span>
                  ) : null}
                </p>
                <p className="public-detail-option-btn__sub">
                  {option.option || "상세 옵션 없음"}
                </p>
              </div>

              <div className="public-detail-option-btn__price">
                <p className="public-detail-option-btn__price-value">{priceLabel}</p>
                <p className="public-detail-option-btn__price-avail">
                  {formatAvailabilityLabel(option)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuantityStepper({ value, maxQuantity, disabled, onDecrease, onIncrease }) {
  return (
    <div className="public-detail-panel public-detail-qty-panel">
      <div>
        <p className="public-detail-panel__eyebrow">수량</p>
        <p className="public-detail-qty-panel__info-hint">
          {disabled ? "품절" : `최대 ${maxQuantity}권까지 선택 가능`}
        </p>
      </div>

      <div className="public-detail-qty-panel__controls">
        <button
          aria-label="수량 줄이기"
          className="public-detail-qty-btn"
          disabled={disabled || value <= 1}
          onClick={onDecrease}
          type="button"
        >
          -
        </button>
        <div className="public-detail-qty-display">{value}</div>
        <button
          aria-label="수량 늘리기"
          className="public-detail-qty-btn"
          disabled={disabled || value >= maxQuantity}
          onClick={onIncrease}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

function PublicProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, isFavoritePending, toggleFavorite } = usePublicWishlist();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [detailSource, setDetailSource] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cartToast, setCartToast] = useState(null);

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
        if (!isActive) {
          return;
        }

        setProduct(detailResult.product);
        setRelatedProducts(detailResult.relatedProducts);
        setDetailSource(detailResult.source ?? "");
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

        if (detailResult.relatedProducts.length > 0) {
          return;
        }

        const relatedResult = await fetchStorefrontProducts({
          subject: detailResult.product.subject,
          brands: detailResult.product.brand ? [detailResult.product.brand] : [],
          limit: 8,
          sort: "popular",
        });

        if (!isActive) {
          return;
        }

        const fallbackRelatedProducts = sortStorefrontProducts(
          relatedResult.products ?? relatedResult.books ?? [],
          "popular",
        )
          .filter((item) => item.id !== detailResult.product.id)
          .slice(0, 4);

        setRelatedProducts(fallbackRelatedProducts);
      } catch {
        if (isActive) {
          setProduct(null);
          setRelatedProducts([]);
          setDetailSource("");
          setError("교재 상세 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      isActive = false;
    };
  }, [productId]);


  const selectedOption = useMemo(() => {
    if (!product?.options?.length) {
      return null;
    }

    return (
      product.options.find((option) => option.id === selectedOptionId) ??
      product.options[0] ??
      null
    );
  }, [product, selectedOptionId]);

  useEffect(() => {
    if (!product?.options?.length) {
      return;
    }

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
    const maxQuantity = activeAvailability.maxQuantity;
    setQuantity((currentQuantity) => Math.min(Math.max(1, currentQuantity), maxQuantity));
  }, [activeAvailability.maxQuantity]);

  const galleryImages = useMemo(() => {
    if (!product) {
      return [];
    }

    const nextImages = [
      product.coverImageUrl,
      ...(product.inspectionImageUrls ?? []),
      selectedOption?.coverImageUrl,
      ...(selectedOption?.inspectionImageUrls ?? []),
    ].filter(Boolean);

    return Array.from(new Set(nextImages));
  }, [product, selectedOption]);

  useEffect(() => {
    if (selectedImageIndex >= galleryImages.length) {
      setSelectedImageIndex(0);
    }
  }, [galleryImages, selectedImageIndex]);

  const selectedImageUrl = galleryImages[selectedImageIndex] ?? activeDisplay?.coverImageUrl ?? "";
  const imageSourceLabel =
    selectedImageIndex === 0 ? "표지 이미지" : selectedOption ? "선택 옵션 이미지" : "검수 사진";
  const priceValue = activeDisplay?.price ?? product?.price ?? null;
  const originalPriceValue = activeDisplay?.originalPrice ?? product?.originalPrice ?? null;
  const totalPriceValue = priceValue === null ? null : priceValue * quantity;
  const isProductFavorite = product ? favoriteIds.includes(String(product.id)) : false;
  const isProductFavoritePending = product ? isFavoritePending(product.id) : false;

  const handleAddToCart = async () => {
    if (!canPurchase) return;
    if (!requireMember("addToCart")) return;

    const bookId = selectedOption?.id ?? product?.id;
    if (!bookId) return;

    const { error: cartError } = await addToCart({
      bookId,
      productId: product?.productId ?? null,
      quantity,
    });

    if (cartError) {
      showCartToast("장바구니 담기에 실패했습니다.", "error");
      return;
    }

    showCartToast("장바구니에 담았습니다.");
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
    if (!targetProductId) {
      return;
    }

    if (!requireMember("favorite")) {
      return;
    }

    const result = await toggleFavorite(targetProductId);

    if (result.error) {
      showCartToast("찜 상태를 변경하지 못했어요.", "error");
      return;
    }

    showCartToast(result.isFavorite ? "찜 목록에 추가했어요." : "찜을 해제했어요.");
  };

  const pageContent = (
    <div className="public-store-page public-product-detail-page">
      <PublicSiteHeader />

      <div className="public-top-area public-store-page__top">
        <ContentContainer as="section" className="public-store-route" aria-label="상품 경로">
          <div className="public-store-route__crumbs">
            <Link className="public-store-route__crumb-link" to="/store">
              스토어
            </Link>
            <span aria-hidden="true">›</span>
            <span className="is-muted">{product ? product.title : "교재 상세"}</span>
          </div>
        </ContentContainer>
      </div>

      <ContentContainer as="section" className="public-detail-content">
        {isLoading ? (
          <div className="public-detail-skeleton" aria-label="교재 상세 정보를 불러오는 중입니다">
            <div className="public-detail-skeleton__col">
              <div className="public-detail-skeleton__media public-store-skeleton" />
              <div className="public-detail-skeleton__block public-store-skeleton" />
            </div>
            <div className="public-detail-skeleton__col">
              <div className="public-detail-skeleton__block public-store-skeleton" />
              <div className="public-detail-skeleton__block public-store-skeleton" />
              <div className="public-detail-skeleton__block--tall public-detail-skeleton__block public-store-skeleton" />
            </div>
          </div>
        ) : error ? (
          <div className="public-detail-error" role="alert">
            {error}
          </div>
        ) : product ? (
          <div className="public-detail-layout">
            <div className="public-detail-col">
              <div className="public-detail-gallery">
                <div className="public-detail-gallery__main">
                  {selectedImageUrl ? (
                    <img
                      alt={product.title}
                      className="public-detail-gallery__img"
                      src={selectedImageUrl}
                    />
                  ) : (
                    <div className="public-detail-gallery__placeholder">
                      <span className="public-detail-gallery__placeholder-eyebrow">SUBOOK</span>
                      <p className="public-detail-gallery__placeholder-title">
                        이미지가 아직 준비되지 않았어요
                      </p>
                    </div>
                  )}

                  <div className="public-detail-gallery__source-tag">{imageSourceLabel}</div>
                </div>

                {galleryImages.length > 1 ? (
                  <div className="public-detail-gallery__thumbs">
                    {galleryImages.map((imageUrl, index) => (
                      <button
                        aria-label={`${index + 1}번 이미지 보기`}
                        className={`public-detail-gallery__thumb${index === selectedImageIndex ? " is-active" : ""}`}
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

              <div className="public-detail-info-grid">
                <div className="public-detail-panel">
                  <p className="public-detail-panel__eyebrow">교재 기본정보</p>
                  <h1 className="public-detail-info-card__title">{product.title}</h1>
                  <div className="public-detail-info-card__badge-row">
                    <StatusBadge type="product" status={product.status} />
                    {detailSource === "mock" ? (
                      <span className="public-detail-info-card__badge public-detail-info-card__badge--mock">
                        Mock 데이터
                      </span>
                    ) : null}
                    {activeDisplay?.conditionGradeLabel ? (
                      <span className="public-detail-info-card__badge">
                        {activeDisplay.conditionGradeLabel}
                      </span>
                    ) : null}
                    {product.optionSummaryLabel ? (
                      <span className="public-detail-info-card__badge">
                        {product.optionSummaryLabel}
                      </span>
                    ) : null}
                  </div>
                  <dl className="public-detail-info-card__dl">
                    <div>
                      <dt className="public-detail-info-card__dt">과목</dt>
                      <dd className="public-detail-info-card__dd">{product.subject || "미등록"}</dd>
                    </div>
                    <div>
                      <dt className="public-detail-info-card__dt">브랜드</dt>
                      <dd className="public-detail-info-card__dd">{product.brand || "미등록"}</dd>
                    </div>
                    <div>
                      <dt className="public-detail-info-card__dt">유형</dt>
                      <dd className="public-detail-info-card__dd">{product.bookType || "미등록"}</dd>
                    </div>
                    <div>
                      <dt className="public-detail-info-card__dt">연도</dt>
                      <dd className="public-detail-info-card__dd">{product.publishedYear || "미등록"}</dd>
                    </div>
                    <div>
                      <dt className="public-detail-info-card__dt">강사명</dt>
                      <dd className="public-detail-info-card__dd">{product.instructorName || "미등록"}</dd>
                    </div>
                    <div>
                      <dt className="public-detail-info-card__dt">검수일</dt>
                      <dd className="public-detail-info-card__dd">
                        {product.inspectedAt ? formatDate(product.inspectedAt) : "미등록"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="public-detail-price-card">
                  <p className="public-detail-price-card__eyebrow">가격 정보</p>
                  <div className="public-detail-price-card__amount-row">
                    <span className="public-detail-price-card__amount">
                      {priceValue === null ? "미입력" : formatCurrency(priceValue)}
                    </span>
                    {activeDisplay?.discountRate !== null ? (
                      <span className="public-detail-price-card__discount-badge">
                        {activeDisplay.discountRate}% 할인
                      </span>
                    ) : null}
                  </div>
                  {originalPriceValue !== null ? (
                    <p className="public-detail-price-card__original">
                      정가 {formatCurrency(originalPriceValue)}
                    </p>
                  ) : null}

                  <ul className="public-detail-price-card__status-list">
                    <li className="public-detail-price-card__status-row">
                      <span>판매 상태</span>
                      <span className="public-detail-price-card__status-value">{product.statusLabel}</span>
                    </li>
                    <li className="public-detail-price-card__status-row">
                      <span>선택 옵션</span>
                      <span className="public-detail-price-card__status-value">
                        {activeDisplay?.conditionGradeLabel || activeDisplay?.option || "-"}
                      </span>
                    </li>
                  </ul>

                  <div className="public-detail-price-card__actions">
                    <button
                      aria-label={isProductFavorite ? "찜 취소" : "찜하기"}
                      aria-pressed={isProductFavorite}
                      className={`public-detail-price-card__favorite${isProductFavorite ? " is-active" : ""}`}
                      disabled={isProductFavoritePending}
                      onClick={() => {
                        void handleToggleFavorite(product.id);
                      }}
                      type="button"
                    >
                      <span aria-hidden="true">{isProductFavorite ? "♥" : "♡"}</span>
                      <span>찜</span>
                    </button>
                    <button
                      className="public-detail-price-card__btn public-detail-price-card__btn--cart"
                      disabled={!canPurchase}
                      onClick={handleAddToCart}
                      type="button"
                    >
                      {canPurchase ? "장바구니 담기" : "품절"}
                    </button>
                    <button
                      className="public-detail-price-card__btn public-detail-price-card__btn--buy"
                      disabled={!canPurchase}
                      onClick={handleBuyNow}
                      type="button"
                    >
                      {canPurchase ? "바로 구매하기" : "입고 알림 확인"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="public-detail-col">
              <ProductOptionSelector
                onSelect={setSelectedOptionId}
                options={product.options ?? []}
                selectedOptionId={selectedOptionId}
              />

              <QuantityStepper
                disabled={!canPurchase}
                maxQuantity={activeAvailability.maxQuantity}
                onDecrease={() => setQuantity((currentQuantity) => Math.max(1, currentQuantity - 1))}
                onIncrease={() =>
                  setQuantity((currentQuantity) => Math.min(activeAvailability.maxQuantity, currentQuantity + 1))
                }
                value={quantity}
              />

              <div className="public-detail-panel">
                <p className="public-detail-panel__eyebrow">품질 정보</p>
                <ul className="public-detail-quality-list">
                  <li className="public-detail-quality-row">
                    <span className="public-detail-quality-row__label">구매 가능 수량</span>
                    <span className="public-detail-quality-row__value">
                      {activeAvailability.availableCount === null
                        ? "정보 없음"
                        : activeAvailability.availableCount === 0
                          ? "품절"
                          : `${activeAvailability.availableCount}권`}
                    </span>
                  </li>
                  <li className="public-detail-quality-row">
                    <span className="public-detail-quality-row__label">필기 비율</span>
                    <span className="public-detail-quality-row__value">
                      {activeDisplay?.writingPercentage === null
                        ? "미등록"
                        : `${activeDisplay.writingPercentage}%`}
                    </span>
                  </li>
                  <li className="public-detail-quality-row">
                    <span className="public-detail-quality-row__label">훼손 여부</span>
                    <span className="public-detail-quality-row__value">
                      {activeDisplay?.hasDamage === null
                        ? "미등록"
                        : activeDisplay.hasDamage
                          ? "있음"
                          : "없음"}
                    </span>
                  </li>
                </ul>
                <div className="public-detail-quality-notes">
                  <span className="public-detail-quality-notes__label">검수 메모</span>
                  <p className="public-detail-quality-notes__body">
                    {activeDisplay?.inspectionNotes || "검수 메모가 아직 없습니다."}
                  </p>
                </div>
                <div className="public-detail-total-row">
                  <div className="public-detail-total-row__header">
                    <span className="public-detail-total-row__label">현재 선택</span>
                    <span className="public-detail-total-row__value">
                      {activeDisplay?.conditionGradeLabel || activeDisplay?.option || "옵션 미선택"}
                    </span>
                  </div>
                  <p className="public-detail-total-row__summary">
                    {totalPriceValue === null
                      ? "가격 정보가 아직 없어요."
                      : `선택 수량 ${quantity}권 기준 총 ${formatCurrency(totalPriceValue)}입니다.`}
                  </p>
                </div>
              </div>

              <div className="public-detail-panel">
                <p className="public-detail-panel__eyebrow">교재 요약</p>
                <p className="public-detail-summary-body">
                  {[product.subject, product.brand, product.bookType, product.publishedYear, product.instructorName]
                    .filter(Boolean)
                    .join(" · ") || "교재 요약 정보가 아직 없습니다."}
                </p>
              </div>

              {product.inspectionImageUrls?.length ? (
                <div className="public-detail-panel">
                  <p className="public-detail-panel__eyebrow">검수 사진</p>
                  <div className="public-detail-inspection-grid">
                    {product.inspectionImageUrls.map((imageUrl, index) => (
                      <a
                        className="public-detail-inspection-link"
                        href={imageUrl}
                        key={`${imageUrl}-${index}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <img
                          alt={`${product.title} 검수 사진 ${index + 1}`}
                          src={imageUrl}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="public-detail-panel">
                <div className="public-detail-related-header">
                  <div>
                    <p className="public-detail-panel__eyebrow">추천 교재</p>
                    <h2 className="public-detail-related-header__title">비슷한 교재 추천</h2>
                  </div>
                  <Link className="public-outline-button" to="/store">
                    스토어 전체보기
                  </Link>
                </div>

                {relatedProducts.length ? (
                  <div className="public-detail-related-rail" role="list">
                    {relatedProducts.map((relatedProduct) => (
                      <div className="public-detail-related-rail__item" key={relatedProduct.id} role="listitem">
                        <ProductCard
                          isFavorite={favoriteIds.includes(String(relatedProduct.id))}
                          onToggleFavorite={handleToggleFavorite}
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
              </div>
            </div>
          </div>
        ) : null}
      </ContentContainer>

      <PublicFooter />
      {memberGateDialog}

      {cartToast && (
        <div
          className={`public-detail-toast${cartToast.type === "error" ? " public-detail-toast--error" : ""}`}
          role="alert"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "12px 24px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            color: "#fff",
            background: cartToast.type === "error" ? "#ef4444" : "#1f2937",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {cartToast.message}
        </div>
      )}
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicProductDetailPage;
