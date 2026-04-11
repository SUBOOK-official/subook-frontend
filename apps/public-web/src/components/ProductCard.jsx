import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import {
  getProductCardPlaceholderEyebrow,
  getProductCardPrice,
  getProductCardTitle,
  getStoreCardCoverImageUrl,
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
  const saleLabel = price !== null ? formatCurrency(price) : "가격 미정";
  const [imageStatus, setImageStatus] = useState(coverImageUrl ? "loading" : "fallback");
  const showImage = Boolean(coverImageUrl) && imageStatus !== "fallback";
  const isImageLoading = imageStatus === "loading";
  const cardClassName = ["public-product-card", className].filter(Boolean).join(" ");

  useEffect(() => {
    setImageStatus(coverImageUrl ? "loading" : "fallback");
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
            loading="lazy"
            onError={() => setImageStatus("fallback")}
            onLoad={() => setImageStatus("loaded")}
            src={coverImageUrl}
          />
        ) : (
          <div className="public-product-card__placeholder">
            <span className="public-product-card__placeholder-brand">{placeholderEyebrow}</span>
            <span aria-hidden="true" className="public-product-card__placeholder-icon">
              📚
            </span>
            <span className="public-product-card__placeholder-title">{title}</span>
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
