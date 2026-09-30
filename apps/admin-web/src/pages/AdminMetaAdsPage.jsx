import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import MetaAdEditor from "../components/MetaAdEditor";
import MetaMutationReview from "../components/MetaMutationReview";
import { metaAdsRequest } from "@shared-supabase/adminMetaAdsClient";
import {
  metaKinds,
  metaStatusLabels,
  metaActionLabels,
  metaOperationLabels,
  metaFieldLabels,
  reviewValue,
  metaBudget,
  won,
  metaTargetLabel,
} from "@shared-domain/metaAds";
import { performanceRange } from "@shared-domain/performanceMetrics";

const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const tabs = {
  ...metaKinds,
  media: "이미지·영상",
  drafts: "수북 초안",
  history: "변경 이력",
};
const count = (v) => (v == null ? "—" : Number(v).toLocaleString("ko-KR"));
const date = (v) =>
  v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";

function HistoryCard({ row }) {
  const state =
    row.state === "prepared" && Date.parse(row.expires_at) < Date.now()
      ? "expired"
      : row.state;
  const resultId =
    row.result?.id ||
    row.result?.copied_campaign_id ||
    row.result?.copied_adset_id ||
    row.result?.copied_ad_id;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">
          {row.review?.name} · {metaActionLabels[row.action]}
        </h3>
        <span
          className={`text-sm ${["unknown", "failed", "executing"].includes(state) ? "text-amber-800" : "text-slate-500"}`}
        >
          {metaOperationLabels[state]}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {date(row.created_at)} · {row.actor_name || "관리자"}
      </p>
      {row.result?.error && (
        <p className="mt-2 text-sm text-amber-800">{row.result.error}</p>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">변경 내용·결과 보기</summary>
        <dl className="mt-3 space-y-2">
          {Object.entries(row.review?.after || {}).map(([key, value]) => (
            <div className="grid gap-1 sm:grid-cols-[140px_1fr]" key={key}>
              <dt className="font-semibold text-slate-500">
                {metaFieldLabels[key] || key}
              </dt>
              <dd className="whitespace-pre-wrap break-words">
                {row.review.before && key in row.review.before && (
                  <p className="mb-1 text-xs text-slate-500">
                    이전: {reviewValue(key, row.review.before[key])}
                  </p>
                )}
                {reviewValue(key, value)}
              </dd>
            </div>
          ))}
        </dl>
        {resultId && <p className="mt-3 text-xs">생성된 항목 ID: {resultId}</p>}
        <p className="mt-3 break-all text-xs text-slate-400">
          관리자 식별번호 {row.actor_id} · 작업 식별번호 {row.id}
        </p>
      </details>
    </article>
  );
}

function MediaLibrary({ canManage, onPrepare, refresh }) {
  const [kind, setKind] = useState("images");
  const [rows, setRows] = useState([]);
  const [after, setAfter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setAfter(null);
    setBusy(true);
    setError("");
    metaAdsRequest({ view: "assets", kind }, null, controller.signal)
      .then((data) => {
        setRows(data.rows);
        setAfter(data.after);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [kind, refresh]);
  const more = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await metaAdsRequest({ view: "assets", kind, after });
      setRows((prior) => [...prior, ...data.rows]);
      setAfter(data.after);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 3_000_000
      )
        throw new Error("PNG·JPEG 이미지를 3MB 이하로 선택해 주세요.");
      const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
        reader.readAsDataURL(file);
      });
      await onPrepare({
        action: "image",
        kind: "creative",
        values: { bytes, name: file.name },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const video = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onPrepare({
        action: "video",
        kind: "creative",
        values: { name, url },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          aria-pressed={kind === "images"}
          onClick={() => setKind("images")}
        >
          이미지
        </button>
        <button
          className={button}
          aria-pressed={kind === "videos"}
          onClick={() => setKind("videos")}
        >
          동영상
        </button>
      </div>
      {kind === "images" ? (
        <label className="block rounded-xl border border-dashed border-slate-300 p-5 text-sm font-semibold">
          이미지 업로드 · PNG/JPEG, 3MB 이하
          <input
            aria-label="광고 이미지 파일"
            className="mt-3 block max-w-full text-sm"
            type="file"
            accept="image/png,image/jpeg"
            disabled={!canManage || busy}
            onChange={upload}
          />
        </label>
      ) : (
        <form
          onSubmit={video}
          className="flex flex-wrap gap-2 rounded-xl border border-slate-200 p-4"
        >
          <label className="flex-1 text-sm">
            영상 이름
            <input
              className={`${input} mt-1 w-full`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="min-w-60 flex-[2] text-sm">
            공개 MP4 주소
            <input
              className={`${input} mt-1 w-full`}
              type="url"
              placeholder="https://…/video.mp4"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>
          <button
            className={`${button} self-end`}
            disabled={!canManage || busy}
          >
            영상 등록 검토
          </button>
          <p className="w-full text-xs text-slate-500">
            기존 Meta 영상 선택과 공개 MP4 주소 등록을 지원합니다. 영상 처리가
            끝난 뒤 소재에 사용할 수 있습니다.
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {rows.map((row) => (
          <article
            key={row.hash || row.id}
            className="min-w-0 rounded-xl border border-slate-200 p-3"
          >
            <img
              className="h-36 w-full rounded-lg bg-slate-50 object-contain"
              src={row.url || row.thumbnails?.data?.[0]?.uri}
              alt={row.name || row.title || "광고 미디어"}
              referrerPolicy="no-referrer"
            />
            <p className="mt-2 break-words text-sm font-semibold">
              {row.name || row.title || row.id}
            </p>
            <p className="mt-1 break-all text-xs text-slate-500">
              {row.hash || row.id}
            </p>
            {row.status?.video_status && (
              <p className="text-xs">처리 상태: {row.status.video_status}</p>
            )}
          </article>
        ))}
      </div>
      {busy && <p role="status">불러오는 중…</p>}
      {!busy && !rows.length && !error && (
        <p className="py-6 text-sm text-slate-500">등록한 미디어가 없습니다.</p>
      )}
      {after && (
        <button className={button} disabled={busy} onClick={more}>
          더 불러오기
        </button>
      )}
    </section>
  );
}

export default function AdminMetaAdsPage() {
  const [kind, setKind] = useState("campaign");
  const [parent, setParent] = useState(null);
  const [connection, setConnection] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState([]);
  const [after, setAfter] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [plans, setPlans] = useState(null);
  const [preview, setPreview] = useState(null);
  const [range, setRange] = useState(() => performanceRange());
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState("");
  const isEntity = Boolean(metaKinds[kind]);
  const canManage = connection?.canManage === true;
  const query = useMemo(
    () =>
      isEntity
        ? {
            view: "list",
            kind,
            ...(parent ? { parentId: parent.id } : {}),
            ...(status && kind !== "creative" ? { status } : {}),
          }
        : { view: kind },
    [isEntity, kind, parent, status],
  );
  const reload = () => setRefresh((v) => v + 1);
  useEffect(() => {
    const controller = new AbortController();
    setConnectionError("");
    metaAdsRequest({ view: "connection" }, null, controller.signal)
      .then(setConnection)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setConnection(null);
          setConnectionError(e.message);
        }
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setAfter(null);
    setSelected([]);
    setError("");
    if (kind === "media") return () => controller.abort();
    setLoading(true);
    metaAdsRequest(query, null, controller.signal)
      .then((data) => {
        setRows(data.rows);
        setAfter(data.after);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, refresh, kind]);
  useEffect(() => {
    const controller = new AbortController();
    setMetrics(null);
    setMetricsError("");
    if (!["campaign", "adset", "ad"].includes(kind))
      return () => controller.abort();
    metaAdsRequest(
      {
        view: "insights",
        from: range.from,
        to: range.to,
        level: kind,
        ...(parent
          ? { [kind === "adset" ? "campaignId" : "adsetId"]: parent.id }
          : {}),
      },
      null,
      controller.signal,
    )
      .then(setMetrics)
      .catch((e) => {
        if (!controller.signal.aborted) setMetricsError(e.message);
      });
    return () => controller.abort();
  }, [kind, parent, range, refresh]);
  const visible = rows.filter((row) =>
    `${row.name || row.title || row.review?.name || ""} ${row.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const metricMap = new Map(
    (metrics?.breakdown || []).map((row) => [row.id, row]),
  );
  const switchTab = (value, nextParent = null) => {
    setKind(value);
    setParent(nextParent);
    setStatus("");
    setSearch("");
    setSelected([]);
  };
  const run = async (work) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const prepare = async (operation) => {
    const plan = await metaAdsRequest({}, { action: "prepare", operation });
    setPlans([plan]);
  };
  const reviewStatus = (items, nextStatus) =>
    run(async () => {
      if (items.length > 20)
        throw new Error("한 번에 20개까지 검토할 수 있습니다.");
      const next = [];
      for (const row of items) {
        const current = await metaAdsRequest({
          view: "detail",
          kind,
          id: row.id,
        });
        next.push(
          await metaAdsRequest(
            {},
            {
              action: "prepare",
              operation: {
                action: "status",
                kind,
                id: row.id,
                version: current.version,
                values: { status: nextStatus },
              },
            },
          ),
        );
      }
      if (next.length) setPlans(next);
    });
  const edit = (row) =>
    run(async () => {
      const entity = await metaAdsRequest({ view: "detail", kind, id: row.id });
      setEditor({ kind, entity });
    });
  const copy = (row) =>
    run(async () => {
      const current = await metaAdsRequest({
        view: "detail",
        kind,
        id: row.id,
      });
      await prepare({
        action: "copy",
        kind,
        id: row.id,
        version: current.version,
        values: { suffix: " - 복사본", deepCopy: true },
      });
    });
  const more = () =>
    run(async () => {
      const data = await metaAdsRequest({ ...query, after });
      setRows((prior) => [
        ...new Map(
          [...prior, ...data.rows].map((row) => [row.id, row]),
        ).values(),
      ]);
      setAfter(data.after);
    });
  const showPreview = (row, format = "MOBILE_FEED_STANDARD") =>
    run(async () => {
      const data = await metaAdsRequest({
        view: "preview",
        id: row.id,
        format,
      });
      setPreview({ ...data, row, format });
    });
  return (
    <AdminShell activeModule="meta-ads" title="메타 광고 운영">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              {connection?.account?.name || "Meta 광고 계정"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {connection?.account?.account_id || ""} · 원화 · 한국시간
              {connection &&
                ` · ${canManage ? "조회·관리 연결됨" : "조회 전용"}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link className={button} to="/admin/performance">
              매출·GA 함께 보기
            </Link>
            <button
              className={button}
              disabled={busy || loading}
              onClick={reload}
            >
              새로고침
            </button>
          </div>
        </div>
        {connectionError && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
          >
            {connectionError}
          </p>
        )}
        {connection && !canManage && (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            현재 연결은 조회 전용입니다. 광고 관리 연결이 완료되면
            만들기·수정·켜기·끄기를 사용할 수 있습니다. 수북 초안은 먼저 작성할
            수 있습니다.
          </p>
        )}
        {connection?.account?.account_status &&
          connection.account.account_status !== 1 && (
            <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">
              광고 계정 상태를 확인해야 합니다. Meta 계정 상태 코드:{" "}
              {connection.account.account_status}
            </p>
          )}
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            처음 광고를 만들 때
          </summary>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-slate-600">
            <li>캠페인에서 목표와 예산 방식을 정합니다.</li>
            <li>
              캠페인 이름을 눌러 광고세트를 만들고 대상·기간·예산을 정합니다.
            </li>
            <li>
              이미지·영상 탭에 파일을 등록하고, 소재 탭에서 문구와 도착 주소를
              작성합니다.
            </li>
            <li>광고세트 안에 광고를 만들고 소재를 선택합니다.</li>
            <li>
              광고 미리보기와 예산을 검토한 뒤 캠페인·광고세트·광고를 각각
              켭니다. 상위 항목이 꺼져 있으면 광고는 게재되지 않습니다.
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            새 광고와 복사본은 꺼진 상태로 저장됩니다. 새 광고세트는 웹사이트
            판매·방문 목표, 18세 이상 대상 설정을 지원합니다. 특별 광고
            카테고리·카탈로그 캠페인의 상세 설정은 현재 지원 범위에 포함되지
            않습니다.
          </p>
        </details>
        <nav aria-label="광고 업무" className="flex flex-wrap gap-2">
          {Object.entries(tabs).map(([key, label]) => (
            <button
              key={key}
              className={`${button} ${kind === key ? "!border-slate-950 !bg-slate-950 !text-white" : ""}`}
              aria-current={kind === key ? "page" : undefined}
              onClick={() => switchTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        {parent && (
          <div className="flex items-center gap-3 text-sm">
            <button className={button} onClick={() => switchTab(kind)}>
              전체 {metaKinds[kind]}
            </button>
            <span>
              {metaKinds[kind === "adset" ? "campaign" : "adset"]}:{" "}
              <strong>{parent.name}</strong>
            </span>
          </div>
        )}
        {["campaign", "adset", "ad"].includes(kind) && (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                성과 시작일
                <input
                  className={`${input} mt-1 block`}
                  type="date"
                  value={range.from}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, from: e.target.value }))
                  }
                />
              </label>
              <label className="text-xs">
                성과 종료일
                <input
                  className={`${input} mt-1 block`}
                  type="date"
                  value={range.to}
                  onChange={(e) =>
                    setRange((r) => ({ ...r, to: e.target.value }))
                  }
                />
              </label>
              <p className="pb-2 text-xs text-slate-500">
                Meta 귀속 기준 · 최대 15분 캐시 · 상단 합계는 계정 전체
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                ["광고비", won(metrics?.current?.spend)],
                ["노출", count(metrics?.current?.impressions)],
                ["클릭", count(metrics?.current?.clicks)],
                ["구매", count(metrics?.current?.purchases)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-bold">{value}</p>
                </div>
              ))}
            </div>
            {metricsError && (
              <p className="text-xs text-amber-800">
                성과 조회: {metricsError}
              </p>
            )}
            {metrics?.breakdownStatus === "error" && (
              <p className="text-xs text-amber-800">
                광고별 성과를 불러오지 못했습니다. 계정 합계만 표시합니다.
              </p>
            )}
          </section>
        )}
        {kind !== "media" && (
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="불러온 항목 검색"
              className={`${input} min-w-48 flex-1`}
              placeholder="불러온 목록에서 이름·ID 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isEntity && kind !== "creative" && (
              <select
                aria-label="광고 상태"
                className={input}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">모든 상태</option>
                {[
                  "ACTIVE",
                  "PAUSED",
                  "CAMPAIGN_PAUSED",
                  "ADSET_PAUSED",
                  "PENDING_REVIEW",
                  "DISAPPROVED",
                  "ARCHIVED",
                ].map((value) => (
                  <option key={value} value={value}>
                    {metaStatusLabels[value]}
                  </option>
                ))}
              </select>
            )}
            {isEntity && (
              <button
                className={`${button} !bg-slate-950 !text-white`}
                disabled={busy}
                onClick={() => setEditor({ kind, parent })}
              >
                + {metaKinds[kind]} 만들기
              </button>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm text-slate-500">
            요청을 확인하고 있습니다…
          </p>
        )}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-3 text-sm">
            <strong>{selected.length}개 선택</strong>
            {[
              ["ACTIVE", "선택 켜기"],
              ["PAUSED", "선택 끄기"],
            ].map(([value, label]) => (
              <button
                className={button}
                key={value}
                disabled={!canManage || busy}
                onClick={() =>
                  reviewStatus(
                    rows.filter((row) => selected.includes(row.id)),
                    value,
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {isEntity && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3">선택</th>
                  <th className="p-3">이름</th>
                  <th className="p-3">상태·설정</th>
                  {kind !== "creative" && (
                    <>
                      <th className="p-3">광고비 / 구매</th>
                      <th className="p-3">예산</th>
                    </>
                  )}
                  <th className="p-3">작업</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const metric = metricMap.get(row.id);
                  const inactive = ["ARCHIVED", "DELETED"].includes(row.status);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="p-3">
                        {kind !== "creative" && !inactive && (
                          <input
                            type="checkbox"
                            aria-label={`${row.name} 선택`}
                            checked={selected.includes(row.id)}
                            onChange={(e) =>
                              setSelected((prior) =>
                                e.target.checked
                                  ? [...prior, row.id]
                                  : prior.filter((id) => id !== row.id),
                              )
                            }
                          />
                        )}
                      </td>
                      <td className="max-w-60 p-3">
                        <button
                          className="text-left font-semibold text-slate-900 hover:underline"
                          onClick={() =>
                            ["campaign", "adset"].includes(kind)
                              ? switchTab(
                                  kind === "campaign" ? "adset" : "ad",
                                  row,
                                )
                              : edit(row)
                          }
                        >
                          {row.name || row.id}
                        </button>
                        <p className="mt-1 break-all text-xs text-slate-400">
                          {row.id}
                        </p>
                        {row.thumbnail_url && (
                          <img
                            className="mt-2 h-16 w-20 rounded object-contain"
                            src={row.thumbnail_url}
                            alt="소재 썸네일"
                          />
                        )}
                      </td>
                      <td className="max-w-64 p-3">
                        <p>
                          {metaStatusLabels[
                            row.effective_status || row.status
                          ] ||
                            row.status ||
                            "소재"}
                        </p>
                        {row.status && row.effective_status !== row.status && (
                          <p className="mt-1 text-xs text-slate-500">
                            직접 설정:{" "}
                            {metaStatusLabels[row.status] || row.status}
                          </p>
                        )}
                        {row.targeting && (
                          <p className="mt-2 text-xs text-slate-500">
                            {metaTargetLabel(row.targeting)}
                          </p>
                        )}
                        {row.issues_info?.map((issue, index) => (
                          <p className="mt-1 text-xs text-red-700" key={index}>
                            {issue.error_summary ||
                              issue.error_message ||
                              "Meta 심사·설정 확인 필요"}
                          </p>
                        ))}
                      </td>
                      {kind !== "creative" && (
                        <>
                          <td className="whitespace-nowrap p-3">
                            {won(metric?.spend)}
                            <p className="mt-1 text-xs text-slate-500">
                              구매 {count(metric?.purchases)}건
                            </p>
                          </td>
                          <td className="whitespace-nowrap p-3 text-xs">
                            {metaBudget(row)}
                          </td>
                        </>
                      )}
                      <td className="p-3">
                        <div className="flex max-w-64 flex-wrap gap-1">
                          <button
                            className={button}
                            disabled={busy || inactive}
                            onClick={() => edit(row)}
                          >
                            수정
                          </button>
                          {kind !== "creative" && (
                            <>
                              <button
                                className={button}
                                disabled={!canManage || busy || inactive}
                                onClick={() =>
                                  reviewStatus(
                                    [row],
                                    row.status === "ACTIVE"
                                      ? "PAUSED"
                                      : "ACTIVE",
                                  )
                                }
                              >
                                {row.status === "ACTIVE" ? "끄기" : "켜기"}
                              </button>
                              <button
                                className={button}
                                disabled={!canManage || busy}
                                onClick={() => copy(row)}
                              >
                                복사
                              </button>
                              <button
                                className={button}
                                disabled={!canManage || busy || inactive}
                                onClick={() => reviewStatus([row], "ARCHIVED")}
                              >
                                보관
                              </button>
                            </>
                          )}
                          {kind === "ad" && (
                            <button
                              className={button}
                              disabled={busy}
                              onClick={() => showPreview(row)}
                            >
                              미리보기
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && !visible.length && (
              <p className="p-8 text-center text-sm text-slate-500">
                {error
                  ? "조회에 실패했습니다. 새로고침해 주세요."
                  : "표시할 항목이 없습니다."}
              </p>
            )}
          </div>
        )}
        {kind === "drafts" && (
          <div className="space-y-2">
            {visible.map((row) => (
              <article
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <h3 className="font-semibold">{row.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {metaKinds[row.kind]} · 수정 {date(row.updated_at)} · Meta
                    미반영
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className={button}
                    onClick={() => setEditor({ kind: row.kind, draft: row })}
                  >
                    이어서 작성
                  </button>
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await metaAdsRequest(
                          {},
                          {
                            action: "archiveDraft",
                            id: row.id,
                            version: row.version,
                          },
                        );
                        reload();
                      })
                    }
                  >
                    초안 보관
                  </button>
                </div>
              </article>
            ))}
            {!loading && !rows.length && (
              <p className="py-8 text-center text-sm text-slate-500">
                만들기 화면에서 수북 초안을 저장하면 여기에 표시됩니다.
              </p>
            )}
          </div>
        )}
        {kind === "history" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              최근 100건. 처리 중이거나 결과 확인이 필요한 작업은 중복 실행하지
              말고 광고 목록을 새로 조회해 주세요.
            </p>
            {visible.map((row) => (
              <HistoryCard key={row.id} row={row} />
            ))}
            {!loading && !rows.length && (
              <p className="py-8 text-center text-sm text-slate-500">
                기록된 작업이 없습니다.
              </p>
            )}
          </div>
        )}
        {kind === "media" && (
          <MediaLibrary
            canManage={canManage}
            onPrepare={prepare}
            refresh={refresh}
          />
        )}
        {loading && kind !== "media" && (
          <p role="status" className="py-6 text-center text-sm">
            불러오는 중…
          </p>
        )}
        {after && kind !== "media" && (
          <button className={button} disabled={busy || loading} onClick={more}>
            더 불러오기
          </button>
        )}
        <p className="text-xs text-slate-500">
          광고 계정 인증·결제수단·정책 이의신청은 Meta의 전용 절차가 필요합니다.{" "}
          <Link className="underline" to="/admin/integrations">
            연동 업무 안내
          </Link>
        </p>
      </div>
      {editor && (
        <MetaAdEditor
          {...editor}
          suspended={Boolean(plans)}
          canManage={canManage}
          onClose={() => setEditor(null)}
          onPrepare={prepare}
          onDraftSaved={() => {
            if (kind === "drafts") reload();
          }}
        />
      )}
      {plans && (
        <MetaMutationReview
          plans={plans}
          onClose={() => setPlans(null)}
          onComplete={() => {
            setEditor(null);
            setSelected([]);
            reload();
          }}
        />
      )}
      {preview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="광고 미리보기"
            className="w-full max-w-2xl rounded-2xl bg-white p-4"
          >
            <div className="mb-3 flex flex-wrap justify-between gap-2">
              <select
                aria-label="미리보기 위치"
                className={input}
                value={preview.format}
                disabled={busy}
                onChange={(e) => showPreview(preview.row, e.target.value)}
              >
                {[
                  ["MOBILE_FEED_STANDARD", "Facebook 모바일"],
                  ["DESKTOP_FEED_STANDARD", "Facebook 데스크톱"],
                  ["INSTAGRAM_STANDARD", "Instagram 피드"],
                  ["INSTAGRAM_STORY", "Instagram 스토리"],
                  ["INSTAGRAM_REELS", "Instagram 릴스"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button className={button} onClick={() => setPreview(null)}>
                닫기
              </button>
            </div>
            <iframe
              title="Meta 광고 미리보기"
              className="h-[65vh] w-full border-0"
              src={preview.url}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
            />
          </section>
        </div>
      )}
    </AdminShell>
  );
}
