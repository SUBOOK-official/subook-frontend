import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import {
  getProductCardPlaceholderEyebrow,
  getProductCardPrice,
  getProductCardTitle,
  getStoreCardCoverImageUrl,
  getStoreCardMetaLine,
  getStoreCardTags,
} from "../lib/publicStoreCards";

function ProductCardTag({ label, tone }) {
  return <span className={`public-product-card__tag public-product-card__tag--${tone}`}>{label}</span>;
}

function ProductCardBadge({ badge }) {
  if (!badge?.label) {
    return null;
  }

  return (
    <div className={`public-product-card__badge public-product-card__badge--${badge.tone ?? "default"}`}>
      {badge.label}
    </div>
  );
}

function ProductCardFavoriteButton({ filled = false, onToggle }) {
  if (typeof onToggle !== "function") {
    return null;
  }

  return (
    <button
      aria-label={filled ? "찜 취소" : "찜하기"}
      className={`public-product-card__favorite ${filled ? "is-active" : ""}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle(event);
      }}
      type="button"
    >
      <span aria-hidden="true">{filled ? "♥" : "♡"}</span>
    </button>
  );
}

function ProductCard({
  badge = null,
  className = "",
  detailPath,
  isFavorite = false,
  onToggleFavorite,
  product,
}) {
  const resolvedDetailPath = detailPath ?? `/store/${product.id}`;
  const title = getProductCardTitle(product);
  const placeholderEyebrow = getProductCardPlaceholderEyebrow(product);
  const coverImageUrl = getStoreCardCoverImageUrl(product);
  const { discountRate, originalPrice, price } = getProductCardPrice(product);
  const tags = getStoreCardTags(product);
  const metaLine = getStoreCardMetaLine(product);
  const saleLabel = price !== null ? formatCurrency(price) : "가격 미정";
  const [imageStatus, setImageStatus] = useState(coverImageUrl ? "loading" : "fallback");
  const showImage = Boolean(coverImageUrl) && imageStatus !== "fallback";
  const isImageLoading = imageStatus === "loading";
  const cardClassName = ["public-product-card", className].filter(Boolean).join(" ");

  useEffect(() => {
    setImageStatus(coverImageUrl ? "loading" : "fallback");
    if (!coverImageUrl) return undefined;
    // Supabase Storage 응답이 끊겨 onLoad/onError가 영영 안 불리고 무한 로딩에 박히는
    // 케이스만 방어 — 정상 로드는 충분히 기다린다. 모바일 LTE 첫 로드(캐시 miss)는
    // 3-5초가 흔해서 이전 3초 timeout이 placeholder로 너무 빨리 떨어뜨리는 문제가
    // 있었음. 12초로 늘려 안전 마진 확보. cache hit 후엔 무관.
    const timer = setTimeout(() => {
      setImageStatus((current) => (current === "loading" ? "fallback" : current));
    }, 12000);
    return () => clearTimeout(timer);
  }, [coverImageUrl]);

  return (
    <article className={cardClassName}>
      <Link aria-label={`${title} 상세 보기`} className="public-product-card__overlay-link" to={resolvedDetailPath} />

      <div className="public-product-card__media">
        <ProductCardBadge badge={badge} />

        {isImageLoading ? (
          <div aria-hidden="true" className="public-product-card__image-skeleton public-store-skeleton" />
        ) : null}

        {showImage ? (
          <img
            alt={title}
            className={`public-product-card__cover ${imageStatus === "loaded" ? "is-loaded" : ""}`}
            decoding="async"
            // fetchpriority="low"를 제거 — 그리드에 보이는 카드들이 첫인상에
            // 즉시 보여야 하는데, low priority가 다른 리소스에 밀려 첫 로드 시
            // placeholder 잠깐 보이는 문제를 만들었음. loading="lazy"만으로도
            // viewport 밖 이미지는 충분히 deferred됨.
            loading="lazy"
            onError={() => setImageStatus("fallback")}
            onLoad={() => setImageStatus("loaded")}
            src={coverImageUrl}
          />
        ) : (
          // 중고 교재 거래는 신뢰가 핵심 — 이모지/형광 placeholder 대신 표지형 패널 +
          // "사진 준비 중" 안내로 검수가 끝났음을 암시한다.
          <div className="public-product-card__placeholder">
            <span className="public-product-card__placeholder-brand">{placeholderEyebrow}</span>
            <svg
              aria-hidden="true"
              className="public-product-card__placeholder-icon"
              fill="none"
              height="56"
              viewBox="0 0 56 56"
              width="56"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect height="44" rx="3" stroke="currentColor" strokeWidth="2" width="34" x="11" y="6" />
              <line stroke="currentColor" strokeWidth="2" x1="11" x2="45" y1="15" y2="15" />
              <line stroke="currentColor" strokeLinecap="round" strokeWidth="2" x1="17" x2="39" y1="24" y2="24" />
              <line stroke="currentColor" strokeLinecap="round" strokeWidth="2" x1="17" x2="34" y1="31" y2="31" />
              <line stroke="currentColor" strokeLinecap="round" strokeWidth="2" x1="17" x2="36" y1="38" y2="38" />
            </svg>
            <span className="public-product-card__placeholder-title">{title}</span>
            <span className="public-product-card__placeholder-trust">사진 준비 중 · 검수 완료</span>
          </div>
        )}

        {product.isSoldOut ? (
          <div className="public-product-card__sold-out">
            <span>품절</span>
          </div>
        ) : null}

        <ProductCardFavoriteButton
          filled={isFavorite}
          onToggle={(event) => onToggleFavorite?.(product.id, event)}
        />
      </div>

      <div className="public-product-card__content">
        {tags.length > 0 ? (
          <div className="public-product-card__tags">
            {tags.map((tag) => (
              <ProductCardTag key={`${product.id}-${tag.key}`} label={tag.label} tone={tag.tone} />
            ))}
          </div>
        ) : null}

        <h3 className="public-product-card__title">{title}</h3>

        {metaLine.length > 0 ? (
          <p className="public-product-card__meta-line">
            {metaLine.map((segment, index) => (
              <span
                className={`public-product-card__meta-segment public-product-card__meta-segment--${segment.tone}`}
                key={`${product.id}-meta-${segment.key}`}
              >
                {index > 0 ? (
                  <span aria-hidden="true" className="public-product-card__meta-divider">·</span>
                ) : null}
                {segment.label}
              </span>
            ))}
          </p>
        ) : null}

        <div className="public-product-card__price-row">
          {discountRate !== null ? (
            <span className="public-product-card__discount">{discountRate}%</span>
          ) : null}
          <span className="public-product-card__sale-price">{saleLabel}</span>
          {originalPrice !== null ? (
            <span className="public-product-card__original-price">{formatCurrency(originalPrice)}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ProductCardSkeleton({ badge = null, className = "" }) {
  const cardClassName = ["public-product-card", "public-product-card--skeleton", className].filter(Boolean).join(" ");

  return (
    <article aria-hidden="true" className={cardClassName}>
      <div className="public-product-card__media">
        <ProductCardBadge badge={badge} />
        <div className="public-store-skeleton public-store-skeleton--media" />
      </div>

      <div className="public-product-card__content">
        <div className="public-product-card__tags">
          <span className="public-store-skeleton public-store-skeleton--tag" />
          <span className="public-store-skeleton public-store-skeleton--tag is-wide" />
          <span className="public-store-skeleton public-store-skeleton--tag is-short" />
        </div>
        <span className="public-store-skeleton public-store-skeleton--title" />
        <span className="public-store-skeleton public-store-skeleton--title is-short" />
        <span className="public-store-skeleton public-store-skeleton--price" />
      </div>
    </article>
  );
}

export { ProductCardSkeleton };
export default ProductCard;
