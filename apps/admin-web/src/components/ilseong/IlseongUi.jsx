import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AdminDialog from "../AdminDialog";
import { CheckIcon } from "../icons";
import { InlineLoading } from "../Loading";
import { booksLabel } from "../../lib/ilseongFormat";
import { ilseongPath } from "../../lib/ilseongPaths";

// 「일성월심 앱」 화면들이 함께 쓰는 조각. 색·모서리·글자 크기는 수북 관리자의 다른 화면과 같은 값을 쓴다.

export { ilseongPath };

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

/** 등록·상품이 여는 교재: 과목마다 "국어 1–8주차". 학습지가 둘 이상 섞여 있으면 학습지 이름을 앞에 붙인다. */
export function BookList({ books }) {
  if (!books?.length) return <span className="text-slate-400">교재 없음</span>;
  const mixed = new Set(books.map((book) => book.seriesName ?? "")).size > 1;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {books.map((book) => (
        <span className="whitespace-nowrap" key={book.code}>
          <SubjectDot color={book.color} />
          {mixed && book.seriesName ? <span className="text-slate-400">{book.seriesName} · </span> : null}
          {book.name} {booksLabel(book)}
        </span>
      ))}
    </span>
  );
}

// ── 단계 ─────────────────────────────────────────────────────
// 학습지 하나를 내는 일은 네 단계를 차례로 밟는다. 지금 할 단계는 펼쳐 두고, 끝난 단계는 한 줄 요약만 보이다가
// [열기]로 펼친다. 앞 단계를 마쳐야 할 수 있는 단계는 잠가 두고 까닭을 적는다.

const STEP_MARK = {
  done: "bg-emerald-50 text-emerald-600",
  current: "bg-brand text-white",
  todo: "bg-slate-100 text-slate-500",
  locked: "bg-slate-100 text-slate-400",
};

/**
 * @param state   "done" | "current" | "todo" | "locked"
 * @param summary 접혀 있을 때도 보이는 한 줄(지금 상태)
 * @param badge   제목 옆에 붙이는 표시(다음 단계로 넘어갔지만 아직 남은 것이 있을 때)
 * @param open    펼쳐져 있는지. onToggle이 없으면 늘 펼쳐 둔다
 */
export function Step({ no, title, state, summary, badge = null, open, onToggle, children }) {
  const locked = state === "locked";
  const shown = !locked && (open || !onToggle);
  return (
    <section
      aria-current={state === "current" ? "step" : undefined}
      className={`min-w-0 rounded-2xl border bg-white ${state === "current" ? "border-brand" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${STEP_MARK[state] ?? STEP_MARK.todo}`}>
          {state === "done" ? <CheckIcon size={15} strokeWidth={2.4} /> : no}
        </span>
        <div className="min-w-0 flex-1 basis-[14rem]">
          <h3 className={`text-base font-bold ${locked ? "text-slate-400" : "text-slate-950"}`}>
            {title}
            {state === "done" ? <span className="sr-only"> (끝남)</span> : null}
          </h3>
          {summary ? <p className={`mt-0.5 text-sm leading-relaxed ${locked ? "text-slate-400" : "text-slate-500"}`}>{summary}</p> : null}
        </div>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {badge}
          {state === "current" ? <Badge tone="blue">지금 할 일</Badge> : null}
          {onToggle && !locked ? (
            <button aria-expanded={shown} className={`btn-secondary ${SMALL_BUTTON}`} onClick={onToggle} type="button">
              {shown ? "접기" : state === "done" ? "보기·고치기" : "열기"}
            </button>
          ) : null}
        </span>
      </div>
      {shown ? <div className="border-t border-slate-100 px-5 py-5">{children}</div> : null}
    </section>
  );
}

/** 평소에는 접어 두는 칸(잘 쓰지 않는 설정). */
export function Disclosure({ title, sub, children, defaultOpen = false }) {
  return (
    <details className="group min-w-0 rounded-2xl border border-slate-200 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-base font-bold text-slate-950">{title}</span>
          {sub ? <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{sub}</span> : null}
        </span>
        <span className={`btn-secondary ${SMALL_BUTTON}`}>
          <span className="group-open:hidden">열기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="border-t border-slate-100 px-5 py-5">{children}</div>
    </details>
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

/** 목록 한 칸을 위·아래로 옮기는 작은 버튼 한 쌍. onMove(-1 | 1). */
export function MoveButtons({ label, canUp, canDown, disabled = false, onMove }) {
  const className =
    "flex h-6 w-6 items-center justify-center rounded-md text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30";
  return (
    <span className="inline-flex shrink-0 items-center">
      <button aria-label={`${label} 위로`} className={className} disabled={disabled || !canUp} onClick={(event) => { event.stopPropagation(); onMove(-1); }} type="button">▲</button>
      <button aria-label={`${label} 아래로`} className={className} disabled={disabled || !canDown} onClick={(event) => { event.stopPropagation(); onMove(1); }} type="button">▼</button>
    </span>
  );
}

/**
 * 여러 상품 가운데 하나를 고르는 창(직접 등록·미리 등록·취소에서 쓴다).
 * products: { code, name, note?, disabled? }[] — 고르면 onPick(code).
 */
export function ProductPickerDialog({ open, title, message, products, confirmLabel = "등록", danger = false, onPick, onClose }) {
  const selectable = (products ?? []).filter((product) => !product.disabled);
  const [picked, setPicked] = useState(null);
  const current = selectable.some((product) => product.code === picked) ? picked : selectable[0]?.code ?? null;
  return (
    <AdminDialog
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2" onClick={onClose} type="button">닫기</button>
          <button className={`${danger ? "btn-danger" : "btn-primary !w-auto"} !px-4 !py-2`} disabled={!current} onClick={() => onPick(current)} type="button">
            {confirmLabel}
          </button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="sm"
      title={title}
    >
      <div className="space-y-3 px-6 py-5">
        {message ? <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{message}</p> : null}
        <div className="space-y-2">
          {(products ?? []).map((product) => (
            <label
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${product.disabled ? "border-slate-100 text-slate-400" : current === product.code ? "border-brand bg-blue-50/40 text-slate-900" : "border-slate-200 text-slate-800"}`}
              key={product.code}
            >
              <input
                checked={current === product.code}
                className="mt-1 h-4 w-4 shrink-0 accent-[#3182f6]"
                disabled={product.disabled}
                name="ilseong-product"
                onChange={() => setPicked(product.code)}
                type="radio"
              />
              <span className="min-w-0">
                <span className="block font-semibold">{product.name}</span>
                {product.note ? <span className="mt-0.5 block text-[13px] text-slate-500">{product.note}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </div>
    </AdminDialog>
  );
}

/** 회원 상세로 가는 링크. */
export function UserLink({ userId, children }) {
  return <Link className="font-semibold text-brand hover:underline" to={ilseongPath("users", userId)}>{children}</Link>;
}

// ── 확인 창·알림 ─────────────────────────────────────────────
// confirm({ title, message, confirm, danger, cancel }) → 눌렀으면 true. toast("…") → 아래쪽에 잠깐 뜬다.
// cancel은 그만두는 버튼의 글자(기본 "취소"). 하려는 일이 "…취소"일 때는 헷갈리지 않게 "닫기"로 바꿔 쓴다.

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
            <button className="btn-secondary !px-4 !py-2" onClick={() => close(false)} type="button">{dialog?.cancel ?? "취소"}</button>
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
