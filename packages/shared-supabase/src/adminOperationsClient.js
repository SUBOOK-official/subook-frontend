import { supabase } from "./adminSupabaseClient.js";

async function request(build, retry = false) {
  if (!supabase) throw new Error("관리자 연결을 확인해 주세요.");
  let lastError;
  for (let attempt = 0; attempt < (retry ? 2 : 1); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await build(controller.signal);
      if (result.error) throw result.error;
      return result;
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
  }
  throw new Error(lastError?.message || "요청을 완료하지 못했습니다. 다시 조회해 주세요.");
}

export async function loadAdminOperations(kind, params = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const range = [(page - 1) * 50, page * 50 - 1];
  const rpc = {
    queue: ["admin_operation_queue", { p_limit: 30 }],
    inventory: ["admin_inventory_ageing", { p_days: Number(params.days) || 0, p_search: params.q || "", p_limit: 50, p_offset: range[0] }],
    settlements: ["admin_settlement_exceptions", { p_limit: 50, p_offset: range[0] }],
    history: ["admin_operation_history", { p_search: params.q || "", p_entity: params.entity || "", p_id: params.id || "", p_limit: 50, p_offset: range[0] }],
  }[kind];
  if (rpc) return (await request((signal) => supabase.rpc(...rpc).abortSignal(signal), true)).data;
  const result = await request((signal) => {
    let query = supabase.from(kind === "cases" ? "admin_cs_cases" : "admin_work_jobs").select("*", { count: "exact" }).order("updated_at", { ascending: false }).order("id").range(...range);
    if (params.status) query = query.eq("status", params.status);
    if (params.id) query = query.eq("id", params.id);
    if (kind === "cases" && params.order) query = query.eq("order_id", params.order);
    if (kind === "cases" && params.pickup) query = query.eq("pickup_request_id", params.pickup);
    if (params.q?.trim()) {
      const q = params.q.replace(/[,()%*]/g, " ").trim();
      if (kind === "cases") query = query.or(`title.ilike.%${q}%,customer_name.ilike.%${q}%,contact.ilike.%${q}%,assignee.ilike.%${q}%`);
      else query = query.ilike("label", `%${q}%`);
    }
    return query.abortSignal(signal);
  }, true);
  return { items: result.data || [], total_count: result.count || 0 };
}

export async function saveAdminCase(values, original) {
  const payload = {
    title: values.title.trim(), customer_name: values.customer_name.trim(), contact: values.contact.trim(),
    assignee: values.assignee.trim(), status: values.status, priority: values.priority,
    due_date: values.due_date || null, note: values.note.trim(),
    order_id: values.order_id ? Number(values.order_id) : null,
    pickup_request_id: values.pickup_request_id ? Number(values.pickup_request_id) : null,
    member_user_id: values.member_user_id || null,
  };
  if (!payload.title) throw new Error("문의 제목을 입력해 주세요.");
  const result = await request((signal) => original?.id
    ? supabase.from("admin_cs_cases").update(payload).eq("id", original.id).eq("updated_at", original.updated_at).select().abortSignal(signal)
    : supabase.from("admin_cs_cases").insert(payload).select().abortSignal(signal));
  if (!result.data?.[0]) throw new Error("다른 운영자가 수정했습니다. 닫고 다시 조회한 뒤 반영해 주세요.");
  return result.data[0];
}

export async function beginAdminJob({ kind, label, total, href, targets = [] }) {
  const result = await request((signal) => supabase.from("admin_work_jobs").insert({ kind, label, total, result_href: href, target_ids: targets }).select("id").single().abortSignal(signal));
  return result.data.id;
}
export async function updateAdminJob(id, values) {
  const result = await request((signal) => supabase.from("admin_work_jobs").update(values).eq("id", id).select("id").abortSignal(signal));
  if (!result.data?.length) throw new Error("작업 결과를 기록하지 못했습니다. 작업 이력을 확인해 주세요.");
}

export async function saveCouponTags(values) {
  await request((signal) => supabase.from("admin_coupon_tags").upsert({ coupon_id: values.coupon_id, category: values.category, campaign: values.campaign.trim() }).select("coupon_id").single().abortSignal(signal));
}

export async function loadFulfillmentChecks(ids) {
  if (!ids.length) return [];
  return (await request((signal) => supabase.from("admin_fulfillment_checks").select("*").in("order_id", ids).abortSignal(signal), true)).data || [];
}
export async function saveFulfillmentCheck(orderId, values) {
  return (await request((signal) => supabase.rpc("admin_set_fulfillment_check", { p_order_id: orderId, p_item_id: values.itemId ?? null, p_picked: values.picked ?? null, p_packed: values.packed ?? null }).abortSignal(signal))).data;
}

export async function loadEntityNotifications(entity, id) {
  return (await request((signal) => supabase.from("notification_logs").select("id,notification_type,status,created_at,error_message").eq("ref_id", String(id)).eq("ref_type", entity).order("created_at", { ascending: false }).limit(30).abortSignal(signal), true)).data || [];
}
