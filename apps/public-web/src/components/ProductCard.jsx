import { useEffect, useRef, useState } from "react";
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
import { getThumbnailImageUrl } from "../lib/storageImage";

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
  // 저장된 원본(/object/public, 최대 2MB, no-cache) 대신 리사이즈·WebP 변환 URL을
  // 쓴다. 카드 썸네일은 수 KB로 줄고 CDN 캐시되어 새로고침마다 재다운로드되지 않는다.
  const coverImageUrl = getThumbnailImageUrl(getStoreCardCoverImageUrl(product));
  const { discountRate, originalPrice, price } = getProductCardPrice(product);
  const tags = getStoreCardTags(product);
  const metaLine = getStoreCardMetaLine(product);
  const saleLabel = price !== null ? formatCurrency(price) : "가격 미정";
  const mediaRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [imageStatus, setImageStatus] = useState(coverImageUrl ? "loading" : "fallback");
  const showImage = Boolean(coverImageUrl) && shouldLoad && imageStatus !== "fallback";
  const showSkeleton = Boolean(coverImageUrl) && imageStatus === "loading";
  const showPlaceholder = !coverImageUrl || imageStatus === "fallback";
  const cardClassName = ["public-product-card", className].filter(Boolean).join(" ");

  // coverImageUrl이 바뀌면 로드 상태를 리셋한다.
  useEffect(() => {
    setImageStatus(coverImageUrl ? "loading" : "fallback");
    setShouldLoad(false);
  }, [coverImageUrl]);

  // 뷰포트 근처(400px)에 들어왔을 때만 실제 로드를 시작한다. native loading="lazy"를
  // IntersectionObserver로 대체 — 로드 시작 시점을 알아야 아래 "멈춤 방어" 타이머를
  // 로드 시작에 맞춰 걸 수 있고, 화면 밖 카드가 mount 기준 타이머 때문에 placeholder로
  // 잘못 떨어지던 버그(스크롤해서 실제로 보일 땐 이미 fallback 상태)를 없앤다.
  useEffect(() => {
    if (!coverImageUrl) {
      return undefined;
    }
    const node = mediaRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [coverImageUrl]);

  // 실제 로드를 시작한 뒤에만(shouldLoad) "멈춤 방어" 타이머를 건다. 변환 이미지는
  // 수 KB라 정상 로드는 1초 내지만, 응답이 끊겨 onLoad/onError가 영영 안 불리는
  // 케이스를 대비해 15초 후 placeholder로 폴백한다.
  useEffect(() => {
    if (!coverImageUrl || !shouldLoad) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setImageStatus((current) => (current === "loading" ? "fallback" : current));
    }, 15000);
    return () => clearTimeout(timer);
  }, [coverImageUrl, shouldLoad]);

  return (
    <article className={cardClassName}>
      <Link aria-label={`${title} 상세 보기`} className="public-product-card__overlay-link" to={resolvedDetailPath} />

      <div className="public-product-card__media" ref={mediaRef}>
        <ProductCardBadge badge={badge} />

        {showSkeleton ? (
          <div aria-hidden="true" className="public-product-card__image-skeleton public-store-skeleton" />
        ) : null}

        {showImage ? (
          <img
            alt={title}
            className={`public-product-card__cover ${imageStatus === "loaded" ? "is-loaded" : ""}`}
            decoding="async"
            // 로드 시점은 위 IntersectionObserver(shouldLoad)로 직접 제어하므로
            // native loading="lazy"는 붙이지 않는다(중복 defer 방지).
            onError={() => setImageStatus("fallback")}
            onLoad={() => setImageStatus("loaded")}
            src={coverImageUrl}
          />
        ) : null}

        {showPlaceholder ? (
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
        ) : null}

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
