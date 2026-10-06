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
    const knownCopies = new Map();
    const refresh = async () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      try {
        // 첫 표시부터 최종 문구를 사용하도록 교재와 AI 문구를 함께 준비한다.
        const [rows, copies] = await Promise.all([
          listPublicHeroProducts(supabase),
          fetchBannerCopies(),
        ]);
        const products = rows.map((row) => ({ ...normalizeStorefrontProductRow(row.product), bannerHeadline: row.headline }));
        if (!disposed) {
          // 조회 실패·부분 응답으로 기존 문구를 기본 문구로 되돌리지 않는다.
          for (const [productId, copy] of bannerCopyMap(copies)) knownCopies.set(productId, copy);
          setSlides(buildAutomaticBookBanners(products, products.length, knownCopies));
        }
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
