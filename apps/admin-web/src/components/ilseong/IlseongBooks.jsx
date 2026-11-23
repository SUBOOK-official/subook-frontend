import { useId, useState } from "react";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { creditRuleText, findBook, moved, seriesCounts } from "../../lib/ilseongCatalog";
import { formatCount } from "../../lib/ilseongFormat";
import { continueDayRange, dayPagesLabel } from "../../lib/ilseongPageLayout";
import { AddBooksDialog, SeriesDialog, StructureDialog, SubjectDialog } from "./IlseongCatalogDialogs";
import IlseongPageUploader from "./IlseongPageUploader";
import IlseongSubjectUploader from "./IlseongSubjectUploader";
import {
  Badge,
  CheckRow,
  EmptyNote,
  ErrorNote,
  FIELD_CLASS,
  Facts,
  LoadingNote,
  MoveButtons,
  SMALL_BUTTON,
  Section,
  SubjectDot,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  useIlseongFeedback,
} from "./IlseongUi";

// 학습지·교재 — 학습지 → 과목 → 교재 → Day를 만들고 이름 붙이고 순서를 정한다(앱 저장소 docs/adr/0039).
// 교재마다 쪽 이미지를 올리고 Day별 쪽 범위를 정하는 일도 여기서 한다.
// "4과목 × 8주차 × Day 7개"는 일성월심의 모양일 뿐이고, 다른 학습지는 다른 모양으로 만들 수 있다.

