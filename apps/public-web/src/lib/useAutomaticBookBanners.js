import { useEffect, useState } from "react";
import { fetchStorefrontProducts } from "./storefront";
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
        const result = await fetchStorefrontProducts({ sort: "recommended", limit: 13, offset: 0 });
        if (result.error) throw result.error;
        const products = result.products ?? [];
        if (!disposed) setSlides(buildAutomaticBookBanners(products, 13));
        const copies = await copiesRequest;
        if (!disposed) setSlides(buildAutomaticBookBanners(products, 13, bannerCopyMap(copies)));
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
