import { useCallback, useEffect, useState } from "react";
import AdminShell from "../components/AdminShell";
import DestructiveConfirmModal from "../components/DestructiveConfirmModal";
import { StarIcon } from "../components/icons";
import { InlineLoading } from "../components/Loading";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 통합 구매 후기 관리 (2026-09-02) — 후기는 주문 1건당 1개, subook.kr 모든 상품 상세에 공통 노출.
// 운영자는 숨김/해제만 한다 (수정·삭제는 작성자 본인 몫).

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "visible", label: "공개" },
  { key: "hidden", label: "숨김" },
];

const PAGE_SIZE = 50;

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${y}.${m}.${d} ${hh}:${mm}`;
}

function formatProductTitle(title, itemCount) {
  const base = title || "교재";
  const count = Number(itemCount) || 1;
  return count > 1 ? `${base} 외 ${count - 1}권` : base;
}

function Stars({ rating }) {
  return (
    <span aria-label={`별점 ${rating}점`} className="inline-flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          className={star <= rating ? "" : "text-slate-200"}
          filled
          key={star}
          size={14}
        />
      ))}
    </span>
  );
}

function AdminReviewsPage() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [hideTarget, setHideTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [page, setPage] = useState(0);

  const loadReviews = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage("Supabase 환경 변수가 필요합니다.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("admin_list_reviews", {
      p_filter: filter,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (error) {
      setErrorMessage(error.message || "후기를 불러오지 못했습니다.");
    } else {
      setRows(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
    }
    setIsLoading(false);
  }, [filter, page]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const setHidden = async (row, hidden, reason) => {
    setBusyId(row.id);
    const { error } = await supabase.rpc("admin_set_review_hidden", {
      p_review_id: row.id,
      p_hidden: hidden,
      p_reason: reason ?? null,
    });
    setBusyId(null);
    setHideTarget(null);
    if (error) {
      setErrorMessage(error.message || "처리에 실패했습니다.");
      return;
    }
    await loadReviews();
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell
      activeModule="reviews"
      description="구매확정 회원이 남긴 통합 후기 — subook.kr 모든 상품 상세에 공통으로 보입니다"
      title="후기 관리"
    >
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {FILTERS.map((item) => (
            <button
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                filter === item.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              key={item.key}
              onClick={() => {
                setFilter(item.key);
                setPage(0);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">전체 {total}건</p>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 px-4 py-3">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-400 py-8 text-center">
          <InlineLoading />
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-12 text-center">등록된 후기가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              className={`rounded-xl border bg-white p-4 flex items-start gap-4 ${
                row.is_hidden ? "border-amber-200 bg-amber-50/40" : "border-slate-200"
              }`}
              key={row.id}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Stars rating={row.rating} />
                  <span className="text-sm font-semibold text-slate-900">
                    {row.nickname || row.member_name || "(닉네임 없음)"}
                  </span>
                  {row.member_name && row.member_name !== row.nickname ? (
                    <span className="text-xs text-slate-500">{row.member_name}</span>
                  ) : null}
                  {row.member_email ? (
                    <span className="text-xs text-slate-400">{row.member_email}</span>
                  ) : null}
                  {row.is_hidden ? (
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      숨김
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  {row.order_number ? (
                    <a
                      className="text-blue-700 hover:underline"
                      href={`/admin/orders?q=${encodeURIComponent(row.order_number)}`}
                    >
                      {row.order_number}
                    </a>
                  ) : (
                    `주문 #${row.order_id}`
                  )}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {row.product_id ? (
                    <a
                      className="hover:underline"
                      href={`https://subook.kr/store/${row.product_id}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {formatProductTitle(row.product_title, row.item_count)}
                    </a>
                  ) : (
                    formatProductTitle(row.product_title, row.item_count)
                  )}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {formatDateTime(row.created_at)}
                  {row.updated_at && row.updated_at !== row.created_at ? (
                    <span className="ml-1 text-slate-400">(수정 {formatDateTime(row.updated_at)})</span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{row.content}</p>
                {Array.isArray(row.photo_urls) && row.photo_urls.length > 0 ? (
                  <div className="flex gap-2 mt-3">
                    {row.photo_urls.map((url) => (
                      <a
                        className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                        href={url}
                        key={url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <img alt="" className="w-full h-full object-cover" loading="lazy" src={url} />
                      </a>
                    ))}
                  </div>
                ) : null}
                {row.is_hidden ? (
                  <p className="mt-2 text-xs text-amber-700">
                    숨김 사유: {row.hidden_reason || "(없음)"} · {formatDateTime(row.hidden_at)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {row.is_hidden ? (
                  <button
                    className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 hover:bg-slate-50"
                    disabled={busyId === row.id}
                    onClick={() => {
                      void setHidden(row, false);
                    }}
                    type="button"
                  >
                    {busyId === row.id ? "처리 중..." : "숨김 해제"}
                  </button>
                ) : (
                  <button
                    className="px-3 py-1.5 rounded-lg text-sm border border-rose-200 text-rose-700 hover:bg-rose-50"
                    disabled={busyId === row.id}
                    onClick={() => setHideTarget(row)}
                    type="button"
                  >
                    숨기기
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm">
          <button
            className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
            disabled={page === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            type="button"
          >
            이전
          </button>
          <span className="text-slate-500">
            {page + 1} / {pageCount}
          </span>
          <button
            className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            다음
          </button>
        </div>
      ) : null}

      <DestructiveConfirmModal
        busy={Boolean(busyId)}
        confirmLabel="숨기기"
        description="숨긴 후기는 사이트에서 즉시 사라집니다. 작성자에게는 별도 안내가 가지 않으며, 언제든 다시 해제할 수 있습니다."
        onCancel={() => setHideTarget(null)}
        onConfirm={(reason) => {
          if (hideTarget) {
            void setHidden(hideTarget, true, reason);
          }
        }}
        open={Boolean(hideTarget)}
        reasonMinLength={2}
        reasonPlaceholder="예: 욕설·비방, 개인정보 노출, 광고"
        reasonRequired
        title="후기를 숨길까요?"
      />
    </AdminShell>
  );
}

export default AdminReviewsPage;
