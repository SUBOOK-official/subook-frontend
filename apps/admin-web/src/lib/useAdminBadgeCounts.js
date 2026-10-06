import { useSyncExternalStore } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 셸과 대시보드가 집계를 공유한다. 실패를 0건으로 변환하지 않는다.
const initial = { pickups: null, inspection: null, orders: null, ordersPending: null, ordersPreparing: null, settlements: null, failedNotifications: null, loaded: false, error: "", updatedAt: null };
let snapshot = initial;
const listeners = new Set();
let timer;
let inflight = false;
let authSubscription;
let generation = 0;

export async function refreshAdminBadgeCounts() {
  if (inflight || !isSupabaseConfigured || !supabase) return;
  inflight = true;
  const currentGeneration = generation;
  try {
    const queries = {
      pickups: supabase.from("pickup_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      inspection: supabase.from("shipments").select("id", { count: "exact", head: true }).in("status", ["scheduled", "inspecting"]),
      ordersPending: supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ordersPreparing: supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "preparing"),
      settlements: supabase.from("settlements").select("id", { count: "exact", head: true }).in("status", ["pending", "approved"]),
      failedNotifications: supabase.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    };
    const results = await Promise.allSettled(Object.values(queries));
    if (currentGeneration !== generation) return;
    const next = { ...snapshot, loaded: true, error: "" };
    Object.keys(queries).forEach((key, i) => {
      const result = results[i];
      if (result.status === "fulfilled" && !result.value.error) next[key] = result.value.count ?? 0;
      else next.error = "일부 업무 건수를 갱신하지 못했습니다. 이전 조회값이 표시될 수 있습니다.";
    });
    next.orders = next.ordersPending == null || next.ordersPreparing == null ? null : next.ordersPending + next.ordersPreparing;
    if (!next.error) next.updatedAt = new Date().toISOString();
    snapshot = next;
    listeners.forEach((listener) => listener());
  } finally { inflight = false; }
}
function onVisible() {
  if (document.visibilityState === "visible") void refreshAdminBadgeCounts();
}
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshAdminBadgeCounts();
    timer = window.setInterval(onVisible, 30000);
    document.addEventListener("visibilitychange", onVisible);
    authSubscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        generation += 1;
        snapshot = initial;
        listeners.forEach((notify) => notify());
      }
    }).data.subscription;
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      authSubscription?.unsubscribe();
    }
  };
}
export function useAdminBadgeCounts() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
