import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminDialog from "../AdminDialog";
import { InlineLoading } from "../Loading";
import { weeksLabel } from "../../lib/ilseongFormat";

// 「일성월심 앱」 화면들이 함께 쓰는 조각. 색·모서리·글자 크기는 수북 관리자의 다른 화면과 같은 값을 쓴다.

/** 화면 안 보기(?view=)의 주소. id를 주면 그 회원의 상세. */
export function ilseongPath(view, userId) {
  if (view === "users" && userId) return `/admin/ilseong?view=users&id=${userId}`;
  return view ? `/admin/ilseong?view=${view}` : "/admin/ilseong";
}

export function Section({ title, sub, right, children, className = "" }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      {title || right ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-base font-bold text-slate-950">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {sub ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{sub}</p> : null}
      <div className={title || right || sub ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

const BADGE_TONES = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-rose-50 text-rose-700",
  orange: "bg-amber-50 text-amber-700",
  grey: "bg-slate-100 text-slate-600",
};

export function Badge({ tone = "grey", children }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone] || BADGE_TONES.grey}`}>
      {children}
    </span>
  );
}

/** 과목 색 점. 색은 앱 서버가 정한 과목 색이다. */
export function SubjectDot({ color, size = 8 }) {
  return <span aria-hidden="true" className="mr-1.5 inline-block shrink-0 rounded-full align-middle" style={{ background: color, width: size, height: size }} />;
}

/** 코드·묶음이 여는 교재: 과목마다 "국어 1–8주차". */
export function BookList({ books }) {
  if (!books?.length) return <span className="text-slate-400">교재 없음</span>;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {books.map((book) => (
        <span className="whitespace-nowrap" key={book.code}>
          <SubjectDot color={book.color} />
          {book.name} {weeksLabel(book.weeks)}
        </span>
      ))}
    </span>
  );
}

export function ErrorNote({ error, onRetry, className = "" }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "문제가 생겼어요.";
  return (
    <div className={`notice-error flex flex-wrap items-center justify-between gap-2 ${className}`} role="alert">
      <span>{message}</span>
      {onRetry ? <button className="font-semibold underline" onClick={onRetry} type="button">다시 불러오기</button> : null}
    </div>
  );
}

export function WarnNote({ children, className = "" }) {
  return <div className={`rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800 ${className}`}>{children}</div>;
}

export function LoadingNote() {
  return <p className="py-10 text-center text-sm text-slate-400"><InlineLoading /></p>;
}

export function EmptyNote({ children }) {
  return <p className="py-10 text-center text-sm text-slate-500">{children}</p>;
}

/** 이름–값 줄. rows: [이름, 값][] (값이 null·undefined·false면 그 줄은 뺀다) */
export function Facts({ rows }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-sm">
      {rows.filter(([, value]) => value !== null && value !== undefined && value !== false).map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="whitespace-nowrap text-slate-500">{label}</dt>
          <dd className="min-w-0 break-words text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ label, ratio }) {
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <div className="space-y-1.5" role="status">
      <p className="text-sm text-slate-600">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** 쪽 이미지 미리 보기 줄. pages: { key, url, label, title }[] — 누르면 새 탭에서 크게 본다. */
export function PageThumbs({ pages }) {
  return (
    <div className="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
      {pages.map((page) => (
        <a
          className="group relative block overflow-hidden rounded-md border border-slate-200 bg-white"
          href={page.url}
          key={page.key}
          rel="noreferrer"
          target="_blank"
          title={page.title}
        >
          <img alt={page.alt || ""} className="block aspect-[182/257] w-full object-cover" loading="lazy" src={page.url} />
          <span className="absolute bottom-1 right-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{page.label}</span>
        </a>
      ))}
    </div>
  );
}

// 좁은 화면에서는 칸을 찌그러뜨리지 않고 표를 옆으로 민다(표를 감싼 overflow-x-auto).
// 표마다 가장 좁은 폭을 min-w-[…]로 덧붙인다. 여기에 min-w-*를 두면 그것과 겹쳐 어느 쪽이 이길지 알 수 없다.
export const TABLE_CLASS = "w-full text-left text-sm";
export const TH_CLASS = "whitespace-nowrap border-b border-slate-200 py-2.5 pr-4 text-xs font-semibold text-slate-500";
export const TD_CLASS = "border-b border-slate-100 py-3 pr-4 align-middle text-slate-800";
export const SMALL_BUTTON = "!px-3 !py-1.5 text-[13px]";
export const FIELD_CLASS =
  "w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-400";

export function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function CheckRow({ checked, onChange, disabled = false, children }) {
  return (
    <label className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-800">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0 accent-[#3182f6]"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{children}</span>
    </label>
  );
}

/** 회원 상세로 가는 링크. */
export function UserLink({ userId, children }) {
  return <Link className="font-semibold text-brand hover:underline" to={ilseongPath("users", userId)}>{children}</Link>;
}

// ── 확인 창·알림 ─────────────────────────────────────────────
// confirm({ title, message, confirm, danger }) → 눌렀으면 true. toast("…") → 아래쪽에 잠깐 뜬다.

const FeedbackContext = createContext(null);

export function IlseongFeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef(0);

  const confirm = useCallback((options) => new Promise((resolve) => setDialog({ ...options, resolve })), []);
  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const close = (ok) => {
    dialog?.resolve(ok);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm, toast: showToast }}>
      {children}
      <AdminDialog
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-secondary !px-4 !py-2" onClick={() => close(false)} type="button">취소</button>
            <button className={`${dialog?.danger ? "btn-danger" : "btn-primary !w-auto"} !px-4 !py-2`} onClick={() => close(true)} type="button">
              {dialog?.confirm}
            </button>
          </div>
        }
        onClose={() => close(false)}
        open={Boolean(dialog)}
        size="sm"
        title={dialog?.title}
      >
        {dialog?.message ? <p className="whitespace-pre-line px-6 py-5 text-sm leading-relaxed text-slate-700">{dialog.message}</p> : <div className="h-2" />}
      </AdminDialog>
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg" role="status">
          {toast}
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}

export function useIlseongFeedback() {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error("IlseongFeedbackProvider 안에서 써야 한다");
  return feedback;
}
