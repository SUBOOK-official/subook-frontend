import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { listPublicRecommendationBanners } from "@shared-supabase/curatedContentClient";
import { normalizeStorefrontProductRow } from "../../lib/storefront";
import { getThumbnailImageUrl } from "../../lib/storageImage";
import { trackException, trackSelectPromotion, trackViewPromotion } from "../../lib/analytics";
import { useInViewOnce } from "../../lib/useInViewOnce";
import ContentContainer from "../ContentContainer";
import "./UiFirstUpdate.css";

function RecommendationBanner({ product, headline, index }) {
  const ref = useRef(null);
  const analytics = { promotionId: `recommended_${product.id}`, promotionName: headline || product.title, creativeSlot: `home_recommended_${index + 1}` };
  useInViewOnce(ref, () => trackViewPromotion(analytics));
  return <Link ref={ref} to={`/store/${product.id}`} className="ui-recommended-banner" onClick={() => trackSelectPromotion(analytics)}>
    <div><small>수북 PICK · {product.subject}</small><h2>{headline || product.title}</h2><span>교재 살펴보기 ↗</span></div>
    <img src={getThumbnailImageUrl(product.coverImageUrl)} alt={product.title} loading="lazy" />
  </Link>;
}

export default function RecommendedBanners() {
  const [banners, setBanners] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listPublicRecommendationBanners(supabase).then((rows) => {
      if (!cancelled) setBanners((rows ?? []).map((row) => ({ ...row, product: normalizeStorefrontProductRow(row.product) })));
    }).catch(() => trackException("home_recommendations_load_failed"));
    return () => { cancelled = true; };
  }, []);
  if (!banners.length) return null;
  return <ContentContainer><section className="ui-recommended-banners" aria-label="수북 추천 교재">
    {banners.map((row, index) => <RecommendationBanner key={row.product.id} {...row} index={index} />)}
  </section></ContentContainer>;
}
