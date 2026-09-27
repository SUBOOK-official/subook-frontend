import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { getPublicThemePage } from "@shared-supabase/curatedContentClient";
import { normalizeStorefrontProductRow } from "../lib/storefront";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import ContentContainer from "../components/ContentContainer";
import ProductCard, { ProductCardSkeleton } from "../components/ProductCard";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePageMeta } from "../lib/usePageMeta";
import { trackListPagination, trackViewItemList } from "../lib/analytics";
import { useInViewOnce } from "../lib/useInViewOnce";
import "./PublicThemePage.css";

const PAGE_SIZE = 24;
const EMPTY = { theme: null, products: [], total: 0, loading: true, error: false };

export default function PublicThemePage() {
  const { themeId } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.get("page")) || 1)));
  const key = `${themeId}:${page}`;
  const [state, setState] = useState(EMPTY);
  const [retry, setRetry] = useState(0);
  const listRef = useRef(null);
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const current = state.key === key ? state : EMPTY;
  const pageCount = Math.max(1, Math.ceil(current.total / PAGE_SIZE));
  usePageMeta({ title: current.theme?.title || "테마별 교재", canonicalPath: `/themes/${themeId}` });
  useInViewOnce(listRef, () => trackViewItemList("테마관", current.products.map((product, index) => ({
    ...product, productId: product.id, index: (page - 1) * PAGE_SIZE + index,
  })), { uiSurface: "theme", contentId: themeId }), { enabled: !current.loading && current.products.length > 0, resetKey: key });
  useEffect(() => {
    let cancelled = false;
    setState({ ...EMPTY, key });
    getPublicThemePage(supabase, themeId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).then((data) => {
      if (!cancelled) setState({ key, theme: data?.theme ?? null, products: (data?.products ?? []).map(normalizeStorefrontProductRow), total: data?.total_count ?? 0, loading: false, error: false });
    }).catch(() => { if (!cancelled) setState({ ...EMPTY, key, loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [themeId, page, key, retry]);
  function changePage(next) {
    setParams(next > 1 ? { page: String(next) } : {});
    trackListPagination("테마관", { pageNumber: next, previousPage: page, totalPages: pageCount, navMethod: "button" }, { uiSurface: "theme", contentId: themeId });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return <PublicPageFrame><PublicSiteHeader /><ContentContainer><main className="public-theme-page">
    <Link to="/">← 홈으로</Link>
    {current.loading ? <div className="public-theme-page__products" aria-label="교재를 불러오는 중" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}</div>
      : current.error ? <div role="alert"><p>테마를 불러오지 못했어요.</p><button onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>
        : !current.theme ? <h1>종료되었거나 공개되지 않은 테마입니다.</h1> : <>
          <header><img src={current.theme.image_url} alt="" width="80" height="80" /><h1>{current.theme.title}</h1><p>{current.total}개의 교재</p></header>
          {!current.products.length ? <p>{page > 1 && current.total ? "이 페이지에 교재가 없습니다." : "현재 구매 가능한 교재가 없습니다."}</p> : <div className="public-theme-page__products" ref={listRef}>
            {current.products.map((product, index) => <ProductCard key={product.id} product={product} analyticsListName="테마관" analyticsIndex={(page - 1) * PAGE_SIZE + index}
              isFavorite={favoriteIds.includes(String(product.id))} onToggleFavorite={(id) => { if (requireMember("favorite")) void toggleFavorite(id, { uiSurface: "theme_card" }); }} />)}
          </div>}
          {(pageCount > 1 || page > 1) && <nav className="public-theme-page__pagination" aria-label="테마 교재 페이지">
            <button type="button" disabled={page <= 1} onClick={() => changePage(Math.min(page - 1, pageCount))}>이전</button>
            <span>{page} / {pageCount}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => changePage(page + 1)}>다음</button>
          </nav>}
        </>}
  </main></ContentContainer><PublicFooter />{memberGateDialog}</PublicPageFrame>;
}
