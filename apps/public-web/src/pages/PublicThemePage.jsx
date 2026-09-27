import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { fetchStorefrontProductDetail } from "../lib/storefront";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import PublicFooter from "../components/PublicFooter";
import ContentContainer from "../components/ContentContainer";
import ProductCard from "../components/ProductCard";
import { usePublicWishlist } from "../contexts/PublicWishlistContext";
import usePublicMemberGate from "../lib/publicMemberGate";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicThemePage.css";

export default function PublicThemePage() {
  const { themeId } = useParams();
  const [state, setState] = useState({ id: null, theme: null, products: [], loading: true, error: false });
  const [retry, setRetry] = useState(0);
  const { favoriteIds, toggleFavorite } = usePublicWishlist();
  const { requireMember, memberGateDialog } = usePublicMemberGate();
  const current = state.id === themeId ? state : { theme: null, products: [], loading: true, error: false };
  usePageMeta({ title: current.theme?.title || "테마별 교재", canonicalPath: `/themes/${themeId}` });
  useEffect(() => {
    let cancelled = false;
    setState({ id: themeId, theme: null, products: [], loading: true, error: false });
    (async () => {
      if (!supabase) throw new Error("연결 오류");
      const { data: theme, error } = await supabase.from("content_themes").select("id,title,image_url,product_ids").eq("id", themeId).eq("is_enabled", true).maybeSingle();
      if (error) throw error;
      const products = [];
      // Bound concurrent detail requests for larger themes.
      for (let index = 0; index < (theme?.product_ids.length ?? 0); index += 8) {
        const details = await Promise.all(theme.product_ids.slice(index, index + 8).map(fetchStorefrontProductDetail));
        if (cancelled) return;
        if (details.some((detail) => detail.error)) throw new Error("교재 조회 오류");
        products.push(...details.map((detail) => detail.product).filter((product) => product && product.isPublic !== false && !product.isSoldOut));
      }
      if (!cancelled) setState({ id: themeId, theme, products, loading: false, error: false });
    })().catch(() => { if (!cancelled) setState({ id: themeId, theme: null, products: [], loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [themeId, retry]);
  return <PublicPageFrame><PublicSiteHeader /><ContentContainer><main className="public-theme-page">
    <Link to="/">← 홈으로</Link>
    {current.loading ? <p role="status">교재를 불러오는 중…</p> : current.error ? <div role="alert"><p>테마를 불러오지 못했어요.</p><button onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div> : !current.theme ? <h1>종료되었거나 공개되지 않은 테마입니다.</h1> : <><header><img src={current.theme.image_url} alt="" width="80" height="80" /><h1>{current.theme.title}</h1><p>{current.products.length}개의 교재</p></header>{!current.products.length ? <p>현재 구매 가능한 교재가 없습니다.</p> : <div className="public-theme-page__products">{current.products.map((product) => <ProductCard key={product.id} product={product} isFavorite={favoriteIds.includes(String(product.id))} onToggleFavorite={(id) => { if (requireMember("favorite")) void toggleFavorite(id, { uiSurface: "theme_card" }); }} />)}</div>}</>}
  </main></ContentContainer><PublicFooter />{memberGateDialog}</PublicPageFrame>;
}
