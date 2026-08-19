import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ContentContainer from "../components/ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import PublicFooter from "../components/PublicFooter";
import PublicNotFoundPage from "./PublicNotFoundPage";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import { fetchStorefrontProducts } from "../lib/storefront";
import {
  INSTRUCTOR_COLLECTIONS,
  SERIES_COLLECTIONS,
  findInstructorCollection,
  findSeriesCollection,
  getInstructorCollectionMeta,
  getSeriesCollectionMeta,
} from "../lib/publicStoreCollections";
import { trackViewItemList } from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import { ChevronRightIcon } from "../components/icons";
import "./PublicSubjectPage.css";

const PAGE_SIZE = 24;
const SKELETON_COUNT = 8;

// 시리즈/강사 랜딩 — 과목 랜딩(PublicSubjectPage)과 동일한 골격의 SEO 진입점.
// type="series" → /store/series/:slug (상품명 부분 일치)
// type="instructor" → /store/instructor/:slug (강사명 정확 일치)
// ⚠ 타이틀·설명 문구는 api/prerender-collection.js와 동일 유지 (클로킹 오해 방지 원칙)
function PublicCollectionPage({ type }) {
  const { slug: rawSlug } = useParams();
  const isSeries = type === "series";
  const collection = isSeries
    ? findSeriesCollection(rawSlug)
    : findInstructorCollection(rawSlug);

  const meta = collection
    ? isSeries
      ? getSeriesCollectionMeta(collection)
      : getInstructorCollectionMeta(collection)
    : null;
  const heading = meta?.title ?? "";
  const analyticsListName = collection
    ? isSeries
      ? `시리즈별 · ${collection.label}`
      : `강사별 · ${collection.name}`
    : "";
  const collectionKey = collection?.slug ?? "";

  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, toggleFavorite } = usePublicWishlist();

  // 페이지 누적 로딩 — 서버 인기순 페이지네이션을 "더 보기"로 이어 붙인다.
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestSeqRef = useRef(0);

  // 컬렉션 전환 시 목록 리셋
  useEffect(() => {
    setProducts([]);
    setTotalCount(0);
    setPage(1);
    setHasFatalError(false);
  }, [type, collectionKey]);

  useEffect(() => {
    if (!collection) return undefined;
    let cancelled = false;
    const seq = ++requestSeqRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const result = await fetchStorefrontProducts({
          ...(isSeries
            ? { titleTerms: collection.terms }
            : { instructors: [collection.name] }),
          sort: "popular",
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (cancelled || seq !== requestSeqRef.current) return;

        const rows = result.products ?? [];
        setTotalCount(result.totalCount ?? rows.length);
        setProducts((current) => (page === 1 ? rows : [...current, ...rows]));
        setHasFatalError(false);

        // GA4 view_item_list — 컬렉션 랜딩 목록 노출 (새로 로드된 페이지 단위)
        trackViewItemList(
          analyticsListName,
          rows.map((product) => ({
            productId: product.id,
            title: product.title,
            brand: product.brand,
            subject: product.subject,
            price: product.price,
            quantity: 1,
          })),
        );
      } catch {
        // 첫 페이지 실패만 전면 에러로 처리 — "더 보기" 실패는 기존 목록 유지
        if (!cancelled && seq === requestSeqRef.current && page === 1) {
          setProducts([]);
          setTotalCount(0);
          setHasFatalError(true);
        }
      } finally {
        if (!cancelled && seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, collectionKey, page, retryNonce]);

  const isEmpty = !isLoading && !hasFatalError && products.length === 0;
  const hasMore = products.length < totalCount;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://subook.kr";

  usePageMeta(
    collection
      ? {
          title: meta.title,
          description: meta.description,
          canonicalPath: meta.canonicalPath,
          // noindex는 "정말 빈 결과"일 때만 — fetch 실패를 빈 페이지로 오인하지 않는다.
          noindex: !hasFatalError && isEmpty && totalCount === 0,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "홈", item: `${origin}/` },
                { "@type": "ListItem", position: 2, name: heading },
              ],
            },
            ...(products.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: heading,
                    numberOfItems: totalCount,
                    itemListElement: products.slice(0, 30).map((product, index) => ({
                      "@type": "ListItem",
                      position: index + 1,
                      name: product.title,
                      url: `${origin}/store/${product.id}`,
                    })),
                  },
                ]
              : []),
          ],
        }
      : { title: "페이지를 찾을 수 없습니다", noindex: true },
  );

  if (!collection) {
    return <PublicNotFoundPage />;
  }

  const handleToggleFavorite = async (productId) => {
    if (!requireMember("favorite")) {
      return;
    }
    await toggleFavorite(productId);
  };

  // 같은 유형의 다른 컬렉션 간 내부링크 (과목 랜딩의 과목 네비와 동일 역할)
  const navItems = isSeries
    ? SERIES_COLLECTIONS.map((series) => ({
        slug: series.slug,
        to: `/store/series/${encodeURIComponent(series.slug)}`,
        label: series.label,
      }))
    : INSTRUCTOR_COLLECTIONS.map((instructor) => ({
        slug: instructor.slug,
        to: `/store/instructor/${encodeURIComponent(instructor.slug)}`,
        label: `${instructor.name} ${instructor.subject}`,
      }));

  const pageContent = (
    <div className="public-subject-page">
      <PublicSiteHeader />

      <ContentContainer as="section" className="public-subject-route" aria-label="페이지 경로">
        <div className="public-subject-route__crumbs">
          <Link className="public-subject-route__crumb-link" to="/">
            홈
          </Link>
          <span aria-hidden="true"><ChevronRightIcon size={12} /></span>
          <span className="is-muted">{heading}</span>
        </div>
      </ContentContainer>

      <ContentContainer as="section" className="public-subject-main" aria-label={heading}>
        <div className="public-subject-head">
          <h1 className="public-subject-head__title">{heading}</h1>
          <span className="public-subject-head__count">
            {(isLoading && products.length === 0) || hasFatalError
              ? "…"
              : `총 ${totalCount.toLocaleString("ko-KR")}종`}
          </span>
        </div>

        <nav
          className="public-subject-nav"
          aria-label={isSeries ? "다른 시리즈 교재" : "다른 강사 교재"}
        >
          {navItems.map((item) => (
            <Link
              className={`public-subject-nav__link ${item.slug === collection.slug ? "is-active" : ""}`}
              key={item.slug}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
          <Link className="public-subject-nav__link" to="/">
            전체 교재
          </Link>
        </nav>

        {isLoading && products.length === 0 ? (
          <div className="public-home-store-grid__list" role="status" aria-live="polite">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ProductCardSkeleton key={`collection-skeleton-${index}`} />
            ))}
          </div>
        ) : hasFatalError ? (
          <div className="public-subject-empty" role="alert">
            <strong>교재를 불러오지 못했습니다</strong>
            <button
              className="public-subject-more__button"
              onClick={() => setRetryNonce((nonce) => nonce + 1)}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : isEmpty ? (
          <div className="public-subject-empty">
            <strong>지금 판매 중인 {heading}가 없어요</strong>
            <Link className="public-subject-empty__link" to="/">
              전체 교재 보러가기
            </Link>
          </div>
        ) : (
          <>
            <div className="public-home-store-grid__list">
              {products.map((product) => (
                <ProductCard
                  analyticsListName={analyticsListName}
                  isFavorite={favoriteIds.includes(product.id)}
                  key={product.id}
                  onToggleFavorite={handleToggleFavorite}
                  product={product}
                />
              ))}
            </div>
            {hasMore ? (
              <div className="public-subject-more">
                <button
                  className="public-subject-more__button"
                  disabled={isLoading}
                  onClick={() => setPage((current) => current + 1)}
                  type="button"
                >
                  {isLoading ? "불러오는 중..." : "더 보기"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </ContentContainer>

      <PublicFooter />

      {memberGateDialog}
    </div>
  );

  return <PublicPageFrame>{pageContent}</PublicPageFrame>;
}

export default PublicCollectionPage;
