import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AdminShell from "../components/AdminShell";
import { loadPerformanceProviders, loadPerformanceSales } from "@shared-supabase/adminPerformanceClient";
import { PERFORMANCE_PRESETS, formatPerformanceValue as fmt, koreaToday, mergePerformanceDaily,
  metricChange, performanceRange, previousPerformanceRange, validatePerformanceRange } from "@shared-domain/performanceMetrics";

const buttonClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50";
const emptyDrill = { level: "campaign" };
const columns = [
  ["grossRevenue", "매출", "money"], ["netRevenue", "순매출", "money"], ["orders", "주문수", "count"],
  ["soldQuantity", "판매수량", "count"], ["aov", "AOV", "money"], ["visitors", "방문자", "count"],
  ["cvr", "구매전환율", "percent"], ["spend", "광고비", "money"], ["cpa", "광고 CPA", "money"], ["roas", "광고 ROAS", "percent"],
];

function MetricCard({ label, value, previous, format = "count", source, hint, inverse = false }) {
  const change = metricChange(value, previous, format === "percent");
  const good = change && (inverse ? change.value < 0 : change.value > 0);
  return <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-600">{label}</h2><span className="text-[10px] font-semibold text-slate-400">{source}</span></div>
    <p className="mt-3 break-words text-lg font-black tracking-tight text-slate-950 tabular-nums sm:text-xl 2xl:text-2xl">{fmt(value, format)}</p>
    <p className={`mt-2 text-xs font-semibold tabular-nums ${change?.value ? good ? "text-emerald-700" : "text-rose-700" : "text-slate-400"}`}>
      {change ? `${change.value > 0 ? "+" : ""}${change.value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${change.unit} · 직전 기간 대비` : value == null ? "집계 전" : previous === 0 ? "직전 기간 실적 없음" : "비교 데이터 없음"}
    </p>
    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{hint}</p>
  </article>;
}

function SourceStatus({ label, data, loading }) {
  const ready = data?.status === "ready";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-600" : "bg-slate-400"}`} />
    {label} · {loading ? "조회 중" : ready ? "연결됨" : data?.status === "not_configured" ? "연동 필요" : "조회 실패"}
  </span>;
}

function FunnelPair({ title, funnel, startLabel, endLabel, loading }) {
  return <div className="rounded-xl border border-slate-200 p-4">
    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <div><p className="text-xs text-slate-500">{startLabel}</p><p className="mt-1 text-xl font-bold tabular-nums">{fmt(funnel?.entered)}명</p></div>
      <span className="text-slate-400" aria-hidden="true">→</span>
      <div className="text-right"><p className="text-xs text-slate-500">{endLabel}</p><p className="mt-1 text-xl font-bold tabular-nums">{fmt(funnel?.completed)}명</p></div>
    </div>
    <p className="mt-3 text-xs text-slate-500">{loading ? "불러오는 중…" : !funnel ? "GA4 퍼널 연결 후 표시됩니다." : funnel.entered === 0 ? "해당 단계에 진입한 사용자가 없습니다." : `전환율 ${fmt(funnel.rate, "percent")}${funnel.sampled ? " · 표본 데이터" : ""}`}</p>
  </div>;
}

