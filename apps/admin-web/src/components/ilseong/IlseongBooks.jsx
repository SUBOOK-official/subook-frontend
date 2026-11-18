import { useId, useMemo, useState } from "react";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { continueDayRange, dayPagesLabel } from "../../lib/ilseongPageLayout";
import IlseongPageUploader from "./IlseongPageUploader";
import IlseongSubjectUploader from "./IlseongSubjectUploader";
import {
  CheckRow,
  ErrorNote,
  FIELD_CLASS,
  LoadingNote,
  SMALL_BUTTON,
  Section,
  SubjectDot,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  useIlseongFeedback,
} from "./IlseongUi";

// 교재 쪽 설정 — 교재(과목 × 주차)마다 쪽 이미지, 쪽 수, DAY별 쪽 범위.
// 쪽 수가 비어 있으면 앱에서 그 교재의 쪽이 보이지 않는다.

export default function IlseongBooks() {
  const books = useIlseongData("/api/admin/books");
  const [editing, setEditing] = useState(null);
  // 과목 전체를 한 번에 올리는 창: 그 과목의 교재들
  const [bulk, setBulk] = useState(null);

  const subjects = useMemo(() => {
    const map = new Map();
    for (const book of books.data ?? []) map.set(book.subjectCode, [...(map.get(book.subjectCode) ?? []), book]);
    return [...map.values()];
  }, [books.data]);

  const reload = () => void books.reload({ quiet: true });

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        과목의 모든 주차를 PDF로 한 번에 올리거나, 교재를 눌러 한 주차씩 쪽 이미지(PDF)를 올리고 DAY별 쪽 범위를 정해요.
        쪽 수가 비어 있으면 앱에서 그 교재의 쪽이 보이지 않아요.
      </p>
      {!books.data ? <ErrorNote error={books.error} onRetry={() => void books.reload()} /> : null}
      {books.loading && !books.data ? <LoadingNote /> : null}

      {subjects.map((list) => (
        <Section
          key={list[0].subjectCode}
          right={
            <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setBulk(list)} type="button">
              전체 주차 PDF 올리기
            </button>
          }
          title={<><SubjectDot color={list[0].color} size={10} />{list[0].subjectName}</>}
        >
          <div className="overflow-x-auto">
            <table className={`${TABLE_CLASS} min-w-[680px] table-fixed`}>
              <thead>
                <tr>
                  <th className={`${TH_CLASS} w-20`}>주차</th>
                  <th className={`${TH_CLASS} w-20 text-right`}>쪽 수</th>
                  <th className={`${TH_CLASS} w-16 text-right`}>판</th>
                  <th className={TH_CLASS}>DAY별 쪽</th>
                  <th className={`${TH_CLASS} w-24`} />
                </tr>
              </thead>
              <tbody>
                {list.map((book) => (
                  <tr className="cursor-pointer transition-colors hover:bg-slate-50" key={book.id} onClick={() => setEditing(book)}>
                    <td className={`${TD_CLASS} whitespace-nowrap font-semibold`}>{book.week}주차</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{book.pageCount ?? <span className="text-slate-400">없음</span>}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{book.pageVersion}</td>
                    <td className={`${TD_CLASS} text-[13px] tabular-nums`}>{dayPagesLabel(book.days) ?? <span className="text-slate-400">아직 없음</span>}</td>
                    <td className={`${TD_CLASS} !pr-0 text-right`}>
                      <button className={`btn-secondary ${SMALL_BUTTON}`} type="button">바꾸기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}

      {bulk ? (
        <IlseongSubjectUploader
          books={bulk}
          key={bulk[0].subjectCode}
          onClose={(changed) => {
            setBulk(null);
            if (changed) reload();
          }}
        />
      ) : null}
      {editing ? (
        <BookEditor
          book={editing}
          key={`${editing.id}:${editing.pageVersion}`}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onUploaded={(saved) => {
            // 쪽 이미지를 올려 쪽 수·판이 바뀐 교재로 이 창을 다시 연다
            setEditing(saved);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

const toText = (value) => (value === null || value === undefined ? "" : String(value));
const toNumber = (text) => (text.trim() === "" ? null : Number(text));
const digits = (text) => text.replace(/\D/g, "").slice(0, 4);
const NUMBER_FIELD = `${FIELD_CLASS} !w-24 text-right tabular-nums`;

function BookEditor({ book, onClose, onSaved, onUploaded }) {
  const { toast } = useIlseongFeedback();
  const formId = useId();
  const [pages, setPages] = useState(toText(book.pageCount));
  const [days, setDays] = useState(book.days.map((day) => ({ dayNo: day.dayNo, start: toText(day.startPage), end: toText(day.endPage) })));
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
      toast(`${book.title}를 저장했어요`);
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
          <p className="text-sm text-slate-500">시작·끝 쪽을 둘 다 비우면 그 DAY는 쪽 범위가 없어요(아직 모름).</p>
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm font-semibold text-slate-600">쪽 수</span>
            <input
              className={NUMBER_FIELD}
              inputMode="numeric"
              onChange={(event) => {
                setError(null);
                setPages(digits(event.target.value));
              }}
              value={pages}
            />
          </label>
          {days.map((day, index) => (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2" key={day.dayNo}>
              <span className="w-16 shrink-0 text-sm font-semibold text-slate-600">DAY {day.dayNo}</span>
              <input
                aria-label={`DAY ${day.dayNo} 시작 쪽`}
                className={NUMBER_FIELD}
                inputMode="numeric"
                onChange={(event) => setDay(index, { start: digits(event.target.value) })}
                value={day.start}
              />
              <span aria-hidden="true" className="text-slate-400">–</span>
              <input
                aria-label={`DAY ${day.dayNo} 끝 쪽`}
                className={NUMBER_FIELD}
                inputMode="numeric"
                onChange={(event) => setDay(index, { end: digits(event.target.value) })}
                value={day.end}
              />
              {index > 0 && day.start === "" && day.end === "" && days[index - 1].end !== "" ? (
                <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => fillNext(index)} type="button">이어 채우기</button>
              ) : null}
            </div>
          ))}
          <CheckRow checked={bump} onChange={setBump}>
            서버에 직접 넣은 쪽 이미지를 바꿨어요. 판을 {book.pageVersion}에서 {book.pageVersion + 1}로 올려 앱이 새로 받게 해요.
          </CheckRow>
          <ErrorNote error={error} />
        </form>
      </div>
    </AdminDialog>
  );
}