export default function IlseongBooks() {
  const { toast } = useIlseongFeedback();
  const catalog = useIlseongData("/api/admin/series");
  const products = useIlseongData("/api/admin/products");
  const [picked, setPicked] = useState(null);
  // 열려 있는 창: { kind, seriesId, subjectCode?, bookId? } — 번호만 들고 있다가 최신 구성에서 찾아 쓴다
  const [dialog, setDialog] = useState(null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState(null);

  const list = catalog.data;
  const series = list?.find((entry) => entry.id === picked) ?? list?.[0] ?? null;

  /** 창에서 저장하면 서버가 돌려준 구성으로 바꾸고, 상품의 교재도 다시 읽는다. */
  const saved = (next, { close = true } = {}) => {
    catalog.setData(next);
    void products.reload({ quiet: true });
    if (close) setDialog(null);
  };

  const reorder = async (path, order) => {
    if (moving) return;
    setMoving(true);
    setError(null);
    try {
      catalog.setData(await ilseongAdmin.request("PUT", path, { order: order.map(String) }));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setMoving(false);
    }
  };

  const open = (kind, extra = {}) => setDialog({ kind, seriesId: series.id, ...extra });
  const dialogSeries = dialog ? list?.find((entry) => entry.id === dialog.seriesId) ?? null : null;
  const dialogSubject = dialog?.subjectCode ? dialogSeries?.subjects.find((entry) => entry.code === dialog.subjectCode) ?? null : null;
  const dialogBook = dialog?.bookId ? findBook(list, dialog.bookId)?.book ?? null : null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        앱에 보이는 학습지의 구성을 정해요. 학습지마다 과목, 교재, 하루 분량을 원하는 만큼 만들고 이름을 붙일 수 있어요.
        교재에 쪽 이미지를 올려야 앱에서 볼 수 있어요.
      </p>
      {!list ? <ErrorNote error={catalog.error} onRetry={() => void catalog.reload()} /> : null}
      {catalog.loading && !list ? <LoadingNote /> : null}
      <ErrorNote error={error} />

      {list ? (
        <div className="flex flex-wrap items-center gap-2">
          {list.map((entry, index) => (
            <span className="inline-flex items-center" key={entry.id}>
              <button
                aria-pressed={series?.id === entry.id}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${series?.id === entry.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                onClick={() => setPicked(entry.id)}
                type="button"
              >
                {entry.name}
              </button>
              {list.length > 1 && series?.id === entry.id ? (
                <MoveButtons
                  canDown={index < list.length - 1}
                  canUp={index > 0}
                  disabled={moving}
                  label={entry.name}
                  onMove={(delta) => {
                    const next = moved(list.map((item) => item.id), index, delta);
                    if (next) void reorder("/api/admin/series/order", next);
                  }}
                />
              ) : null}
            </span>
          ))}
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "series-new" })} type="button">학습지 만들기</button>
        </div>
      ) : null}

      {series ? (
        <>
          <SeriesCard onAddSubject={() => open("subject-new")} onEdit={() => open("series")} series={series} />
          {series.subjects.length === 0 ? (
            <Section>
              <EmptyNote>아직 만든 {series.subjectWord} 없어요. [{series.subjectWord} 추가]로 시작해 주세요.</EmptyNote>
            </Section>
          ) : null}
          {series.subjects.map((subject, index) => (
            <SubjectSection
              index={index}
              key={subject.code}
              moving={moving}
              onAddBooks={() => open("books", { subjectCode: subject.code })}
              onBulk={() => open("bulk", { subjectCode: subject.code })}
              onEdit={() => open("subject", { subjectCode: subject.code })}
              onMove={(delta) => {
                const next = moved(series.subjects.map((item) => item.code), index, delta);
                if (next) void reorder(`/api/admin/series/${series.id}/subjects/order`, next);
              }}
              onMoveBook={(bookIndex, delta) => {
                const next = moved(subject.books.map((item) => item.id), bookIndex, delta);
                if (next) void reorder(`/api/admin/subjects/${subject.code}/books/order`, next);
              }}
              onPages={(book) => open("pages", { subjectCode: subject.code, bookId: book.id })}
              onStructure={(book) => open("structure", { subjectCode: subject.code, bookId: book.id })}
              series={series}
              subject={subject}
            />
          ))}
        </>
      ) : null}

      {dialog?.kind === "series-new" ? (
        <SeriesDialog
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            // 방금 만든 학습지를 바로 보여 준다(서버가 맨 뒤에 붙인다)
            const before = new Set((list ?? []).map((entry) => entry.id));
            setPicked(next.find((entry) => !before.has(entry.id))?.id ?? picked);
            saved(next);
          }}
        />
      ) : null}
      {dialog?.kind === "series" && dialogSeries ? (
        <SeriesDialog
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            if (!next.some((entry) => entry.id === dialogSeries.id)) setPicked(null);
            saved(next);
          }}
          series={dialogSeries}
        />
      ) : null}
      {dialog?.kind === "subject-new" && dialogSeries ? <SubjectDialog onClose={() => setDialog(null)} onSaved={saved} series={dialogSeries} /> : null}
      {dialog?.kind === "subject" && dialogSubject ? (
        <SubjectDialog onClose={() => setDialog(null)} onSaved={saved} series={dialogSeries} subject={dialogSubject} />
      ) : null}
      {dialog?.kind === "books" && dialogSubject ? (
        <AddBooksDialog onClose={() => setDialog(null)} onSaved={saved} products={products.data} series={dialogSeries} subject={dialogSubject} />
      ) : null}
      {dialog?.kind === "structure" && dialogBook ? (
        <StructureDialog book={dialogBook} onClose={() => setDialog(null)} onSaved={saved} series={dialogSeries} />
      ) : null}
      {dialog?.kind === "bulk" && dialogSubject ? (
        <IlseongSubjectUploader
          books={dialogSubject.books}
          key={dialogSubject.code}
          onClose={(changed) => {
            setDialog(null);
            if (changed) void catalog.reload({ quiet: true });
          }}
          words={{ unit: dialogSeries.unitWord, day: dialogSeries.dayWord }}
        />
      ) : null}
      {dialog?.kind === "pages" && dialogBook ? (
        <BookEditor
          book={dialogBook}
          dayWord={dialogSeries.dayWord}
          key={`${dialogBook.id}:${dialogBook.pageVersion}`}
          onClose={() => setDialog(null)}
          onSaved={() => {
            toast(`${dialogBook.title} 저장했어요`);
            setDialog(null);
            void catalog.reload({ quiet: true });
          }}
          onUploaded={() => void catalog.reload({ quiet: true })}
        />
      ) : null}
    </div>
  );
}

