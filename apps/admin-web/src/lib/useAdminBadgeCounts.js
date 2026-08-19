import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 30초 폴링. Realtime channel 도입은 코드량이 많아 일단 폴링 간격만 단축.
// TODO: 추후 supabase.channel("admin-badges")로 INSERT/UPDATE 이벤트 구독으로 전환 검토.
const POLL_INTERVAL_MS = 30_000;

const EMPTY_COUNTS = {
  pickups: 0,
  inspection: 0,
  orders: 0,
  // '오늘 할 일' 대시보드용 세분화 — orders = ordersPending + ordersPreparing
  ordersPending: 0,
  ordersPreparing: 0,
  settlements: 0,
  // 사이드바 nav 배지가 아니라 셸 헤더 경고 칩용 — 최근 24시간 알림톡/SMS 발송 실패 누적
  failedNotifications: 0,
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
      // 로컬(KST) 기준 날짜 — toISOString은 UTC라 KST 새벽 0~9시에 전날로 밀린다
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [
        pickups,
        inspection,
        ordersPending,
        ordersPreparing,
        settlementsDue,
        failedNotifications,
      ] = await Promise.all([
        fetchHeadCount("pickup_requests", (q) => q.eq("status", "pending")),
        // shipments.status enum은 scheduled/inspecting/inspected. (arrived는 pickup_requests 상태라
        // 여기서 쓰면 항상 0건 → 검수 대기 배지가 안 뜸) scheduled=입고 후 검수 대기, inspecting=검수중.
        fetchHeadCount("shipments", (q) => q.in("status", ["scheduled", "inspecting"])),
        // '결제완료(paid)' 단계 폐지 — 결제 확인 즉시 preparing으로 간다.
        // '오늘 할 일' 카드가 두 단계를 구분해 안내하도록 분리 집계 (nav 배지는 합산 사용).
        fetchHeadCount("orders", (q) => q.eq("status", "pending")),
        fetchHeadCount("orders", (q) => q.eq("status", "preparing")),
        // 승인 단계 폐지(2026-08-19): 미지급(pending + 레거시 approved) 중 지급일 도래분만 배지
        fetchHeadCount("settlements", (q) =>
          q.in("status", ["pending", "approved"]).lte("scheduled_date", today),
        ),
        // 발송 실패는 24시간 창으로 셈 (전체 누적이면 과거 실패가 영구히 배지에 남음)
        fetchHeadCount("notification_logs", (q) =>
          q.eq("status", "failed").gte("created_at", oneDayAgoIso),
        ),
      ]);

      setCounts({
        pickups,
        inspection,
        orders: ordersPending + ordersPreparing,
        ordersPending,
        ordersPreparing,
        settlements: settlementsDue,
        failedNotifications,
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
