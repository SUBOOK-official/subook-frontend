import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";

// 회원 상세 — 포인트 잔액·내역 + 수동 조정 (2026-09-02 포인트 제도)
// 양수 = 적립(12개월 유효), 음수 = 차감. 사유 필수(원장에 그대로 남는다).

const KIND_LABELS = {
  review_earn: "후기 적립",
  order_use: "주문 사용",
  order_restore: "취소·환불 복구",
  reclaim: "적립 회수",
  admin_adjust: "운영 조정",
};

function formatPoints(value) {
  return `${(Number(value) || 0).toLocaleString("ko-KR")}P`;
}

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

function MemberPointsPanel({ userId }) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setBalance(0);
      setTransactions([]);
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("admin_get_member_points", {
      p_user_id: userId,
      p_limit: 50,
    });
    if (error) {
      setErrorMessage(error.message || "포인트를 불러오지 못했습니다.");
    } else {
      setBalance(Number(data?.balance) || 0);
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdjust = async () => {
    const value = Number(String(amount).replace(/[^0-9-]/g, ""));
    if (!value) {
      setErrorMessage("0이 아닌 금액을 입력하세요. (차감은 음수)");
      return;
    }
    if (!note.trim()) {
      setErrorMessage("조정 사유를 입력하세요.");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    const { error } = await supabase.rpc("admin_adjust_points", {
      p_user_id: userId,
      p_amount: value,
      p_note: note.trim(),
    });
    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message || "조정에 실패했습니다.");
      return;
    }
    setAmount("");
    setNote("");
    await load();
  };

  if (!userId) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-semibold text-slate-600">보유 포인트</span>
        <span className="text-lg font-black text-slate-900">{isLoading ? "…" : formatPoints(balance)}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="w-32">
          <span className="text-xs font-bold text-slate-500">조정 금액</span>
          <input
            className="input-base"
            inputMode="numeric"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="예: 1000 / -500"
            type="text"
            value={amount}
          />
        </label>
        <label className="min-w-[200px] flex-1">
          <span className="text-xs font-bold text-slate-500">사유 (회원에게 보임)</span>
          <input
            className="input-base"
            onChange={(event) => setNote(event.target.value)}
            placeholder="예: 배송 지연 보상"
            type="text"
            value={note}
          />
        </label>
        <button
          className="btn-secondary !w-auto !px-4 !py-3 text-sm"
          disabled={isSaving}
          onClick={() => {
            void handleAdjust();
          }}
          type="button"
        >
          {isSaving ? "처리 중..." : "조정"}
        </button>
      </div>

      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 px-3 py-2">{errorMessage}</p>
      ) : null}

      {transactions.length === 0 ? (
        <p className="text-sm text-slate-400">포인트 내역이 없습니다.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {transactions.map((row) => (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm" key={row.id}>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">
                  {KIND_LABELS[row.kind] ?? row.kind}
                  {row.note ? <span className="ml-1 font-normal text-slate-500">· {row.note}</span> : null}
                </p>
                <p className="text-xs text-slate-400">
                  {formatDateTime(row.created_at)}
                  {row.order_number ? ` · ${row.order_number}` : ""}
                  {Number(row.amount) > 0 && row.expires_at ? ` · ${formatDateTime(row.expires_at).slice(0, 10)} 소멸` : ""}
                </p>
              </div>
              <span className={`shrink-0 font-black ${Number(row.amount) < 0 ? "text-slate-500" : "text-blue-700"}`}>
                {Number(row.amount) > 0 ? "+" : ""}
                {formatPoints(row.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MemberPointsPanel;
