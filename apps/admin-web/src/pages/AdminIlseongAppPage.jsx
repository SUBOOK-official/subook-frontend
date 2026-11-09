import { useCallback, useEffect, useState } from "react";
import { supabase } from "@shared-supabase/adminSupabaseClient";
import { ILSEONG_APP_REFUND_POLICIES } from "@shared-domain/ilseongApp";
import AdminShell from "../components/AdminShell";

// 일성월심 앱 패키지 — 앱 서버 연결 상태, 판매 켜기/끄기, 환불 시 처리 방식,
// 코드 발급 대기열, 주문별 코드 상태(코드 원문은 가려서만 보여준다).
const LINE_STATUS_LABELS = {
  pending: "발급 대기",
  issued: "등록 전",
  redeemed: "앱에 등록됨",
  revoked: "사용 종료",
};

async function callIlseongApi({ method = "POST", payload = null }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("로그인이 필요합니다.");
  const url = method === "GET" ? "/api/admin/ilseong-app-codes?action=overview" : "/api/admin/ilseong-app-codes";
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error || `요청에 실패했습니다. (${response.status})`);
  }
  return result;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function lineStateLabel(line) {
  if (line.revoke_requested_at && !line.revoke_processed_at) return "사용 종료 처리 중";
  if (line.revoke_requested_at) return "환불로 사용 종료";
  return LINE_STATUS_LABELS[line.status] || line.status;
}

