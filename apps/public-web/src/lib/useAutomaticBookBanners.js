import { useEffect, useState } from "react";
import { normalizeStorefrontProductRow } from "./storefront";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { listPublicHeroProducts } from "@shared-supabase/curatedContentClient";
import { buildAutomaticBookBanners } from "./automaticBookBanners";
import { trackException } from "./analytics";
import { bannerCopyMap, fetchBannerCopies } from "./bannerCopies";

export default function useAutomaticBookBanners() {
  const [slides, setSlides] = useState([]);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      // 느린 문구 조회가 교재 배너의 첫 표시를 막지 않도록 병렬로 시작한다.
      const copiesRequest = fetchBannerCopies();
      try {
        const rows = await listPublicHeroProducts(supabase);
        const products = rows.map((row) => ({ ...normalizeStorefrontProductRow(row.product), bannerHeadline: row.headline }));
        if (!disposed) setSlides(buildAutomaticBookBanners(products));
        const copies = await copiesRequest;
        if (!disposed) setSlides(buildAutomaticBookBanners(products, products.length, bannerCopyMap(copies)));
      } catch {
        trackException("home_automatic_banners_load_failed");
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return slides;
}
