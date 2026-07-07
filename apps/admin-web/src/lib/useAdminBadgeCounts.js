import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 30초 폴링. Realtime channel 도입은 코드량이 많아 일단 폴링 간격만 단축.
// TODO: 추후 supabase.channel("admin-badges")로 INSERT/UPDATE 이벤트 구독으로 전환 검토.
const POLL_INTERVAL_MS = 30_000;

const EMPTY_COUNTS = {
  pickups: 0,
  inspection: 0,
  orders: 0,
  settlements: 0,
  loaded: false,
};

async function fetchHeadCount(table, applyQuery) {
  if (!isSupabaseConfigured || !supabase) {
    return 0;
  }

  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (applyQuery) {
    query = applyQuery(query);
  }

  const { count, error } = await query;
  if (error) {
    return 0;
  }
  return count ?? 0;
}

export function useAdminBadgeCounts() {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    if (!isSupabaseConfigured || !supabase) return;

    inflightRef.current = true;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const [pickups, inspection, orders, settlements] = await Promise.all([
        fetchHeadCount("pickup_requests", (q) => q.eq("status", "pending")),
        // shipments.status enum은 scheduled/inspecting/inspected. (arrived는 pickup_requests 상태라
        // 여기서 쓰면 항상 0건 → 검수 대기 배지가 안 뜸) scheduled=입고 후 검수 대기, inspecting=검수중.
        fetchHeadCount("shipments", (q) => q.in("status", ["scheduled", "inspecting"])),
        // '결제완료(paid)' 단계 폐지 — 결제 확인 즉시 preparing으로 간다.
        // 처리 필요 배지 = 입금확인 대기(pending) + 송장 입력 대기(preparing) 주문 수.
        fetchHeadCount("orders", (q) => q.in("status", ["pending", "preparing"])),
        fetchHeadCount("settlements", (q) =>
          q.eq("status", "pending").lte("scheduled_date", today),
        ),
      ]);

      setCounts({
        pickups,
        inspection,
        orders,
        settlements,
        loaded: true,
      });
    } finally {
      inflightRef.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return counts;
}
