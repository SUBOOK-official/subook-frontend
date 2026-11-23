import { useId, useState } from "react";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { ilseongAdmin } from "../../lib/ilseongAdmin";
import { findBook } from "../../lib/ilseongCatalog";
import { bookState, pageCounts } from "../../lib/ilseongGuide";
import { continueDayRange } from "../../lib/ilseongPageLayout";
import IlseongPageUploader from "./IlseongPageUploader";
import IlseongSubjectUploader from "./IlseongSubjectUploader";
import {
  Badge,
  CheckRow,
  Disclosure,
  ErrorNote,
  FIELD_CLASS,
  SMALL_BUTTON,
  SubjectDot,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  useIlseongFeedback,
} from "./IlseongUi";

// 2단계 교재 PDF 올리기 — 교재를 한 쪽씩 내보낸 PDF를 올린다. 올린 교재만 학생 앱에서 볼 수 있다.
// 과목마다 한 번에 올리거나(IlseongSubjectUploader), 교재 한 권씩 올리고 고친다(BookEditor).

const STATE_BADGE = {
  ready: { tone: "green", label: "앱에서 볼 수 있어요" },
  none: { tone: "orange", label: "PDF 없음" },
  ranges: { tone: "orange", label: "하루 분량의 쪽을 안 정했어요" },
};

