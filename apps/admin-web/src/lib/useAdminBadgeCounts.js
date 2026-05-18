import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

const POLL_INTERVAL_MS = 60_000;

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
        fetchHeadCount("shipments", (q) => q.in("status", ["arrived", "inspecting"])),
        fetchHeadCount("orders", (q) => q.eq("status", "paid")),
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
