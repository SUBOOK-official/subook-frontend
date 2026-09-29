import { supabase } from "./adminSupabaseClient";

export async function loadGrowthTrackingHealth(range, transactionIds, signal) {
  const { data, error } = await supabase.rpc('admin_growth_tracking_health', {
    p_from: range.from, p_to: range.to, p_ga_transaction_ids: transactionIds ?? null,
  }).abortSignal(signal);
  if (error) throw new Error('계측 상태를 불러오지 못했습니다.');
  return data;
}
export async function retentionExperimentAction(action, args = {}) {
  const names = { list:'admin_retention_experiments', create:'admin_create_retention_experiment', start:'admin_start_retention_experiment' };
  if (!names[action]) throw new Error('허용하지 않은 작업입니다.');
  const { data, error } = await supabase.rpc(names[action], args).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error(error.message || '실험 요청에 실패했습니다.');
  return data;
}

export async function loadPerformanceSales(range, signal) {
  if (!supabase) throw new Error("서버 연결 설정을 확인해주세요.");
  const { data, error } = await supabase.rpc("admin_performance_report", { p_from: range.from, p_to: range.to }).abortSignal(signal);
  if (error) throw new Error("실적 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  if (!data?.current || !Array.isArray(data.daily)) throw new Error("실적 응답을 확인하지 못했습니다.");
  return data;
}

export async function loadPerformanceProviders(range, drill, signal) {
  if (!supabase) throw new Error("서버 연결 설정을 확인해주세요.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("다시 로그인해주세요.");
  const query = new URLSearchParams({ ...range, level: drill.level });
  if (drill.campaignId) query.set("campaignId", drill.campaignId);
  if (drill.adsetId) query.set("adsetId", drill.adsetId);
  const response = await fetch(`/api/admin/performance?${query}`, {
    headers: { Authorization: `Bearer ${data.session.access_token}` }, signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ga || !result?.meta) throw new Error(result?.error || "방문·광고 데이터를 불러오지 못했습니다.");
  return result;
}