/** onChanged(): 올리거나 고친 뒤 — 구성을 다시 읽으라는 신호. */
export function PagesStep({ series, onChanged }) {
  const { toast } = useIlseongFeedback();
  // 열려 있는 창: { kind: "bulk" | "book", subjectCode, bookId? }
  const [dialog, setDialog] = useState(null);
  const [shown, setShown] = useState({});

  const dialogSubject = dialog ? series.subjects.find((entry) => entry.code === dialog.subjectCode) ?? null : null;
  const dialogBook = dialog?.bookId ? findBook([series], dialog.bookId)?.book ?? null : null;
  // 아직 다 올리지 않은 첫 과목의 버튼만 파랗게 해서 다음에 누를 곳을 알린다
  const nextSubject = series.subjects.find((subject) => subject.books.length > 0 && pageCounts([subject]).ready < subject.books.length);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
        교재를 한 쪽씩 내보낸 PDF를 올려요. {series.subjectWord} 하나의 모든 교재를 한 번에 올리면 교재별로 나눠 넣어요.
        올리지 않은 교재는 학생 앱에 '준비 중'으로 보여요.
      </p>

      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {series.subjects.map((subject) => {
          const counts = pageCounts([subject]);
          const complete = counts.total > 0 && counts.ready === counts.total;
          const open = shown[subject.code] ?? (!complete && counts.ready > 0);
          return (
            <li className="py-3.5" key={subject.code}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 flex-1 basis-[12rem]">
                  <span className="text-[15px] font-bold text-slate-900"><SubjectDot color={subject.color} size={10} />{subject.name}</span>
                  <span className="ml-2 text-sm text-slate-500">
                    {counts.total === 0 ? "교재 없음" : complete ? `${counts.total}권 모두 올렸어요` : `${counts.total}권 가운데 ${counts.ready}권 올림`}
                  </span>
                </span>
                {counts.total > 0 ? (
                  <>
                    <button aria-expanded={open} className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setShown({ ...shown, [subject.code]: !open })} type="button">
                      {open ? "교재 접기" : "한 권씩 보기"}
                    </button>
                    <button
                      className={`${subject.code === nextSubject?.code ? "btn-primary !w-auto" : "btn-secondary"} ${SMALL_BUTTON}`}
                      onClick={() => setDialog({ kind: "bulk", subjectCode: subject.code })}
                      type="button"
                    >
                      {complete ? "PDF 다시 올리기" : "PDF 한 번에 올리기"}
                    </button>
                  </>
                ) : null}
              </div>
              {open ? (
                <div className="mt-3 overflow-x-auto">
                  <table className={`${TABLE_CLASS} min-w-[480px]`}>
                    <thead>
                      <tr>
                        <th className={TH_CLASS}>교재</th>
                        <th className={TH_CLASS}>상태</th>
                        <th className={`${TH_CLASS} text-right`}>쪽 수</th>
                        <th className={TH_CLASS} />
                      </tr>
                    </thead>
                    <tbody>
                      {subject.books.map((book) => {
                        const state = bookState(book);
                        return (
                          <tr key={book.id}>
                            <td className={`${TD_CLASS} whitespace-nowrap font-semibold`}>{book.label}</td>
                            <td className={TD_CLASS}><Badge tone={STATE_BADGE[state].tone}>{STATE_BADGE[state].label}</Badge></td>
                            <td className={`${TD_CLASS} text-right tabular-nums text-slate-500`}>{book.pageCount ? `${book.pageCount}쪽` : "—"}</td>
                            <td className={`${TD_CLASS} !pr-0 text-right`}>
                              <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "book", subjectCode: subject.code, bookId: book.id })} type="button">
                                {state === "none" ? "이 교재만 올리기" : state === "ranges" ? "쪽 정하기" : "보기·바꾸기"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {dialog?.kind === "bulk" && dialogSubject ? (
        <IlseongSubjectUploader
          books={dialogSubject.books}
          key={dialogSubject.code}
          onClose={(changed) => {
            setDialog(null);
            if (changed) onChanged();
          }}
          words={{ unit: series.unitWord, day: series.dayWord }}
        />
      ) : null}
      {dialog?.kind === "book" && dialogBook ? (
        <BookEditor
          book={dialogBook}
          dayWord={series.dayWord}
          key={`${dialogBook.id}:${dialogBook.pageVersion}`}
          onClose={() => setDialog(null)}
          onSaved={() => {
            toast(`${dialogBook.title} 저장했어요`);
            setDialog(null);
            onChanged();
          }}
          onUploaded={onChanged}
        />
      ) : null}
    </div>
  );
}

const toText = (value) => (value === null || value === undefined ? "" : String(value));
const toNumber = (text) => (text.trim() === "" ? null : Number(text));
const digits = (text) => text.replace(/\D/g, "").slice(0, 4);
const NUMBER_FIELD = `${FIELD_CLASS} !w-24 text-right tabular-nums`;

/** 교재 한 권의 쪽 이미지와 하루 분량별 쪽 범위. */
function BookEditor({ book, dayWord, onClose, onSaved, onUploaded }) {
  const formId = useId();
  const [pages, setPages] = useState(toText(book.pageCount));
  const [days, setDays] = useState(book.days.map((day) => ({ dayNo: day.dayNo, label: day.label, start: toText(day.startPage), end: toText(day.endPage) })));
  const [bump, setBump] = useState(false);
  // 쪽 이미지를 바꾸거나 올리는 중에는 바깥을 눌러도 닫지 않는다(준비한 쪽을 잃지 않게)
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /** 칸을 고치면 지난 오류 안내는 지운다. */
  const setDay = (index, patch) => {
    setError(null);
    setDays(days.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  };

  const fillNext = (index) => {
    const next = continueDayRange(days[index - 1]);
    if (next) setDay(index, next);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await ilseongAdmin.request("PUT", `/api/admin/books/${book.id}`, {
        pageCount: toNumber(pages),
        bumpVersion: bump,
        days: days.map((day) => ({ dayNo: day.dayNo, startPage: toNumber(day.start), endPage: toNumber(day.end) })),
      });
      onSaved();
    } catch (requestError) {
      setError(requestError);
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      busy={uploading || saving}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary !px-4 !py-2" disabled={saving} onClick={onClose} type="button">닫기</button>
          <button className="btn-primary !w-auto !px-5 !py-2" disabled={saving} form={formId} type="submit">
            {saving ? <BusyText>저장 중</BusyText> : "저장"}
          </button>
        </div>
      }
      onClose={onClose}
      open
      size="lg"
      title={book.title}
    >
      <div className="space-y-5 px-6 py-5">
        <IlseongPageUploader book={book} onBusy={setUploading} onDone={onUploaded} />
        <hr className="border-slate-100" />
        <form className="space-y-3" id={formId} onSubmit={submit}>
          <div>
            <p className="text-sm font-semibold text-slate-600">{dayWord}마다 몇 쪽부터 몇 쪽까지인지</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              학생이 {dayWord} 하나를 누르면 여기 적은 쪽이 열려요. 비워 두면 그 칸은 앱에서 열리지 않고, 필기 기준 크레딧도 받을 수 없어요.
            </p>
          </div>
          {days.map((day, index) => (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2" key={day.dayNo}>
              <span className="w-24 shrink-0 truncate text-sm font-semibold text-slate-600" title={day.label}>{day.label}</span>
              <input
                aria-label={`${day.label} 시작 쪽`}
                className={NUMBER_FIELD}
                inputMode="numeric"
                onChange={(event) => setDay(index, { start: digits(event.target.value) })}
                value={day.start}
              />
              <span aria-hidden="true" className="text-slate-400">–</span>
              <input
                aria-label={`${day.label} 끝 쪽`}
                className={NUMBER_FIELD}
                inputMode="numeric"
                onChange={(event) => setDay(index, { end: digits(event.target.value) })}
                value={day.end}
              />
              <span className="text-sm text-slate-400">쪽</span>
              {index > 0 && day.start === "" && day.end === "" && days[index - 1].end !== "" ? (
                <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => fillNext(index)} type="button">이어 채우기</button>
              ) : null}
            </div>
          ))}
          <ErrorNote error={error} />
        </form>
        <Disclosure sub="개발자가 알려 줄 때만 써요." title="개발자용">
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-semibold text-slate-600">전체 쪽 수</span>
              <input
                className={NUMBER_FIELD}
                form={formId}
                inputMode="numeric"
                onChange={(event) => {
                  setError(null);
                  setPages(digits(event.target.value));
                }}
                value={pages}
              />
            </label>
            <CheckRow checked={bump} onChange={setBump}>
              서버에 직접 넣은 쪽 이미지를 바꿨어요. 판을 {book.pageVersion}에서 {book.pageVersion + 1}로 올려 앱이 새로 받게 해요.
            </CheckRow>
          </div>
        </Disclosure>
      </div>
    </AdminDialog>
  );
}
