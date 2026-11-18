import { useEffect, useMemo, useRef, useState } from "react";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { ilseongAdmin } from "../../lib/ilseongAdmin";
import { PagePrepareError, openPageSource } from "../../lib/ilseongPageImages";
import { DEFAULT_WEEK_LAYOUT, layoutDayRanges, layoutPageCount, planSubjectUpload } from "../../lib/ilseongPageLayout";
import { putPageWithRetry } from "./IlseongPageUploader";
import { CheckRow, ErrorNote, FIELD_CLASS, Field, PageThumbs, Progress, WarnNote, useIlseongFeedback } from "./IlseongUi";

/**
 * 한 과목의 모든 주차를 PDF로 한 번에 올린다. PDF는 한 파일이어도, 여러 파일이어도 된다(이름 순서로 잇는다).
 * 주차마다 "도입, DAY 1–7"의 쪽 수를 적으면 그만큼씩 잘라 그 주차 교재에 넣고 DAY별 쪽 범위도 함께 정한다.
 * 올리다 끊기면 끝난 주차는 그대로 두고, 다시 누르면 남은 주차부터 이어서 올린다.
 *
 * onClose(바뀌었나): 한 주차라도 올라갔으면 true — 바깥 목록을 다시 읽으라는 뜻.
 */
