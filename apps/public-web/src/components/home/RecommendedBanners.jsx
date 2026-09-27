import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { listRecommendations } from "@shared-supabase/recommendationsClient";
import { fetchStorefrontProductDetail } from "../../lib/storefront";
import ContentContainer from "../ContentContainer";
import "./UiFirstUpdate.css";

export default function RecommendedBanners() {
  const [banners, setBanners] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = (await listRecommendations(supabase)).slice(0, 8);
      const items = await Promise.all(rows.map(async (row) => ({ ...row, product: (await fetchStorefrontProductDetail(row.product_id)).product })));
      if (!cancelled) setBanners(items.filter(({ product }) => product && !product.isSoldOut && product.isPublic !== false));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!banners.length) return null;
  return <ContentContainer><section className="ui-recommended-banners" aria-label="수북 추천 교재">{banners.map(({ product, headline }) => <Link to={`/store/${product.id}`} key={product.id} className="ui-recommended-banner"><div><small>수북 PICK · {product.subject}</small><h2>{headline || product.title}</h2><span>교재 살펴보기 ↗</span></div><img src={product.coverImageUrl} alt={product.title} loading="lazy" /></Link>)}</section></ContentContainer>;
}
