import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@shared-domain/format";
import { trackSelectItem } from "../lib/analytics";
import { COLLAB_OPEN_LABEL, isPreReleaseProduct } from "../lib/publicFeaturedProducts";
import {
  getProductCardPlaceholderEyebrow,
  getProductCardPrice,
  getProductCardTitle,
  getStoreCardCoverImageUrl,
  getStoreCardMetaLine,
  getStoreCardTags,
} from "../lib/publicStoreCards";
import { getThumbnailImageUrl } from "../lib/storageImage";

// 찜하기 하트 아이콘 — 예전엔 "♥"/"♡" 텍스트 글리프였는데, 폰트마다 굵기·정렬이
// 달라져 보이던 문제를 없애려 SVG로 교체. 색상은 currentColor라 버튼의 color만
// 바꾸면(연한 회색 ↔ 빨강) 채워짐 여부가 그대로 반영된다.
function HeartIcon({ size = 20, filled = false }) {
  return (
    <svg
      aria-hidden="true"
      className={`public-heart-icon${filled ? " is-filled" : ""}`}
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M2 8.5C2 5.46243 4.46243 3 7.5 3C9.36016 3 11.0046 3.92345 12 5.33692C12.9954 3.92345 14.6398 3 16.5 3C19.5376 3 22 5.46243 22 8.5C22 16 11.9999 21.4852 11.9999 21.4852C11.9999 21.4852 2 16 2 8.5Z" />
    </svg>
  );
}

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
      <span aria-hidden="true">
        <HeartIcon filled={filled} size={18} />
      </span>
    </button>
  );
}

function ProductCard({
  // GA4 select_item의 item_list_name — 이 카드가 어느 목록에 놓였는지 (예: "BEST 교재").
  // 미지정 목록은 목록명 없이 select_item만 발화한다.
  analyticsListName = null,
  badge = null,
  className = "",
  detailPath,
  // 카드 하단 액션 슬롯(예: 찜 목록의 품절 카드 "재입고 알림" 버튼). 카드 전체를 덮는
  // overlay 링크 위에서 클릭돼야 하므로 __footer가 z-index를 올린다.
  footer = null,
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
  // 출시 전 콜라보 교재는 가격·할인율을 감추고 오픈일만 알린다.
  const isPreRelease = isPreReleaseProduct(product);
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
      <Link
        aria-label={`${title} 상세 보기`}
        className="public-product-card__overlay-link"
        onClick={() =>
          trackSelectItem(analyticsListName, {
            productId: product.id,
            title,
            brand: product.brand,
            subject: product.subject,
            price,
            quantity: 1,
          })
        }
        to={resolvedDetailPath}
      />

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

        {isPreRelease ? (
          <div className="public-product-card__sold-out public-product-card__sold-out--upcoming">
            <span>{COLLAB_OPEN_LABEL} 오픈</span>
          </div>
        ) : product.isSoldOut ? (
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
          {isPreRelease ? (
            <span className="public-product-card__upcoming-price">출시 예정</span>
          ) : (
            <>
              {discountRate !== null ? (
                <span className="public-product-card__discount">{discountRate}%</span>
              ) : null}
              {originalPrice !== null ? (
                <span className="public-product-card__original-price">
                  {formatCurrency(originalPrice)}
                </span>
              ) : null}
              <span className="public-product-card__sale-price">{saleLabel}</span>
            </>
          )}
        </div>

        {footer ? <div className="public-product-card__footer">{footer}</div> : null}
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

export { HeartIcon, ProductCardSkeleton };
export default ProductCard;
