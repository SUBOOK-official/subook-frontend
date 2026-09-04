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
import { STORE_DEFAULT_SUBJECT, STORE_SUBJECTS } from "../lib/publicStoreNavigation";
import {
  trackEmptyState,
  trackException,
  trackLoadMore,
  trackSelectContent,
  trackViewItemList,
} from "../lib/analytics";
import { usePageMeta } from "../lib/usePageMeta";
import { ChevronRightIcon } from "../components/icons";
import "./PublicSubjectPage.css";

const PAGE_SIZE = 24;
const SKELETON_COUNT = 8;

// "전체"를 뺀 유효 과목 — /store/subject/:subject 라우트 대상.
// ⚠ api/prerender-subject.js의 VALID_SUBJECTS와 동기 유지 (봇/사람 동일 콘텐츠 원칙)
const SUBJECT_PAGE_SUBJECTS = STORE_SUBJECTS.filter(
  (subject) => subject !== STORE_DEFAULT_SUBJECT,
);

// 과목 간 이동 내부링크 — "기타"는 SEO 랜딩 대상이 아니라 제외
const SUBJECT_NAV_SUBJECTS = SUBJECT_PAGE_SUBJECTS.filter((subject) => subject !== "기타");

function PublicSubjectPage() {
  const { subject: rawSubject } = useParams();
  const subject = String(rawSubject ?? "").trim();
  const isValidSubject = SUBJECT_PAGE_SUBJECTS.includes(subject);

  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const { favoriteIds, toggleFavorite } = usePublicWishlist();

  // 페이지 누적 로딩 — 서버 인기순 페이지네이션을 "더 보기"로 이어 붙인다.
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  // API 실패를 빈 상태와 구분 (BestBooksSection의 hasFatalError 패턴).
  const [hasFatalError, setHasFatalError] = useState(false);
  // "다시 시도" — 값을 올려 질의 useEffect를 재실행시킨다.
  const [retryNonce, setRetryNonce] = useState(0);
  const requestSeqRef = useRef(0);

  // 과목 전환 시 목록 리셋
  useEffect(() => {
    setProducts([]);
    setTotalCount(0);
    setPage(1);
    setHasFatalError(false);
  }, [subject]);

  useEffect(() => {
    if (!isValidSubject) return undefined;
    let cancelled = false;
    const seq = ++requestSeqRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const result = await fetchStorefrontProducts({
          subject,
          sort: "popular",
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (cancelled || seq !== requestSeqRef.current) return;

        const rows = result.products ?? [];
        setTotalCount(result.totalCount ?? rows.length);
        setProducts((current) => (page === 1 ? rows : [...current, ...rows]));
        setHasFatalError(false);

        // GA4 view_item_list — 과목 랜딩 목록 노출 (새로 로드된 페이지 단위, index는 누적 순번)
        trackViewItemList(
          `과목별 · ${subject}`,
          rows.map((product, index) => ({
            productId: product.id,
            title: product.title,
            brand: product.brand,
            subject: product.subject,
            price: product.price,
            quantity: 1,
            index: (page - 1) * PAGE_SIZE + index,
          })),
          { pageNumber: page, resultCount: result.totalCount ?? rows.length },
        );
      } catch (error) {
        // 첫 페이지 실패만 전면 에러로 처리. "더 보기" 실패는 기존 목록을 유지하고
        // 버튼이 그대로 남아 재시도 동선이 된다.
        if (!cancelled && seq === requestSeqRef.current && page === 1) {
          // GA4 exception — SEO 랜딩이 통째로 실패하면 유입이 그대로 이탈한다.
          trackException("subject_fetch_failed", {
            subject,
            pageNumber: page,
            errorMessage: error?.message,
          });
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
  }, [subject, page, isValidSubject, retryNonce]);

  const isEmpty = !isLoading && !hasFatalError && products.length === 0;
  const hasMore = products.length < totalCount;

  // GA4 empty_state_view — 과목 랜딩 재고 공백(입고 우선순위 신호). 과목당 1회.
  const emptyTrackedRef = useRef("");
  useEffect(() => {
    if (!isEmpty || emptyTrackedRef.current === subject) return;
    emptyTrackedRef.current = subject;
    trackEmptyState("subject", { subject });
  }, [isEmpty, subject]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://subook.kr";

  // 상품명·과목 title + canonical + ItemList/BreadcrumbList JSON-LD
  // ⚠ 타이틀·설명 문구는 api/prerender-subject.js와 동일 유지 (클로킹 오해 방지 원칙)
  usePageMeta(
    isValidSubject
      ? {
          title: `수능 ${subject} 교재`,
          description: `검수 완료된 수능 ${subject} 교재 — 새 책 수준의 미사용 교재를 합리적인 가격에.`,
          canonicalPath: `/store/subject/${encodeURIComponent(subject)}`,
          // noindex는 "정말 빈 결과"일 때만 — fetch 실패를 빈 페이지로 오인해 색인 제외하지 않는다.
          noindex: !hasFatalError && isEmpty && totalCount === 0,
          jsonLd: [
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "홈", item: `${origin}/` },
                { "@type": "ListItem", position: 2, name: `수능 ${subject} 교재` },
              ],
            },
            ...(products.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: `수능 ${subject} 교재`,
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

  if (!isValidSubject) {
    return <PublicNotFoundPage notFoundSource="subject" />;
  }

  const handleToggleFavorite = async (productId) => {
    if (!requireMember("favorite")) {
      return;
    }
    await toggleFavorite(productId);
  };

  const pageContent = (
    <div className="public-subject-page">
      <PublicSiteHeader />

      <ContentContainer as="section" className="public-subject-route" aria-label="페이지 경로">
        <div className="public-subject-route__crumbs">
          <Link className="public-subject-route__crumb-link" to="/">
            홈
          </Link>
          <span aria-hidden="true"><ChevronRightIcon size={12} /></span>
          <span className="is-muted">{subject}</span>
        </div>
      </ContentContainer>

      <ContentContainer as="section" className="public-subject-main" aria-label={`수능 ${subject} 교재`}>
        <div className="public-subject-head">
          <h1 className="public-subject-head__title">수능 {subject} 교재</h1>
          <span className="public-subject-head__count">
            {(isLoading && products.length === 0) || hasFatalError
              ? "…"
              : `총 ${totalCount.toLocaleString("ko-KR")}종`}
          </span>
        </div>

        <nav className="public-subject-nav" aria-label="다른 과목 교재">
          {SUBJECT_NAV_SUBJECTS.map((name) => (
            <Link
              className={`public-subject-nav__link ${name === subject ? "is-active" : ""}`}
              key={name}
              onClick={() => trackSelectContent("subject_nav", name, { fromSubject: subject })}
              to={`/store/subject/${encodeURIComponent(name)}`}
            >
              {name}
            </Link>
          ))}
          <Link
            className="public-subject-nav__link"
            onClick={() => trackSelectContent("subject_nav", "all", { fromSubject: subject })}
            to="/"
          >
            전체 교재
          </Link>
        </nav>

        {isLoading && products.length === 0 ? (
          <div className="public-home-store-grid__list" role="status" aria-live="polite">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ProductCardSkeleton key={`subject-skeleton-${index}`} />
            ))}
          </div>
        ) : hasFatalError ? (
          /* 불러오기 실패 — "아직 등록된 교재가 없어요"와 구분해 재시도 동선 제공 */
          <div className="public-subject-empty" role="alert">
            <strong>교재를 불러오지 못했습니다</strong>
            <button
              className="public-subject-more__button"
              onClick={() => {
                trackSelectContent("retry", "subject");
                setRetryNonce((nonce) => nonce + 1);
              }}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : isEmpty ? (
          <div className="public-subject-empty">
            <strong>아직 등록된 {subject} 교재가 없어요</strong>
            <Link className="public-subject-empty__link" to="/">
              전체 교재 보러가기
            </Link>
          </div>
        ) : (
          <>
            <div className="public-home-store-grid__list">
              {products.map((product, index) => (
                <ProductCard
                  analyticsIndex={index}
                  analyticsListName={`과목별 · ${subject}`}
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
                  onClick={() => {
                    // GA4 load_more — 랜딩에서 목록을 얼마나 더 파고드는지
                    trackLoadMore(`과목별 · ${subject}`, {
                      nextPage: page + 1,
                      loadedCount: products.length,
                      totalCount,
                    });
                    setPage((current) => current + 1);
                  }}
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

export default PublicSubjectPage;
