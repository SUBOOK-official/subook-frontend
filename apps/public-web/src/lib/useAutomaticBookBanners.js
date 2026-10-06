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
      // 느린 문구 조회가 교재 배너의 첫 표시를 막지 않도록 병렬로 시작한다.
      const copiesRequest = fetchBannerCopies();
      try {
        const rows = await listPublicHeroProducts(supabase);
        const products = rows.map((row) => ({ ...normalizeStorefrontProductRow(row.product), bannerHeadline: row.headline }));
        // 창 복귀·주기 갱신 중에도 이미 읽은 AI 문구를 유지한다.
        if (!disposed) setSlides(buildAutomaticBookBanners(products, products.length, knownCopies));
        const copies = await copiesRequest;
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
