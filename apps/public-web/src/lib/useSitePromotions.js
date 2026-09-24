import { useEffect, useState } from "react";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { listPromotions } from "@shared-supabase/sitePromotionsClient";
import { activePromotions } from "@shared-domain/sitePromotions";

export default function useSitePromotions() {
  const [rows, setRows] = useState([]);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      try {
        const data = await listPromotions(supabase, { publishedOnly: true });
        if (!disposed) { setRows(data || []); setNow(Date.now()); }
      } catch {
        // 연결 실패 시 이전 광고나 비노출 광고를 되살리지 않는다. 상품 영역은 계속 사용 가능.
        if (!disposed) setRows([]);
      } finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 30000);
    const resume = () => { setNow(Date.now()); void refresh(); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  useEffect(() => {
    const boundary = rows.flatMap((row) => [Date.parse(row.starts_at), Date.parse(row.ends_at)])
      .filter((time) => Number.isFinite(time) && time > now).sort((a, b) => a - b)[0];
    if (!boundary) return undefined;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(0, boundary - Date.now())));
    return () => window.clearTimeout(timer);
  }, [rows, now]);

  return activePromotions(rows, now);
}
