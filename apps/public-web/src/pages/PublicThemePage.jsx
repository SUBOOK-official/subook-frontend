import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { getPublicThemePage } from "@shared-supabase/curatedContentClient";
import { filterStorefrontProducts, normalizeStorefrontProductRow, sortStorefrontProducts } from "../lib/storefront";
import { selectDiscountProducts } from "../lib/storefrontDiscounts";
import { loadThemeCatalog } from "../lib/themeCatalog";
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
// 테마 RPC는 인기·검색 관련도 지표를 제공하지 않는다.
const THEME_SORT_OPTIONS = STORE_SORT_OPTIONS.filter((option) => option.value !== "popular");

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
    loadThemeCatalog((pagination) => getPublicThemePage(supabase, themeId, pagination)).then((data) => {
      if (!cancelled) setState({ themeId, theme: data.theme, products: data.products.map(normalizeStorefrontProductRow), loading: false, error: false });
    }).catch(() => { if (!cancelled) setState({ ...EMPTY, themeId, loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [themeId, retry]);
  const loadProducts = useCallback(async (filters) => {
    let rows = filterStorefrontProducts(current.products, filters);
    // The theme RPC supplies the curated order. Preserve it for the default recommendation sort.
    if (filters.sort !== "recommended") rows = sortStorefrontProducts(rows, filters.sort);
    rows = selectDiscountProducts(rows, filters);
    return { products: rows.slice(filters.offset, filters.offset + filters.limit), totalCount: rows.length };
  }, [current.products]);
  return <PublicPageFrame><PublicSiteHeader />
    <ContentContainer><main className="public-theme-page">
      {current.loading ? <div className="public-theme-page__products" aria-label="교재를 불러오는 중" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <ProductCardSkeleton key={index} />)}</div>
        : current.error ? <div role="alert"><p>테마를 불러오지 못했어요.</p><button onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>
          : !current.theme ? <h1>종료되었거나 공개되지 않은 테마입니다.</h1> : <header><img src={current.theme.image_url} alt="" width="80" height="80" /><h1>{current.theme.title}</h1><p>{current.products.length}개의 교재</p></header>}
    </main></ContentContainer>
    {!current.loading && !current.error && current.theme && <HomeStoreGrid key={themeId} queryPath={`/themes/${themeId}`} loadProducts={loadProducts} favoriteIds={favoriteIds}
      sortOptions={THEME_SORT_OPTIONS} allowRelevanceSort={false}
      searchLabel={`${current.theme.title} 내 검색`}
      onToggleFavorite={(id) => { if (requireMember("favorite")) void toggleFavorite(id, { uiSurface: "theme_card" }); }} />}
    <PublicFooter />{memberGateDialog}</PublicPageFrame>;
}
