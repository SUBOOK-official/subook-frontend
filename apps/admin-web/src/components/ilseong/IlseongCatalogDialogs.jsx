import { useId, useMemo, useState } from "react";
import AdminDialog from "../AdminDialog";
import { BusyText } from "../Loading";
import { ilseongAdmin } from "../../lib/ilseongAdmin";
import {
  SUBJECT_COLORS,
  bookDeleteBlock,
  labelsProblem,
  moved,
  nextLabels,
  numberedLabel,
  parseLabelLines,
} from "../../lib/ilseongCatalog";
import { MAX_DAYS } from "../../lib/ilseongGuide";
import { ErrorNote, FIELD_CLASS, Field, MoveButtons, SMALL_BUTTON, WarnNote, useIlseongFeedback } from "./IlseongUi";

// 학습지 화면의 창들: 학습지 설정, 과목, 교재 더하기, 교재 이름·하루 분량 구성.
// 저장하면 앱 서버가 바뀐 뒤의 구성 전체를 돌려준다. 그것을 onSaved(구성)으로 넘긴다.

const digits = (text, max = 5) => text.replace(/\D/g, "").slice(0, max);

function Footer({ formId, saving, onClose, saveLabel = "저장", left = null, disabled = false }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>{left}</div>
      <div className="flex gap-2">
        <button className="btn-secondary !px-4 !py-2" disabled={saving} onClick={onClose} type="button">닫기</button>
        <button className="btn-primary !w-auto !px-5 !py-2" disabled={saving || disabled} form={formId} type="submit">
          {saving ? <BusyText>저장 중</BusyText> : saveLabel}
        </button>
      </div>
    </div>
  );
}

/** 저장 요청 한 번: 중복 누름을 막고 오류를 창 안에 보여 준다. */
function useSave(onSaved) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const save = async (method, path, body, doneMessage, toast) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await ilseongAdmin.request(method, path, body);
      if (doneMessage) toast(doneMessage);
      onSaved(next);
    } catch (requestError) {
      setError(requestError);
      setSaving(false);
    }
  };
  return { saving, error, setError, save };
}

// ── 학습지 ───────────────────────────────────────────────────

/** series가 없으면 새 학습지. */
export function SeriesDialog({ series = null, onClose, onSaved }) {
  const { confirm, toast } = useIlseongFeedback();
  const formId = useId();
  const [name, setName] = useState(series?.name ?? "");
  const [subjectWord, setSubjectWord] = useState(series?.subjectWord ?? "과목");
  const [unitWord, setUnitWord] = useState(series?.unitWord ?? "주차");
  const [dayWord, setDayWord] = useState(series?.dayWord ?? "Day");
  const { saving, error, setError, save } = useSave(onSaved);

  const wordsChanged = series && (subjectWord.trim() !== series.subjectWord || unitWord.trim() !== series.unitWord || dayWord.trim() !== series.dayWord);
  const empty = series && series.subjects.length === 0;

  const submit = async (event) => {
    event.preventDefault();
    const body = {
      name: name.trim(),
      subjectWord: subjectWord.trim(),
      unitWord: unitWord.trim(),
      dayWord: dayWord.trim(),
    };
    await save(series ? "PUT" : "POST", series ? `/api/admin/series/${series.id}` : "/api/admin/series", body,
      series ? `${body.name} 저장했어요` : `${body.name} 만들었어요`, toast);
  };

  const remove = async () => {
    const ok = await confirm({ title: `${series.name} 지울까요?`, message: "안에 아무것도 없는 학습지라 그대로 지워져요.", confirm: "지우기", danger: true });
    if (ok) await save("DELETE", `/api/admin/series/${series.id}`, undefined, `${series.name} 지웠어요`, toast);
  };

  return (
    <AdminDialog
      busy={saving}
      footer={
        <Footer
          formId={formId}
          left={empty ? <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={saving} onClick={() => void remove()} type="button">학습지 지우기</button> : null}
          onClose={onClose}
          saveLabel={series ? "저장" : "만들기"}
          saving={saving}
        />
      }
      onClose={onClose}
      open
      size="lg"
      title={series ? `${series.name} 이름 설정` : "학습지 만들기"}
    >
      <form className="space-y-6 px-6 py-5" id={formId} onSubmit={submit}>
        <Field label="학습지 이름">
          <input autoFocus className={FIELD_CLASS} maxLength={40} onChange={(event) => { setError(null); setName(event.target.value); }} placeholder="예: 일성월심, 파이널 모의고사" required value={name} />
        </Field>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-900">부르는 말</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              이 학습지에서 묶음, 교재 한 권, 하루 분량을 무엇이라 부를지 정해요. 앱 화면의 제목과 새로 만드는 교재·{dayWord.trim() || "Day"}의 기본 이름에 쓰여요.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="묶음">
              <input className={FIELD_CLASS} maxLength={12} onChange={(event) => setSubjectWord(event.target.value)} placeholder="과목" required value={subjectWord} />
            </Field>
            <Field label="교재 한 권">
              <input className={FIELD_CLASS} maxLength={12} onChange={(event) => setUnitWord(event.target.value)} placeholder="주차" required value={unitWord} />
            </Field>
            <Field label="하루 분량">
              <input className={FIELD_CLASS} maxLength={12} onChange={(event) => setDayWord(event.target.value)} placeholder="Day" required value={dayWord} />
            </Field>
          </div>
          <p className="text-[13px] text-slate-500">
            보기: {subjectWord.trim() || "과목"} › {numberedLabel(unitWord, 3)} › {numberedLabel(dayWord, 2)}
          </p>
          {wordsChanged ? <WarnNote>이미 만든 교재와 하루 분량의 이름은 그대로예요. 바꾸려면 1단계에서 교재마다 [이름·하루 분량 고치기]를 눌러 주세요.</WarnNote> : null}
        </div>

        <ErrorNote error={error} />
      </form>
    </AdminDialog>
  );
}