export default function IlseongSubjectUploader({ books, onClose }) {
  const { confirm, toast } = useIlseongFeedback();
  const weeks = useMemo(() => [...books].sort((a, b) => a.week - b.week), [books]);
  const subject = weeks[0].subjectName;
  const [files, setFiles] = useState([]);
  const [source, setSource] = useState(null);
  const [reading, setReading] = useState(false);
  const [layouts, setLayouts] = useState(() => weeks.map(() => DEFAULT_WEEK_LAYOUT));
  const [perWeek, setPerWeek] = useState(false);
  const [covers, setCovers] = useState([]);
  const [run, setRun] = useState(null);
  const [doneWeeks, setDoneWeeks] = useState([]);
  const [error, setError] = useState(null);
  const input = useRef(null);
  const closed = useRef(false);
  const held = useRef({ source: null, covers: [] });
  // 지금까지 고른 파일(화면 갱신을 기다리지 않고 바로 이어 붙이려고 따로 둔다)과, 마지막으로 연 차례
  const picked = useRef([]);
  const latest = useRef(0);

  useEffect(() => {
    closed.current = false;
    const holding = held.current;
    return () => {
      closed.current = true;
      void holding.source?.close();
      holding.covers.forEach((cover) => URL.revokeObjectURL(cover.url));
    };
  }, []);

  const busy = reading || run !== null;
  const idle = run === null;

  const dropCovers = () => {
    held.current.covers.forEach((cover) => URL.revokeObjectURL(cover.url));
    held.current.covers = [];
    setCovers([]);
  };

  /** 고른 파일 목록이 바뀌면 다시 연다. 여는 동안 목록이 또 바뀌면 마지막 것만 남긴다(앞서 열던 것은 다 열린 뒤 바로 닫는다). */
  const reopen = async (next) => {
    const turn = ++latest.current;
    picked.current = next;
    setError(null);
    dropCovers();
    setDoneWeeks([]);
    setFiles(next);
    const before = held.current.source;
    held.current.source = null;
    setSource(null);
    await before?.close();
    if (next.length === 0) {
      if (turn === latest.current) setReading(false);
      return;
    }
    setReading(true);
    try {
      const opened = await openPageSource(next);
      if (closed.current || turn !== latest.current) {
        await opened.close();
        return;
      }
      held.current.source = opened;
      setSource(opened);
    } catch (openError) {
      if (!closed.current && turn === latest.current) {
        setError(openError instanceof PagePrepareError ? openError : new Error("PDF를 읽지 못했어요."));
      }
    } finally {
      if (!closed.current && turn === latest.current) setReading(false);
    }
  };

  const add = (event) => {
    const added = [...(event.target.files ?? [])];
    event.target.value = "";
    if (added.length === 0) return;
    // 같은 이름을 다시 고르면 새 파일로 바꾼다
    const names = new Set(added.map((file) => file.name));
    void reopen([...picked.current.filter((file) => !names.has(file.name)), ...added]);
  };

  const plan = useMemo(() => planSubjectUpload(weeks, layouts), [weeks, layouts]);
  const { plans, parsed, total: planned } = plan;
  const mismatch = source !== null && !plan.problem && planned !== source.total;
  const ready = source !== null && !plan.problem && !mismatch && plans.length > 0;

  // 나눈 결과를 눈으로 확인하도록 주차마다 첫 쪽을 보여 준다
  useEffect(() => {
    if (!ready || !source || !idle) return undefined;
    let stale = false;
    const made = [];
    (async () => {
      for (const entry of plans) {
        if (stale) break;
        const blob = await source.page(entry.first);
        made.push({ week: entry.book.week, url: URL.createObjectURL(blob) });
      }
      if (stale || closed.current) {
        made.forEach((cover) => URL.revokeObjectURL(cover.url));
        return;
      }
      held.current.covers.forEach((cover) => URL.revokeObjectURL(cover.url));
      held.current.covers = made;
      setCovers(made);
    })().catch((drawError) => {
      made.forEach((cover) => URL.revokeObjectURL(cover.url));
      if (!stale && !closed.current) setError(drawError instanceof PagePrepareError ? drawError : new Error("쪽을 그리지 못했어요."));
    });
    return () => {
      stale = true;
    };
  }, [ready, source, plans, idle]);

  const setAll = (text) => setLayouts(weeks.map(() => text));
  const setOne = (index, text) => setLayouts(layouts.map((layout, i) => (i === index ? text : layout)));

  const upload = async () => {
    if (!source) return;
    const todo = plans.filter((entry) => !doneWeeks.includes(entry.book.week));
    const replaced = todo.filter((entry) => entry.book.pageCount !== null);
    const ok = await confirm({
      title: `${subject} ${todo.length}개 주차를 올릴까요?`,
      message:
        replaced.length > 0
          ? `${replaced.map((entry) => `${entry.book.week}주차`).join(", ")}는 지금 올라가 있는 쪽 대신 새 쪽이 학생 앱에 보여요. 학생이 쓴 필기는 그대로 남아요.`
          : "다 올라간 주차부터 학생 앱에 보여요.",
      confirm: "올리기",
    });
    if (!ok || closed.current) return;
    setError(null);
    const all = plans.reduce((sum, entry) => sum + entry.pages, 0);
    let overall = plans.filter((entry) => doneWeeks.includes(entry.book.week)).reduce((sum, entry) => sum + entry.pages, 0);
    const finished = [...doneWeeks];
    try {
      for (const entry of todo) {
        const bookId = entry.book.id;
        setRun({ week: entry.book.week, done: 0, total: entry.pages, overall: overall / all });
        const { uploadId } = await ilseongAdmin.request("POST", `/api/admin/books/${bookId}/uploads`);
        for (let k = 0; k < entry.pages; k += 1) {
          if (closed.current) return;
          const blob = await source.page(entry.first + k);
          await putPageWithRetry(`/api/admin/books/${bookId}/uploads/${uploadId}/pages/${k + 1}`, blob);
          overall += 1;
          if (!closed.current) setRun({ week: entry.book.week, done: k + 1, total: entry.pages, overall: overall / all });
        }
        if (closed.current) return;
        await ilseongAdmin.request("POST", `/api/admin/books/${bookId}/uploads/${uploadId}/commit`, { pageCount: entry.pages });
        await ilseongAdmin.request("PUT", `/api/admin/books/${bookId}`, {
          pageCount: entry.pages,
          bumpVersion: false,
          days: layoutDayRanges(entry.book, entry.layout),
        });
        finished.push(entry.book.week);
        if (!closed.current) setDoneWeeks([...finished]);
      }
      toast(`${subject} ${plans.length}개 주차, ${all}쪽을 올렸어요`);
      onClose(true);
    } catch (uploadError) {
      if (closed.current) return;
      setError(uploadError instanceof Error ? uploadError : new Error("올리지 못했어요."));
    } finally {
      if (!closed.current) setRun(null);
    }
  };

  const close = () => onClose(doneWeeks.length > 0);

  return (
    <AdminDialog
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2" disabled={busy} onClick={close} type="button">닫기</button>
          <button className="btn-primary !w-auto !px-4 !py-2" disabled={!ready || busy} onClick={() => void upload()} type="button">
            {run ? <BusyText>올리는 중</BusyText> : doneWeeks.length > 0 ? "이어서 올리기" : ready ? `${plans.length}개 주차 ${planned}쪽 올리기` : "올리기"}
          </button>
        </div>
      }
      onClose={close}
      open
      size="xl"
      title={`${subject} 전체 올리기`}
    >
      <div className="space-y-4 px-6 py-5">
        <p className="text-sm leading-relaxed text-slate-600">
          모든 주차를 한 쪽씩 내보낸 PDF를 올리면 주차별로 나눠 넣어요. 파일이 여러 개면 이름 순서대로 이어요(예: 01, 02, …).
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button className="btn-secondary !px-4 !py-2" disabled={busy} onClick={() => input.current?.click()} type="button">
            {files.length === 0 ? "PDF 고르기" : "PDF 더 넣기"}
          </button>
          {files.length > 0 ? (
            <button className="btn-secondary !px-4 !py-2" disabled={busy} onClick={() => void reopen([])} type="button">모두 빼기</button>
          ) : null}
          <span className="text-sm text-slate-600" role="status">
            {reading ? "파일을 읽는 중" : null}
            {!reading && source ? `PDF ${source.files.length}개, 모두 ${source.total}쪽` : null}
            {!reading && !source && files.length === 0 ? "아직 고른 파일이 없어요." : null}
          </span>
        </div>
        {source && source.files.length > 1 ? (
          <p className="text-[13px] leading-relaxed text-slate-400">{source.files.map((file) => `${file.name} (${file.pages}쪽)`).join(" → ")}</p>
        ) : null}

        <hr className="border-slate-100" />

        <Field label="한 주차의 쪽 구성: 도입, DAY 1, DAY 2, … 의 쪽 수">
          <input
            aria-label="모든 주차의 쪽 구성"
            className={FIELD_CLASS}
            disabled={busy || perWeek}
            onChange={(event) => setAll(event.target.value)}
            placeholder={perWeek ? "아래에서 주차마다 넣어요" : DEFAULT_WEEK_LAYOUT}
            value={perWeek ? "" : layouts[0]}
          />
        </Field>
        <CheckRow checked={perWeek} disabled={busy} onChange={setPerWeek}>
          주차마다 구성이 달라요. 칸을 비운 주차는 올리지 않아요.
        </CheckRow>
        {perWeek ? (
          <div className="space-y-2">
            {weeks.map((book, index) => (
              <label className="flex items-center gap-3" key={book.id}>
                <span className="w-14 shrink-0 text-sm font-semibold text-slate-600">{book.week}주차</span>
                <input
                  aria-label={`${book.week}주차 쪽 구성`}
                  className={`${FIELD_CLASS} flex-1`}
                  disabled={busy}
                  onChange={(event) => setOne(index, event.target.value)}
                  value={layouts[index]}
                />
                <span className="w-12 shrink-0 text-right text-[13px] tabular-nums text-slate-400">
                  {parsed[index].layout ? `${layoutPageCount(parsed[index].layout)}쪽` : parsed[index].problem ? "확인" : "없음"}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {plan.problem ? <WarnNote>쪽 구성: {plan.problem}.</WarnNote> : null}
        {mismatch ? (
          <WarnNote>
            PDF는 {source.total}쪽인데 구성대로 나누면 {plans.length}개 주차 {planned}쪽이에요. 쪽 수가 같아야 올릴 수 있어요.
          </WarnNote>
        ) : null}

        {ready ? (
          <>
            <p className="text-sm leading-relaxed text-slate-600">
              이렇게 나눠요. 주차마다 첫 쪽이 그 주차의 표지인지 확인해 주세요.{" "}
              <span className="text-slate-500">{plans.map((entry) => `${entry.book.week}주차 ${entry.first}–${entry.first + entry.pages - 1}쪽`).join(" · ")}</span>
            </p>
            <PageThumbs
              pages={covers.map((cover) => ({
                key: cover.week,
                url: cover.url,
                label: `${cover.week}주차`,
                title: `${cover.week}주차 첫 쪽 크게 보기`,
                alt: `${cover.week}주차 첫 쪽`,
              }))}
            />
          </>
        ) : null}

        {run ? (
          <Progress label={`${run.week}주차 올리는 중 ${run.done}/${run.total} · 전체 ${Math.round(run.overall * 100)}%`} ratio={run.overall} />
        ) : null}
        {!run && doneWeeks.length > 0 ? (
          <WarnNote>{doneWeeks.map((week) => `${week}주차`).join(", ")}까지 올라갔어요. 다시 누르면 남은 주차부터 이어서 올려요.</WarnNote>
        ) : null}
        <ErrorNote error={error} />
      </div>
      <input accept="application/pdf" hidden multiple onChange={add} ref={input} type="file" />
    </AdminDialog>
  );
}