function SeriesCard({ series, onEdit, onAddSubject }) {
  const counts = seriesCounts(series);
  return (
    <Section
      right={
        <span className="flex flex-wrap gap-2">
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={onEdit} type="button">이름·부르는 말·크레딧 기준</button>
          <button className={`btn-primary !w-auto ${SMALL_BUTTON}`} onClick={onAddSubject} type="button">{series.subjectWord} 추가</button>
        </span>
      }
      title={series.name}
    >
      <Facts
        rows={[
          ["구성", `${series.subjectWord} ${formatCount(counts.subjects)}개 · 교재 ${formatCount(counts.books)}권 (쪽 이미지가 올라온 교재 ${formatCount(counts.withPages)}권)`],
          ["부르는 말", `${series.subjectWord} › ${series.unitWord} › ${series.dayWord}`],
          ["크레딧", creditRuleText(series.credit)],
        ]}
      />
    </Section>
  );
}

function SubjectSection({ series, subject, index, moving, onMove, onEdit, onAddBooks, onBulk, onMoveBook, onPages, onStructure }) {
  return (
    <Section
      right={
        <span className="flex flex-wrap items-center gap-2">
          {series.subjects.length > 1 ? (
            <MoveButtons canDown={index < series.subjects.length - 1} canUp={index > 0} disabled={moving} label={subject.name} onMove={onMove} />
          ) : null}
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={onEdit} type="button">이름·색</button>
          {subject.books.length > 0 ? (
            <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={onBulk} type="button">전체 PDF 올리기</button>
          ) : null}
          <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={onAddBooks} type="button">교재 추가</button>
        </span>
      }
      title={<><SubjectDot color={subject.color} size={10} />{subject.name}</>}
    >
      {subject.books.length === 0 ? (
        <EmptyNote>아직 교재가 없어요. [교재 추가]로 {series.unitWord}를 만들어 주세요.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[820px]`}>
            <thead>
              <tr>
                <th className={`${TH_CLASS} w-16`}>순서</th>
                <th className={TH_CLASS}>{series.unitWord}</th>
                <th className={`${TH_CLASS} text-right`}>쪽 수</th>
                <th className={`${TH_CLASS} text-right`}>판</th>
                <th className={TH_CLASS}>{series.dayWord}별 쪽</th>
                <th className={`${TH_CLASS} text-right`}>등록 회원</th>
                <th className={TH_CLASS} />
              </tr>
            </thead>
            <tbody>
              {subject.books.map((book, bookIndex) => (
                <tr key={book.id}>
                  <td className={TD_CLASS}>
                    <MoveButtons
                      canDown={bookIndex < subject.books.length - 1}
                      canUp={bookIndex > 0}
                      disabled={moving}
                      label={book.label}
                      onMove={(delta) => onMoveBook(bookIndex, delta)}
                    />
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap font-semibold`}>{book.label}</td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>
                    {book.pageCount ?? <Badge tone="orange">쪽 없음</Badge>}
                  </td>
                  <td className={`${TD_CLASS} text-right tabular-nums`}>{book.pageVersion}</td>
                  <td className={`${TD_CLASS} text-[13px] tabular-nums`}>
                    <span className="text-slate-500">{series.dayWord} {book.days.length}개</span>
                    {dayPagesLabel(book.days) ? <span> · {dayPagesLabel(book.days)}</span> : <span className="text-slate-400"> · 쪽 범위 없음</span>}
                  </td>
                  <td className={`${TD_CLASS} text-right tabular-nums text-slate-500`}>{formatCount(book.owners)}명</td>
                  <td className={`${TD_CLASS} !pr-0 text-right`}>
                    <span className="inline-flex gap-1.5 whitespace-nowrap">
                      <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => onPages(book)} type="button">쪽 올리기·범위</button>
                      <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => onStructure(book)} type="button">이름·구성</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

const toText = (value) => (value === null || value === undefined ? "" : String(value));
const toNumber = (text) => (text.trim() === "" ? null : Number(text));
const digits = (text) => text.replace(/\D/g, "").slice(0, 4);
const NUMBER_FIELD = `${FIELD_CLASS} !w-24 text-right tabular-nums`;

/** 교재 한 권의 쪽 이미지와 Day별 쪽 범위. */
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
          <p className="text-sm leading-relaxed text-slate-500">
            {dayWord}마다 몇 쪽부터 몇 쪽까지인지 넣어요. 둘 다 비우면 쪽 범위가 없어요(아직 모름).
            필기 기준으로 크레딧을 주는 학습지는 쪽 범위가 있어야 크레딧을 줄 수 있어요.
          </p>
          <label className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm font-semibold text-slate-600">쪽 수</span>
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