// ── 과목 ─────────────────────────────────────────────────────

/** subject가 없으면 새 과목. */
export function SubjectDialog({ series, subject = null, onClose, onSaved }) {
  const { confirm, toast } = useIlseongFeedback();
  const formId = useId();
  const word = series.subjectWord;
  const used = new Set(series.subjects.map((entry) => entry.color.toUpperCase()));
  const [name, setName] = useState(subject?.name ?? "");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS.find((entry) => !used.has(entry)) ?? SUBJECT_COLORS[0]);
  const { saving, error, setError, save } = useSave(onSaved);
  const validColor = /^#[0-9A-Fa-f]{6}$/.test(color);

  const submit = async (event) => {
    event.preventDefault();
    const body = { name: name.trim(), color };
    await save(subject ? "PUT" : "POST", subject ? `/api/admin/subjects/${subject.code}` : `/api/admin/series/${series.id}/subjects`, body,
      subject ? `${body.name} 저장했어요` : `${body.name} 만들었어요`, toast);
  };

  const remove = async () => {
    const ok = await confirm({ title: `${subject.name} 지울까요?`, message: "교재가 없는 것만 지울 수 있어요.", confirm: "지우기", danger: true });
    if (ok) await save("DELETE", `/api/admin/subjects/${subject.code}`, undefined, `${subject.name} 지웠어요`, toast);
  };

  return (
    <AdminDialog
      busy={saving}
      footer={
        <Footer
          disabled={!validColor}
          formId={formId}
          left={subject && subject.books.length === 0
            ? <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={saving} onClick={() => void remove()} type="button">{word} 지우기</button>
            : null}
          onClose={onClose}
          saveLabel={subject ? "저장" : "만들기"}
          saving={saving}
        />
      }
      onClose={onClose}
      open
      size="md"
      title={subject ? `${subject.name} 이름·색` : `${series.name}에 ${word} 더하기`}
    >
      <form className="space-y-5 px-6 py-5" id={formId} onSubmit={submit}>
        <Field label={`${word} 이름`}>
          <input autoFocus className={FIELD_CLASS} maxLength={30} onChange={(event) => { setError(null); setName(event.target.value); }} placeholder="예: 국어, 물리학" required value={name} />
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">색</p>
          <div className="flex flex-wrap items-center gap-2">
            {SUBJECT_COLORS.map((entry) => (
              <button
                aria-label={`색 ${entry}`}
                aria-pressed={color.toUpperCase() === entry}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${color.toUpperCase() === entry ? "border-slate-900" : "border-white"}`}
                key={entry}
                onClick={() => setColor(entry)}
                style={{ background: entry, boxShadow: "0 0 0 1px rgb(226 232 240)" }}
                type="button"
              />
            ))}
            <input aria-label="색 코드" className={`${FIELD_CLASS} !w-28 font-mono text-[13px]`} maxLength={7} onChange={(event) => setColor(event.target.value.trim())} placeholder="#3182F6" value={color} />
          </div>
          <p className="text-[13px] text-slate-500">앱의 책장·진도 막대·달력에 이 색이 쓰여요.</p>
        </div>
        <ErrorNote error={error} />
      </form>
    </AdminDialog>
  );
}

// ── 교재 추가 ────────────────────────────────────────────────

export function AddBooksDialog({ series, subject, onClose, onSaved }) {
  const { toast } = useIlseongFeedback();
  const formId = useId();
  const unit = series.unitWord;
  const day = series.dayWord;
  const existing = useMemo(() => subject.books.map((book) => book.label), [subject.books]);
  const [count, setCount] = useState("1");
  const [names, setNames] = useState(() => nextLabels(existing, unit, 1).join("\n"));
  const [edited, setEdited] = useState(false);
  const [dayCount, setDayCount] = useState(String(subject.books.at(-1)?.days.length ?? 7));
  const { saving, error, setError, save } = useSave(onSaved);

  const labels = parseLabelLines(names);
  const problem = labelsProblem(labels, { taken: existing });
  const dayNumber = Number(dayCount) || 0;

  const changeCount = (text) => {
    const next = digits(text, 2);
    setCount(next);
    // 이름을 손으로 고치기 전까지는 수에 맞춰 기본 이름을 다시 채운다
    if (!edited) setNames(nextLabels(existing, unit, Math.min(Number(next) || 0, 60)).join("\n"));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (problem) return;
    await save("POST", `/api/admin/subjects/${subject.code}/books`, { labels, dayCount: dayNumber },
      `${subject.name}에 교재 ${labels.length}권을 만들었어요`, toast);
  };

  const holders = series.product?.holders ?? 0;

  return (
    <AdminDialog
      busy={saving}
      footer={<Footer disabled={Boolean(problem) || dayCount === "" || dayNumber > MAX_DAYS} formId={formId} onClose={onClose} saveLabel={`${labels.length || ""}권 만들기`} saving={saving} />}
      onClose={onClose}
      open
      size="lg"
      title={`${subject.name}에 교재 더하기`}
    >
      <form className="space-y-5 px-6 py-5" id={formId} onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="몇 권 만들까요?">
            <input autoFocus className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => changeCount(event.target.value)} value={count} />
          </Field>
          <Field label={`한 권에 하루 분량(${day}) 몇 개?`}>
            <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => { setError(null); setDayCount(digits(event.target.value, 3)); }} value={dayCount} />
          </Field>
        </div>
        <Field label="교재 이름 (한 줄에 하나)">
          <textarea
            className={`${FIELD_CLASS} min-h-[7.5rem] leading-relaxed`}
            onChange={(event) => { setError(null); setEdited(true); setNames(event.target.value); }}
            rows={Math.min(Math.max(labels.length, 3), 10)}
            value={names}
          />
        </Field>
        <p className="-mt-2 text-[13px] leading-relaxed text-slate-500">
          앱에 이 이름 그대로 보여요.{" "}
          {dayNumber > 0
            ? `하루 분량은 ${numberedLabel(day, 1)}부터 ${numberedLabel(day, dayNumber)}까지 만들어지고, 만든 뒤에 이름을 바꾸거나 더하고 뺄 수 있어요.`
            : "하루 분량을 0으로 두면 나누지 않는 교재가 돼요(단어장·부록처럼 쪽만 보는 책). 만든 뒤에 더할 수 있어요."}
        </p>
        {problem && labels.length > 0 ? <WarnNote>{problem}</WarnNote> : null}

        {holders > 0 ? (
          <WarnNote>
            {series.name}의 교재를 이미 가진 학생 {holders.toLocaleString("ko-KR")}명에게도 바로 열려요. PDF를 올리기 전에는 앱에 '준비 중'으로 보여요.
          </WarnNote>
        ) : null}
        <ErrorNote error={error} />
      </form>
    </AdminDialog>
  );
}

// ── 교재 이름·Day 구성 ───────────────────────────────────────

export function StructureDialog({ series, book, onClose, onSaved }) {
  const { confirm, toast } = useIlseongFeedback();
  const formId = useId();
  const day = series.dayWord;
  const [label, setLabel] = useState(book.label);
  // key: 화면에서만 쓰는 이름표(새로 더한 칸은 서버 번호가 없다)
  const [days, setDays] = useState(() => book.days.map((entry) => ({ key: `d${entry.id}`, id: entry.id, label: entry.label, completed: entry.completed, pages: entry.startPage != null })));
  const [added, setAdded] = useState(0);
  const { saving, error, setError, save } = useSave(onSaved);
  const block = bookDeleteBlock(book);

  const patch = (index, next) => {
    setError(null);
    setDays(days.map((entry, i) => (i === index ? { ...entry, ...next } : entry)));
  };
  const removed = book.days.filter((entry) => !days.some((kept) => kept.id === entry.id));
  const removedWithPages = removed.filter((entry) => entry.startPage != null);

  const submit = async (event) => {
    event.preventDefault();
    if (removedWithPages.length > 0) {
      const ok = await confirm({
        title: `${removedWithPages.map((entry) => entry.label).join(", ")} 지울까요?`,
        message: "정해 둔 쪽 범위도 함께 사라져요. 그 쪽들은 어느 칸에도 속하지 않게 돼요.",
        confirm: "지우고 저장",
        danger: true,
      });
      if (!ok) return;
    }
    await save("PUT", `/api/admin/books/${book.id}/structure`, {
      label: label.trim(),
      days: days.map((entry) => ({ id: entry.id ?? undefined, label: entry.label.trim() })),
    }, `${book.subjectName} ${label.trim()} 저장했어요`, toast);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `${book.title} 지울까요?`,
      message: "교재와 올려 둔 쪽 이미지가 모두 지워지고 되돌릴 수 없어요.",
      confirm: "교재 지우기",
      danger: true,
    });
    if (ok) await save("DELETE", `/api/admin/books/${book.id}`, undefined, `${book.title} 지웠어요`, toast);
  };

  return (
    <AdminDialog
      busy={saving}
      footer={
        <Footer
          disabled={!label.trim()}
          formId={formId}
          left={
            <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={saving || Boolean(block)} onClick={() => void remove()} title={block ?? undefined} type="button">
              교재 지우기
            </button>
          }
          onClose={onClose}
          saving={saving}
        />
      }
      onClose={onClose}
      open
      size="lg"
      title={`${book.title} 이름·하루 분량`}
    >
      <form className="space-y-5 px-6 py-5" id={formId} onSubmit={submit}>
        <Field label="교재 이름">
          <input className={FIELD_CLASS} maxLength={30} onChange={(event) => { setError(null); setLabel(event.target.value); }} required value={label} />
        </Field>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-600">{day} {days.length}개</p>
            <button
              className={`btn-secondary ${SMALL_BUTTON}`}
              disabled={days.length >= MAX_DAYS}
              onClick={() => {
                setError(null);
                setDays([...days, { key: `n${added}`, id: null, label: nextLabels(days.map((entry) => entry.label), day, 1)[0], completed: false, pages: false }]);
                setAdded(added + 1);
              }}
              type="button"
            >
              {day} 더하기
            </button>
          </div>
          <ul className="space-y-1.5">
            {days.map((entry, index) => (
              <li className="flex items-center gap-2" key={entry.key}>
                <span className="w-6 shrink-0 text-right text-[13px] tabular-nums text-slate-400">{index + 1}</span>
                <MoveButtons
                  canDown={index < days.length - 1}
                  canUp={index > 0}
                  label={entry.label || `${index + 1}번째`}
                  onMove={(delta) => {
                    const next = moved(days, index, delta);
                    if (next) setDays(next);
                  }}
                />
                <input
                  aria-label={`${index + 1}번째 ${day} 이름`}
                  className={`${FIELD_CLASS} min-w-0 flex-1`}
                  maxLength={30}
                  onChange={(event) => patch(index, { label: event.target.value })}
                  placeholder={numberedLabel(day, index + 1)}
                  value={entry.label}
                />
                {entry.completed ? (
                  <span className="shrink-0 text-[13px] text-slate-400" title="이 칸을 완료한 학생이 있어 지울 수 없어요">학습 기록 있음</span>
                ) : (
                  <button
                    className={`btn-danger-weak shrink-0 ${SMALL_BUTTON}`}
                    onClick={() => {
                      setError(null);
                      setDays(days.filter((_, i) => i !== index));
                    }}
                    type="button"
                  >
                    빼기
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-relaxed text-slate-500">
            순서를 바꿔도 칸마다 정해 둔 쪽은 그 칸을 따라가요. 쪽이 앞뒤로 엇갈리면 2단계에서 그 교재의 쪽을 다시 정해 주세요.
          </p>
        </div>
        {block ? <p className="text-[13px] text-slate-500">{block}</p> : null}
        <ErrorNote error={error} />
      </form>
    </AdminDialog>
  );
}