function SectionCard({ title, children, actions = null }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function AdminIlseongAppPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ salesEnabled: false, refundPolicy: "revoke_access", appDownloadUrl: "" });
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDetail, setOrderDetail] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callIlseongApi({ method: "GET" });
      setOverview(result);
      setForm({
        salesEnabled: result?.settings?.sales_enabled === true,
        refundPolicy: result?.settings?.refund_policy || "revoke_access",
        appDownloadUrl: result?.settings?.app_download_url || "",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  async function runAction(payload, successText) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await callIlseongApi({ payload });
      if (successText) setMessage({ tone: "success", text: successText });
      return result;
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    if (form.salesEnabled && !overview?.settings?.sales_enabled) {
      const ok = window.confirm("앱 패키지 판매를 켭니다. 결제가 확인된 주문부터 앱 코드가 발급되고 알림톡이 나갑니다. 진행할까요?");
      if (!ok) return;
    }
    if (!form.salesEnabled && overview?.settings?.sales_enabled) {
      const ok = window.confirm("판매를 끄면 앱 패키지 상품이 모두 비공개로 바뀝니다. 이미 결제된 주문의 코드 발급은 계속됩니다. 진행할까요?");
      if (!ok) return;
    }
    const result = await runAction({
      action: "save_settings",
      salesEnabled: form.salesEnabled,
      refundPolicy: form.refundPolicy,
      appDownloadUrl: form.appDownloadUrl.trim() || null,
    }, "설정을 저장했습니다.");
    if (result) await loadOverview();
  }

  async function lookupOrder(event) {
    event?.preventDefault();
    const value = orderNumber.trim();
    if (!value) return;
    const result = await runAction({ action: "order", orderNumber: value });
    setOrderDetail(result?.order ? result : null);
    if (result && !result.order) setMessage({ tone: "error", text: "앱 패키지 주문이 아닙니다." });
  }

  async function orderAction(action, extra = {}, successText = "") {
    if (!orderDetail?.order?.id) return;
    const result = await runAction({ action, orderId: orderDetail.order.id, ...extra }, successText);
    if (!result) return;
    if (result.order) setOrderDetail(result);
    if (result.notified === false) {
      setMessage({ tone: "error", text: `알림톡을 보내지 못했습니다: ${result.notifyError || "원인 미상"} (대기열이 다시 시도합니다)` });
    }
    loadOverview();
  }

  async function retryJob(orderId) {
    const result = await runAction({ action: "retry", orderId }, "지금 다시 처리하도록 대기열에 올렸습니다.");
    if (result) loadOverview();
  }

  const configured = overview?.configured === true;
  const counts = overview?.counts || {};
  const jobs = Array.isArray(overview?.jobs) ? overview.jobs : [];
  const products = Array.isArray(overview?.products) ? overview.products : [];

  return (
    <AdminShell activeModule="ilseong-app" title="일성월심 앱 패키지">
      <div className="space-y-5">
        {message ? (
          <p
            className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        <SectionCard
          title="연결·판매 설정"
          actions={
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {loading ? "확인 중" : configured ? "앱 서버 연결 설정됨" : "앱 서버 연결 설정 없음"}
            </span>
          }
        >
          {!loading && !configured ? (
            <p className="mb-4 text-sm text-slate-600">
              어드민 서버 환경 변수 ILSEONG_API_BASE_URL·ILSEONG_PARTNER_SECRET가 없어 판매를 켤 수 없습니다. 앱 패키지 상품은 공개되지 않습니다.
            </p>
          ) : null}
          <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSaveSettings}>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                checked={form.salesEnabled}
                disabled={busy || (!configured && !form.salesEnabled)}
                onChange={(event) => setForm((prev) => ({ ...prev, salesEnabled: event.target.checked }))}
                type="checkbox"
              />
              앱 패키지 판매 켜기
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              환불 시 앱 이용
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, refundPolicy: event.target.value }))}
                value={form.refundPolicy}
              >
                {ILSEONG_APP_REFUND_POLICIES.map((policy) => (
                  <option key={policy.value} value={policy.value}>{policy.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              앱 스토어 링크(출시 후 입력, 알림톡에는 넣지 않음)
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={busy}
                onChange={(event) => setForm((prev) => ({ ...prev, appDownloadUrl: event.target.value }))}
                placeholder="https://"
                value={form.appDownloadUrl}
              />
            </label>
            <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                환불은 이 설정과 관계없이 그대로 진행됩니다. 교재가 포함된 환불(발송 전 취소 포함)에만 적용되고, 굿즈만 환불하면 앱에는 아무 처리도 하지 않습니다.
              </p>
              <button
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy || loading}
                type="submit"
              >
                설정 저장
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="코드 현황" actions={<button className="text-sm font-semibold text-slate-600 hover:text-slate-950" disabled={loading} onClick={loadOverview} type="button">새로고침</button>}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["처리 대기 주문", counts.pending],
              ["처리 실패 주문", counts.failed],
              ["발급 대기 코드", counts.lines_pending],
              ["등록 전 코드", counts.lines_issued],
              ["앱에 등록된 코드", counts.lines_redeemed],
              ["사용 종료 코드", counts.lines_revoked],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 px-3 py-2">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-lg font-bold text-slate-950">{Number(value || 0).toLocaleString("ko-KR")}</dd>
              </div>
            ))}
          </dl>
          {jobs.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">주문번호</th>
                    <th className="py-2 pr-3">상태</th>
                    <th className="py-2 pr-3">시도</th>
                    <th className="py-2 pr-3">다음 시도</th>
                    <th className="py-2 pr-3">마지막 오류</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="py-2 pr-3 font-semibold text-slate-900">{job.order_number}</td>
                      <td className="py-2 pr-3">{job.status === "failed" ? "실패(자동 재시도 멈춤)" : "대기"}</td>
                      <td className="py-2 pr-3">{job.attempts}</td>
                      <td className="py-2 pr-3">{job.status === "failed" ? "-" : formatDateTime(job.next_attempt_at)}</td>
                      <td className="max-w-xs truncate py-2 pr-3 text-slate-500" title={job.last_error || ""}>{job.last_error || "-"}</td>
                      <td className="py-2 text-right">
                        <button className="text-sm font-semibold text-slate-700 hover:text-slate-950 disabled:opacity-50" disabled={busy} onClick={() => retryJob(job.order_id)} type="button">
                          지금 다시 처리
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="주문별 코드">
          <form className="flex flex-wrap gap-2" onSubmit={lookupOrder}>
            <input
              aria-label="주문번호"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="주문번호 (예: ORD-2611-0001)"
              value={orderNumber}
            />
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50" disabled={busy} type="submit">
              조회
            </button>
          </form>
          {orderDetail?.order ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                <span>
                  <strong className="text-slate-950">{orderDetail.order.order_number}</strong> · 주문 {orderDetail.order.status} · 결제 {orderDetail.order.payment_status}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={busy || !configured} onClick={() => orderAction("refresh", {}, "앱 서버 상태를 다시 읽었습니다.")} type="button">
                    앱 등록 여부 다시 읽기
                  </button>
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={busy} onClick={() => orderAction("retry", {}, "지금 다시 처리하도록 대기열에 올렸습니다.")} type="button">
                    지금 다시 처리
                  </button>
                  <button
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("이 주문의 앱 코드 알림톡을 다시 보냅니다. 진행할까요?")) orderAction("resend", {}, "알림톡을 다시 보냈습니다.");
                    }}
                    type="button"
                  >
                    알림톡 다시 보내기
                  </button>
                </span>
              </div>
              {orderDetail.lines.length === 0 ? (
                <p className="text-sm text-slate-500">이 주문에는 앱 코드가 없습니다.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {orderDetail.lines.map((line) => (
                    <li key={line.line_ref} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                      <span className="w-24 text-xs text-slate-500">{line.line_ref}</span>
                      <span className="flex-1 text-slate-800">{line.title}</span>
                      <span className="font-mono text-slate-900">{line.code_masked || "-"}</span>
                      <span className="text-xs font-semibold text-slate-600">{lineStateLabel(line)}</span>
                      <span className="text-xs text-slate-500">알림 {formatDateTime(line.notified_at)}</span>
                      {line.status === "issued" && !line.revoke_requested_at ? (
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                          disabled={busy || !configured}
                          onClick={() => {
                            if (window.confirm("이 코드를 못 쓰게 하고 새 코드를 발급해 다시 보냅니다. 진행할까요?")) {
                              orderAction("reissue", { lineRef: line.line_ref }, "새 코드를 발급했습니다.");
                            }
                          }}
                          type="button"
                        >
                          새 코드로 바꾸기
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="앱 패키지 상품">
          {products.length === 0 ? (
            <p className="text-sm text-slate-600">
              아직 지정된 상품이 없습니다. 상품 재고 → 상품 상세에서 「앱 패키지로 지정」을 누르면 여기에 나옵니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {products.map((product) => (
                <li key={product.product_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-slate-900">
                    #{product.product_id} {product.title}{product.option ? ` · ${product.option}` : ""}
                  </span>
                  <span className="text-xs text-slate-500">
                    {product.app_product_code} · {product.is_listed ? "공개" : "비공개"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}