export default function AdminPerformancePage() {
  const [range, setRange] = useState(() => performanceRange());
  const [draft, setDraft] = useState(range);
  const [rangeError, setRangeError] = useState("");
  const [reload, setReload] = useState(0);
  const [sales, setSales] = useState(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");
  const [providers, setProviders] = useState(null);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerError, setProviderError] = useState("");
  const [drill, setDrill] = useState(emptyDrill);
  const [chartMetric, setChartMetric] = useState("revenue");
  const [showAllDays, setShowAllDays] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 20_000);
    setSales(null); setSalesLoading(true); setSalesError("");
    loadPerformanceSales(range, controller.signal).then((result) => {
      if (!controller.signal.aborted) setSales(result);
    }).catch(() => {
      if (!controller.signal.aborted) setSalesError("실적 데이터를 불러오지 못했습니다. 새로고침으로 다시 시도해주세요.");
    }).finally(() => {
      clearTimeout(timeout);
      if (!controller.signal.aborted || controller.signal.reason === "timeout") {
        if (controller.signal.reason === "timeout") setSalesError("실적 조회 시간이 초과되었습니다. 다시 시도해주세요.");
        setSalesLoading(false);
      }
    });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [range, reload]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 65_000);
    setProviders(null); setProvidersLoading(true); setProviderError("");
    loadPerformanceProviders(range, drill, controller.signal).then((result) => {
      if (!controller.signal.aborted) setProviders(result);
    }).catch((error) => {
      if (!controller.signal.aborted) setProviderError(error.message);
    }).finally(() => {
      clearTimeout(timeout);
      if (!controller.signal.aborted || controller.signal.reason === "timeout") {
        if (controller.signal.reason === "timeout") setProviderError("방문·광고 조회 시간이 초과되었습니다. 다시 시도해주세요.");
        setProvidersLoading(false);
      }
    });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [range, drill, reload]);

  const validSales = sales?.from === range.from && sales?.to === range.to ? sales : null;
  const validProviders = providers?.from === range.from && providers?.to === range.to ? providers : null;
  const ga = validProviders?.ga;
  const meta = validProviders?.meta;
  const current = validSales?.current;
  const previous = validSales?.previous;
  const gaCurrent = ga?.status === "ready" ? ga.current : null;
  const gaPrevious = ga?.status === "ready" ? ga.previous : null;
  const metaCurrent = meta?.status === "ready" ? meta.current : null;
  const metaPrevious = meta?.status === "ready" ? meta.previous : null;
  const comparison = previousPerformanceRange(range);
  const daily = useMemo(() => mergePerformanceDaily(validSales?.daily, ga, meta), [validSales, ga, meta]);
  const visibleDays = showAllDays ? [...daily].reverse() : [...daily].reverse().slice(0, 31);

  function selectRange(next) {
    const error = validatePerformanceRange(next.from, next.to);
    setRangeError(error);
    if (error) return;
    setRange(next); setDraft(next); setShowAllDays(false); setDrill(emptyDrill);
  }

  return <AdminShell activeModule="performance" title="성과 대시보드">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="조회 기간">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">{PERFORMANCE_PRESETS.map((preset) => {
          const presetRange = performanceRange(preset.key);
          const selected = range.from === presetRange.from && range.to === presetRange.to;
          return <button key={preset.key} type="button" aria-pressed={selected} onClick={() => selectRange(presetRange)} className={`${buttonClass} ${selected ? "!border-slate-950 !bg-slate-950 !text-white" : ""}`}>{preset.label}</button>;
        })}</div>
        <button type="button" className={buttonClass} disabled={salesLoading || providersLoading} onClick={() => setReload((value) => value + 1)}>새로고침</button>
      </div>
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); selectRange({ from: values.get("from"), to: values.get("to") }); }}>
        <label className="min-w-0 text-xs font-semibold text-slate-500">시작일<input required name="from" aria-label="시작일" type="date" min="2000-01-01" max={koreaToday()} value={draft.from} onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, from: event.target.value }))} className="mt-1 block max-w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
        <label className="min-w-0 text-xs font-semibold text-slate-500">종료일<input required name="to" aria-label="종료일" type="date" min="2000-01-01" max={koreaToday()} value={draft.to} onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, to: event.target.value }))} className="mt-1 block max-w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800" /></label>
        <button className={buttonClass} type="submit">조회</button>
        <p className="pb-2 text-xs text-slate-500 sm:ml-auto">한국시간 · 최대 366일</p>
      </form>
      {rangeError && <p role="alert" className="mt-2 text-sm text-rose-700">{rangeError}</p>}
      <p className="mt-3 text-xs text-slate-500">{range.from} ~ {range.to} <span className="mx-1 text-slate-300">/</span> 비교 {comparison.from} ~ {comparison.to}{range.to === koreaToday() ? " · 오늘은 집계 중" : ""}</p>
    </section>

    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <SourceStatus label="주문 DB" data={validSales ? { status: "ready" } : null} loading={salesLoading} />
      <SourceStatus label="GA4" data={ga} loading={providersLoading} />
      <SourceStatus label="Meta 광고" data={meta} loading={providersLoading} />
      {validSales && <span className="text-xs text-slate-400 sm:ml-auto">실적 조회 {new Date(validSales.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>}
    </div>
    {(salesError || providerError) && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{salesError}{salesError && providerError ? " / " : ""}{providerError}</div>}
    {!providersLoading && [ga, meta].some((source) => source?.status !== "ready") && validProviders && <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">{[ga, meta].filter((source) => source?.status !== "ready").map((source) => source?.message).filter(Boolean).join(" ")} 준비되지 않은 지표는 —로 표시합니다.</p>}

    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6" aria-label="핵심 성과" aria-busy={salesLoading || providersLoading}>
      <MetricCard label="매출" value={current?.grossRevenue} previous={previous?.grossRevenue} format="money" source="DB" hint="할인 후 실결제액 · 배송비 포함" />
      <MetricCard label="순매출" value={current?.netRevenue} previous={previous?.netRevenue} format="money" source="DB" hint={current ? `누적 환불 ${fmt(current.refunds, "money")} 차감` : "해당 결제분의 누적 환불 차감"} />
      <MetricCard label="주문수" value={current?.orders} previous={previous?.orders} source="DB" hint="결제 확인된 주문 · 환불 주문 포함" />
      <MetricCard label="판매 상품 수량" value={current?.soldQuantity} previous={previous?.soldQuantity} source="DB" hint={current ? `결제 ${fmt(current.paidQuantity)}권 − 환불 ${fmt(current.refundedQuantity)}권` : "주문상품 수량 합계 − 환불 수량"} />
      <MetricCard label="AOV" value={current?.aov} previous={previous?.aov} format="money" source="DB" hint="매출 ÷ 결제 주문수" />
      <MetricCard label="구매자수" value={current?.buyers} previous={previous?.buyers} source="DB" hint="기간 내 중복 제거 · 비회원 포함" />
      <MetricCard label="방문자" value={gaCurrent?.visitors} previous={gaPrevious?.visitors} source="GA4" hint="기간 내 중복 제거 방문자" />
      <MetricCard label="구매전환율" value={gaCurrent?.cvr} previous={gaPrevious?.cvr} format="percent" source="GA4" hint="구매 이벤트 세션 ÷ 전체 세션" />
      <MetricCard label="조회 → 장바구니" value={gaCurrent?.cartRate} previous={gaPrevious?.cartRate} format="percent" source="GA4" hint="조회 후 담기를 완료한 사용자 비율" />
      <MetricCard label="결제 이탈률" value={gaCurrent?.checkoutAbandonment} previous={gaPrevious?.checkoutAbandonment} format="percent" source="GA4" hint="결제 시작 후 구매 이벤트 없는 비율" inverse />
      <MetricCard label="광고 CPA" value={metaCurrent?.cpa} previous={metaPrevious?.cpa} format="money" source="Meta" hint="광고비 ÷ Meta 기여 구매수" inverse />
      <MetricCard label="광고 ROAS" value={metaCurrent?.roas} previous={metaPrevious?.roas} format="percent" source="Meta" hint="Meta 기여 매출 ÷ 광고비 × 100" />
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="일별 추이">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-bold text-slate-900">일별 추이</h2><div className="flex gap-2">{[["revenue", "매출"], ["orders", "주문수"], ["visitors", "방문자"]].map(([key, label]) => <button key={key} type="button" aria-pressed={chartMetric === key} className={`${buttonClass} ${chartMetric === key ? "!bg-slate-100 !text-slate-950" : ""}`} onClick={() => setChartMetric(key)}>{label}</button>)}</div></div>
      {salesLoading ? <p role="status" className="py-24 text-center text-sm text-slate-400">실적을 불러오는 중…</p> : !validSales || (chartMetric === "visitors" && ga?.status !== "ready") ? <p className="py-24 text-center text-sm text-slate-400">{chartMetric === "visitors" ? "GA4 연결 후 방문 추이가 표시됩니다." : "실적 데이터를 확인해주세요."}</p> : <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 288 }}><LineChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e6" /><XAxis dataKey="date" tickFormatter={(date) => date.slice(5).replace("-", "/")} fontSize={11} minTickGap={24} /><YAxis width={64} fontSize={11} tickFormatter={(value) => chartMetric === "revenue" && value >= 10000 ? `${Number((value / 10000).toFixed(1))}만` : value.toLocaleString("ko-KR")} />
          <Tooltip labelFormatter={(date) => date} formatter={(value, name) => [fmt(value, chartMetric === "revenue" ? "money" : "count"), name]} /><Legend />
          {chartMetric === "revenue" ? <><Line name="매출" dataKey="grossRevenue" stroke="#9d9da3" dot={daily.length <= 14} strokeWidth={2} isAnimationActive={false} /><Line name="순매출" dataKey="netRevenue" stroke="#080F47" dot={daily.length <= 14} strokeWidth={2.5} isAnimationActive={false} /></> : <Line name={chartMetric === "orders" ? "주문수" : "방문자"} dataKey={chartMetric} stroke="#080F47" strokeWidth={2.5} dot={daily.length <= 14} isAnimationActive={false} />}
        </LineChart></ResponsiveContainer>
      </div>}
      {current?.orders === 0 && !salesLoading && <p className="mt-2 text-center text-xs text-slate-500">선택한 기간에 결제 확인된 주문이 없습니다.</p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-bold text-slate-900">구매 흐름</h2><a className="text-xs font-semibold text-slate-600 underline" href="https://analytics.google.com/" target="_blank" rel="noreferrer">GA4에서 자세히 보기</a></div>
      <div className="grid gap-3 md:grid-cols-2"><FunnelPair title="상품조회 → 장바구니" funnel={gaCurrent?.cartFunnel} startLabel="상품조회" endLabel="조회 후 담기" loading={providersLoading} /><FunnelPair title="결제 시작 → 구매" funnel={gaCurrent?.checkoutFunnel} startLabel="결제 시작" endLabel="시작 후 구매 이벤트" loading={providersLoading} /></div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">각 흐름은 기간 내 순서대로 행동한 사용자 기준입니다. 바로구매도 결제 흐름에 포함합니다. GA4의 무통장 구매는 입금 전 주문 생성 시점이므로 실제 결제 실적과 다를 수 있습니다.</p>
      {ga?.funnelStatus === "error" && <p role="status" className="mt-2 text-xs text-amber-700">일부 GA4 퍼널 조회에 실패했습니다. 방문 지표는 정상 조회된 값입니다.</p>}
      {ga?.thresholded && <p className="mt-2 text-xs text-amber-700">GA4 기준점 또는 보고서 제한이 적용된 데이터입니다.</p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Meta 광고 성과">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Meta 광고 성과</h2>{meta?.account && <p className="mt-1 text-xs text-slate-500">{meta.account.name} · {meta.account.id}</p>}</div><a className="text-xs font-semibold text-slate-600 underline" href={meta?.account?.id ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(meta.account.id)}` : "https://adsmanager.facebook.com/"} target="_blank" rel="noreferrer">광고 관리자 열기</a></div>
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-4">{[["광고비", metaCurrent?.spend, "money"], ["Meta 기여 구매", metaCurrent?.purchases, "count"], ["Meta 기여 매출", metaCurrent?.revenue, "money"], ["클릭수", metaCurrent?.clicks, "count"]].map(([label, value, format]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-900 tabular-nums">{fmt(value, format)}</p></div>)}</div>
      <div className="my-4 flex flex-wrap items-center gap-2 text-xs"><button type="button" className={buttonClass} onClick={() => setDrill(emptyDrill)}>전체 캠페인</button>{drill.campaignName && <><span aria-hidden="true">/</span><button type="button" className={buttonClass} onClick={() => setDrill({ level: "adset", campaignId: drill.campaignId, campaignName: drill.campaignName })}>{drill.campaignName}</button></>}{drill.adsetName && <><span aria-hidden="true">/</span><span className="font-semibold text-slate-700">{drill.adsetName}</span></>}</div>
      {providersLoading ? <p className="py-8 text-center text-sm text-slate-400">광고 데이터를 불러오는 중…</p> : meta?.status !== "ready" ? <p className="py-8 text-center text-sm text-slate-500">{meta?.message || "광고 데이터를 확인해주세요."}</p> : meta.breakdownStatus === "error" ? <p className="py-8 text-center text-sm text-amber-700">광고 상세를 불러오지 못했습니다. 새로고침으로 다시 시도해주세요.</p> : !meta.breakdown.length ? <p className="py-8 text-center text-sm text-slate-500">해당 기간의 광고 성과가 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-sm"><thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-3 pr-4 text-left">{drill.level === "campaign" ? "캠페인" : drill.level === "adset" ? "광고세트" : "광고"}</th>{["광고비", "구매", "기여 매출", "CPA", "ROAS", "노출", "클릭", "CTR", "CPC"].map((name) => <th key={name} className="px-3 py-3">{name}</th>)}</tr></thead><tbody>{meta.breakdown.map((row) => <tr key={row.id} className="border-b border-slate-100 last:border-0"><td className="max-w-xs whitespace-normal py-3 pr-4 font-semibold">{drill.level === "ad" ? row.name : <button className="text-left text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900" type="button" onClick={() => setDrill(drill.level === "campaign" ? { level: "adset", campaignId: row.id, campaignName: row.name } : { ...drill, level: "ad", adsetId: row.id, adsetName: row.name })}>{row.name}</button>}</td>{[["spend", "money"], ["purchases", "count"], ["revenue", "money"], ["cpa", "money"], ["roas", "percent"], ["impressions", "count"], ["clicks", "count"], ["ctr", "percent"], ["cpc", "money"]].map(([key, format]) => <td className="px-3 py-3 text-right tabular-nums" key={key}>{fmt(row[key], format)}</td>)}</tr>)}</tbody></table></div>}
      <div className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-800">주문 DB에서 확인된 Meta 유입</h3><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><p>실구매 <strong className="ml-2 tabular-nums">{fmt(current?.attributedOrders ? current.metaOrders : null)}건</strong></p><p>순매출 <strong className="ml-2 tabular-nums">{fmt(current?.attributedOrders ? current.metaRevenue : null, "money")}</strong></p></div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">최종 유입의 유료 매체·Meta 출처가 확인된 주문만 집계합니다. 유입 보존은 2026-09-12부터 시작해 과거 주문은 확인되지 않습니다. {current ? `선택 기간 ${fmt(current.orders)}건 중 출처 기록 ${fmt(current.attributedOrders)}건.` : ""} 여러 Meta 계정의 유입이 포함될 수 있으며, 광고 플랫폼의 기여 기준과 달라 전체 광고 성과로 해석하지 않습니다.</p></div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">광고 수치는 Meta 기여 설정·전환 발생일 기준입니다. 비율은 기간 합계로 계산하며 최대 15분 캐시됩니다.{meta?.updatedAt ? ` 조회 ${new Date(meta.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : ""}</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-slate-900">일별 상세</h2><p className="mt-1 text-xs text-slate-500">날짜를 누르면 해당 날짜의 전체 지표를 조회합니다. 방문자·구매자와 비율의 기간 합계는 일별 값의 합이나 평균과 다를 수 있습니다.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full whitespace-nowrap text-sm"><thead><tr className="border-b border-slate-200 text-right text-xs text-slate-500"><th className="py-3 pr-4 text-left">날짜</th>{columns.map(([key, label]) => <th className="px-3 py-3" key={key}>{label}</th>)}</tr></thead><tbody>{visibleDays.map((row) => <tr key={row.date} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><th className="py-3 pr-4 text-left font-semibold"><button type="button" className="underline decoration-slate-300 underline-offset-4" onClick={() => selectRange({ from: row.date, to: row.date })}>{row.date}</button></th>{columns.map(([key, , format]) => <td key={key} className="px-3 py-3 text-right tabular-nums">{fmt(row[key], format)}</td>)}</tr>)}</tbody></table></div>
      {!daily.length && <p className="py-8 text-center text-sm text-slate-400">{salesLoading ? "실적을 불러오는 중…" : "표시할 실적 데이터가 없습니다."}</p>}
      {!showAllDays && daily.length > 31 && <button type="button" className={`${buttonClass} mt-4`} onClick={() => setShowAllDays(true)}>전체 {daily.length}일 보기</button>}
    </section>

    <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-slate-800">집계 기준과 데이터 상태</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed">
      <li>주문 실적은 한국시간 결제일 기준입니다. 할인·포인트 적용 후 실결제액에 배송비를 포함하며 미입금 주문은 제외합니다.</li>
      <li>순매출은 선택한 기간의 결제액에서 현재까지 누적 환불액을 뺀 금액입니다. 과거 결제분이 나중에 환불되면 과거 기간의 순매출도 변경됩니다.</li>
      <li>주문수·구매자수는 결제 이력 기준이라 환불 주문도 포함하고, 판매수량은 환불된 상품 수량을 제외합니다. AOV는 환불 전 매출 ÷ 결제 주문수입니다.</li>
      <li>구매자는 회원 계정별, 비회원 주문 연락처별로 중복 제거합니다. 회원·비회원으로 각각 구매한 동일인은 중복 집계될 수 있습니다.</li>
      <li>GA4는 처리 지연·차단·동의 설정에 따라 실제 방문과 다를 수 있습니다. 무통장 구매 이벤트는 입금 전 발생합니다. 결제 이탈률은 실제 입금 실패율이 아닙니다. GA4 퍼널은 사용자 기준이며 세션을 넘는 후속 행동도 포함할 수 있습니다.</li>
      <li>증감률은 직전 동일 길이 기간 대비입니다. 비율 지표는 %p 차이로 표시하며, 분모가 0이거나 연결되지 않은 지표는 —로 표시합니다. 오늘을 포함한 비교는 오늘 집계 중인 값과 이전 날짜의 하루 전체를 비교합니다.</li>
      {(validSales?.unverifiedPayments > 0 || current?.cancelledPaidOrders > 0) && <li className="text-amber-700">확인 필요: 결제 시각 없는 과거 기록 {fmt(validSales?.unverifiedPayments ?? 0)}건은 제외했습니다. 결제 기록이 있지만 취소 상태인 {fmt(current?.cancelledPaidOrders ?? 0)}건은 결제·환불 원장 기준으로 포함했습니다.</li>}
      <li>GA4·Meta 원문 인증정보와 고객 식별정보는 대시보드 응답에 포함하지 않습니다.</li>
    </ul></details>
  </AdminShell>;
}
