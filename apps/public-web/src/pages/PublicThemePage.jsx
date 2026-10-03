import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { themeFilterContextLabels } from "@shared-domain/themeFilters";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { getPublicThemePage, listPublicStorePopularity } from "@shared-supabase/curatedContentClient";
import { filterStorefrontProducts, normalizeStorefrontProductRow, sortStorefrontProducts } from "../lib/storefront";
import { selectDiscountProducts } from "../lib/storefrontDiscounts";
import { loadStorePopularity, loadThemeCatalog, orderThemeProductsByPopularity } from "../lib/themeCatalog";
import { STORE_SORT_OPTIONS } from "../lib/publicStoreNavigation";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import ContentContainer from "../components/ContentContainer";
import HomeStoreGrid from "../components/home/HomeStoreGrid";
import { ProductCardSkeleton } from "../components/ProductCard";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicThemePage.css";

const EMPTY = { theme: null, products: [], loading: true, error: false };
const THEME_SORT_OPTIONS = STORE_SORT_OPTIONS.filter((option) => option.value !== "recommended");

export default function PublicThemePage() {
  const { themeId } = useParams();
  const [state, setState] = useState(EMPTY);
  const [retry, setRetry] = useState(0);
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const current = state.themeId === themeId ? state : EMPTY;
  usePageMeta({ title: current.theme?.title || "테마별 교재", canonicalPath: `/themes/${themeId}` });
  useEffect(() => {
    let cancelled = false;
    setState({ ...EMPTY, themeId });
    Promise.all([
      loadThemeCatalog((pagination) => getPublicThemePage(supabase, themeId, pagination)),
      loadStorePopularity((pagination) => listPublicStorePopularity(supabase, pagination)),
    ]).then(([data, ranks]) => {
      if (!cancelled) setState({ themeId, theme: data.theme, products: orderThemeProductsByPopularity(data.products, ranks).map(normalizeStorefrontProductRow), loading: false, error: false });
    }).catch(() => { if (!cancelled) setState({ ...EMPTY, themeId, loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [themeId, retry]);
  const loadProducts = useCallback(async (filters) => {
    let rows = filterStorefrontProducts(current.products, filters);
    // 기본 인기순은 메인 목록에서 받은 순서를 필터·페이지 이동 중에도 유지한다.
    if (filters.sort !== "popular") rows = sortStorefrontProducts(rows, filters.sort);
    rows = selectDiscountProducts(rows, filters);
    return { products: rows.slice(filters.offset, filters.offset + filters.limit), totalCount: rows.length };
  }, [current.products]);
  return <PublicPageFrame><PublicSiteHeader /><div className="public-theme-layout">
    <ContentContainer><main className="public-theme-page">
      {current.loading ? <div className="public-theme-page__products" aria-label="교재를 불러오는 중" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}</div>
        : current.error ? <div role="alert"><p>테마를 불러오지 못했어요.</p><button onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>
          : !current.theme ? <h1>종료되었거나 공개되지 않은 테마입니다.</h1> : <>
            <nav className="public-theme-page__breadcrumb" aria-label="현재 위치"><Link to="/">홈</Link><span aria-hidden="true">/</span><span>테마관</span></nav>
            <header className="public-theme-page__header">
              <div className="public-theme-page__intro"><p className="public-theme-page__eyebrow">수북 테마관</p><h1>{current.theme.title}</h1>
                {current.theme.description && <p className="public-theme-page__description">{current.theme.description}</p>}
                {themeFilterContextLabels(current.theme.filter_context).length > 0 && <ul className="public-theme-page__context" aria-label="관의 고정 조건">{themeFilterContextLabels(current.theme.filter_context).map((label) => <li key={label}>{label}</li>)}</ul>}
              </div>
              <img className="public-theme-page__icon" src={current.theme.image_url} alt="" width="100" height="100" />
            </header>
          </>}
    </main></ContentContainer>
    {!current.loading && !current.error && current.theme && <HomeStoreGrid key={themeId} queryPath={`/themes/${themeId}`} loadProducts={loadProducts} favoriteIds={favoriteIds}
      sortOptions={THEME_SORT_OPTIONS} allowRelevanceSort={false}
      filterContext={current.theme.filter_context} showResultCount
      searchLabel={`${current.theme.title} 내 검색`}
      showSearch
      onToggleFavorite={(id) => { if (requireMember("favorite")) void toggleFavorite(id, { uiSurface: "theme_card" }); }} />}
    </div><PublicFooter />{memberGateDialog}</PublicPageFrame>;
}
