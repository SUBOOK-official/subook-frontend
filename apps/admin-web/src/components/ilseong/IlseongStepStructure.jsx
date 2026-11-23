import { useId, useState } from "react";
import { BusyText } from "../Loading";
import { ilseongAdmin } from "../../lib/ilseongAdmin";
import { CREDIT_RULES, SUBJECT_COLORS, findBook, moved, numberedLabel } from "../../lib/ilseongCatalog";
import { DAY_WORDS, UNIT_WORDS, setupBody, setupProblem } from "../../lib/ilseongGuide";
import { AddBooksDialog, StructureDialog, SubjectDialog } from "./IlseongCatalogDialogs";
import {
  ErrorNote,
  FIELD_CLASS,
  Field,
  MoveButtons,
  SMALL_BUTTON,
  SubjectDot,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  WarnNote,
  useIlseongFeedback,
} from "./IlseongUi";

// 1단계 구성 만들기 — 학습지의 과목과 교재, 교재마다의 하루 분량.
//  - SetupForm:     새 학습지를 처음부터 한 번에 만든다(이름, 과목들, 과목마다 교재 수, 교재마다 하루 분량 수)
//  - StructureStep: 있는 학습지의 과목·교재를 더하고, 이름을 바꾸고, 순서를 바꾸고, 지운다

const digits = (text, max = 2) => text.replace(/\D/g, "").slice(0, max);

// ── 새 학습지 ────────────────────────────────────────────────

/** 자주 쓰는 말 가운데 하나를 고르거나 직접 넣는다. */
function WordPicker({ label, options, value, onChange, preview }) {
  const custom = !options.includes(value);
  const chip = (active) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <button aria-pressed={value === option} className={chip(value === option)} key={option} onClick={() => onChange(option)} type="button">
            {option}
          </button>
        ))}
        <button aria-pressed={custom} className={chip(custom)} onClick={() => { if (!custom) onChange(""); }} type="button">직접 넣기</button>
        {custom ? (
          <input
            aria-label={`${label} 직접 넣기`}
            autoFocus
            className={`${FIELD_CLASS} !w-32`}
            maxLength={12}
            onChange={(event) => onChange(event.target.value)}
            placeholder="예: 단원"
            value={value}
          />
        ) : null}
      </div>
      <p className="text-[13px] text-slate-500">{preview}</p>
    </div>
  );
}

export function SetupForm({ onCreated }) {
  const { toast } = useIlseongFeedback();
  const formId = useId();
  const [form, setForm] = useState({
    name: "",
    subjects: [{ key: 0, name: "", color: SUBJECT_COLORS[0] }],
    bookCount: "8",
    dayCount: "7",
    unitWord: "주차",
    dayWord: "Day",
    creditRule: "INK",
  });
  const [nextKey, setNextKey] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => {
    setError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const setSubject = (index, name) => set("subjects")(form.subjects.map((subject, i) => (i === index ? { ...subject, name } : subject)));
  const addSubject = () => {
    const used = new Set(form.subjects.map((subject) => subject.color));
    const color = SUBJECT_COLORS.find((entry) => !used.has(entry)) ?? SUBJECT_COLORS[form.subjects.length % SUBJECT_COLORS.length];
    set("subjects")([...form.subjects, { key: nextKey, name: "", color }]);
    setNextKey(nextKey + 1);
  };

  const problem = setupProblem(form);
  const books = Math.min(Number(form.bookCount) || 0, 60);
  const days = Math.min(Number(form.dayCount) || 0, 60);
  const named = form.subjects.filter((subject) => subject.name.trim()).length;
  const range = (word, count) =>
    count <= 0 ? "" : count === 1 ? numberedLabel(word, 1) : count === 2 ? `${numberedLabel(word, 1)}, ${numberedLabel(word, 2)}` : `${numberedLabel(word, 1)}, ${numberedLabel(word, 2)} … ${numberedLabel(word, count)}`;

  const submit = async (event) => {
    event.preventDefault();
    if (saving || problem) return;
    setSaving(true);
    setError(null);
    try {
      const result = await ilseongAdmin.request("POST", "/api/admin/series/setup", setupBody(form));
      toast(`${form.name.trim()} 만들었어요`);
      onCreated(result);
    } catch (requestError) {
      setError(requestError);
      setSaving(false);
    }
  };

  return (
    <form className="max-w-2xl space-y-7" id={formId} onSubmit={submit}>
      <Field label="학습지 이름">
        <input autoFocus className={FIELD_CLASS} maxLength={40} onChange={(event) => set("name")(event.target.value)} placeholder="예: 파이널 모의고사" value={form.name} />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">과목</p>
        <ul className="space-y-2">
          {form.subjects.map((subject, index) => (
            <li className="flex items-center gap-2" key={subject.key}>
              <SubjectDot color={subject.color} size={12} />
              <input
                aria-label={`${index + 1}번째 과목 이름`}
                className={`${FIELD_CLASS} min-w-0 flex-1`}
                maxLength={30}
                onChange={(event) => setSubject(index, event.target.value)}
                placeholder={index === 0 ? "예: 국어" : "과목 이름"}
                value={subject.name}
              />
              {form.subjects.length > 1 ? (
                <button className={`btn-secondary shrink-0 ${SMALL_BUTTON}`} onClick={() => set("subjects")(form.subjects.filter((_, i) => i !== index))} type="button">빼기</button>
              ) : null}
            </li>
          ))}
        </ul>
        {form.subjects.length < 20 ? <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={addSubject} type="button">과목 더하기</button> : null}
        <p className="text-[13px] text-slate-500">과목을 나누지 않는 학습지는 한 줄만 넣으면 돼요. 과목 색은 만든 뒤에 바꿀 수 있어요.</p>
      </div>

      <div className="space-y-4">
        <Field className="max-w-[14rem]" label="과목마다 교재 몇 권?">
          <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => set("bookCount")(digits(event.target.value))} value={form.bookCount} />
        </Field>
        <WordPicker
          label="교재 한 권을 부르는 말"
          onChange={set("unitWord")}
          options={UNIT_WORDS}
          preview={form.unitWord.trim() && books > 0 ? `교재 이름이 이렇게 만들어져요: ${range(form.unitWord, books)}` : "교재 이름 뒤에 붙는 말이에요."}
          value={form.unitWord}
        />
      </div>

      <div className="space-y-4">
        <Field className="max-w-[14rem]" label="교재 한 권에 하루 분량 몇 개?">
          <input className={`${FIELD_CLASS} tabular-nums`} inputMode="numeric" onChange={(event) => set("dayCount")(digits(event.target.value))} value={form.dayCount} />
        </Field>
        <WordPicker
          label="하루 분량을 부르는 말"
          onChange={set("dayWord")}
          options={DAY_WORDS}
          preview={form.dayWord.trim() && days > 0 ? `학생 앱에 이렇게 보여요: ${range(form.dayWord, days)}` : "하루치 공부 한 칸의 이름이에요."}
          value={form.dayWord}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">하루 분량을 끝낸 학생에게 크레딧을 어떻게 줄까요?</p>
        {CREDIT_RULES.map((option) => (
          <label className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${form.creditRule === option.value ? "border-brand bg-blue-50/40" : "border-slate-200"}`} key={option.value}>
            <input checked={form.creditRule === option.value} className="mt-1 h-4 w-4 shrink-0 accent-[#3182f6]" name="setup-credit" onChange={() => set("creditRule")(option.value)} type="radio" />
            <span>
              <span className="block font-semibold text-slate-900">{option.label}{option.value === "INK" ? <span className="ml-1.5 font-normal text-slate-500">대부분 이걸 골라요</span> : null}</span>
              <span className="mt-0.5 block leading-relaxed text-slate-500">{option.hint}</span>
            </span>
          </label>
        ))}
        <p className="text-[13px] text-slate-500">크레딧 양과 필기 기준은 만든 뒤 [이름·크레딧 설정]에서 바꿀 수 있어요.</p>
      </div>

      {problem && form.name.trim() ? <WarnNote>{problem}</WarnNote> : null}
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary !w-auto !px-6" disabled={saving || Boolean(problem)} type="submit">
          {saving ? <BusyText>만드는 중</BusyText> : "학습지 만들기"}
        </button>
        {!problem ? <span className="text-sm text-slate-500">과목 {named}개 · 교재 {named * books}권이 만들어져요.</span> : null}
      </div>
    </form>
  );
}

// ── 있는 학습지 ──────────────────────────────────────────────

/** onChanged(구성): 저장하면 앱 서버가 돌려준 구성 전체를 넘긴다. */
export function StructureStep({ series, onChanged }) {
  // 열려 있는 창: { kind, subjectCode?, bookId? } — 번호만 들고 있다가 최신 구성에서 찾아 쓴다
  const [dialog, setDialog] = useState(null);
  const [shown, setShown] = useState({});
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState(null);

  const saved = (next) => {
    onChanged(next);
    setDialog(null);
  };
  const reorder = async (path, order) => {
    if (moving) return;
    setMoving(true);
    setError(null);
    try {
      onChanged(await ilseongAdmin.request("PUT", path, { order: order.map(String) }));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setMoving(false);
    }
  };

  const dialogSubject = dialog?.subjectCode ? series.subjects.find((entry) => entry.code === dialog.subjectCode) ?? null : null;
  const dialogBook = dialog?.bookId ? findBook([series], dialog.bookId)?.book ?? null : null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        {series.subjectWord}·교재를 더하거나 이름을 바꿔요. 이미 학생에게 열린 교재는 지울 수 없어요.
      </p>
      <ErrorNote error={error} />
      {series.subjects.length === 0 ? <p className="text-sm text-slate-500">아직 만든 것이 없어요. 아래 버튼으로 시작해 주세요.</p> : null}

      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {series.subjects.map((subject, index) => {
          const open = shown[subject.code] ?? subject.books.length === 0;
          const dayCounts = [...new Set(subject.books.map((book) => book.days.length))];
          return (
            <li className="py-3.5" key={subject.code}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 flex-1 basis-[12rem]">
                  <span className="text-[15px] font-bold text-slate-900"><SubjectDot color={subject.color} size={10} />{subject.name}</span>
                  <span className="ml-2 text-sm text-slate-500">
                    {subject.books.length === 0
                      ? "교재 없음"
                      : `교재 ${subject.books.length}권${dayCounts.length === 1 ? ` · 한 권에 ${series.dayWord} ${dayCounts[0]}개` : ""}`}
                  </span>
                </span>
                {series.subjects.length > 1 ? (
                  <MoveButtons
                    canDown={index < series.subjects.length - 1}
                    canUp={index > 0}
                    disabled={moving}
                    label={subject.name}
                    onMove={(delta) => {
                      const next = moved(series.subjects.map((item) => item.code), index, delta);
                      if (next) void reorder(`/api/admin/series/${series.id}/subjects/order`, next);
                    }}
                  />
                ) : null}
                <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "subject", subjectCode: subject.code })} type="button">이름·색</button>
                <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "books", subjectCode: subject.code })} type="button">교재 더하기</button>
                {subject.books.length > 0 ? (
                  <button aria-expanded={open} className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setShown({ ...shown, [subject.code]: !open })} type="button">
                    {open ? "교재 접기" : "교재 보기"}
                  </button>
                ) : null}
              </div>
              {open && subject.books.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className={`${TABLE_CLASS} min-w-[460px]`}>
                    <thead>
                      <tr>
                        <th className={`${TH_CLASS} w-16`}>순서</th>
                        <th className={TH_CLASS}>교재</th>
                        <th className={TH_CLASS}>하루 분량</th>
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
                              onMove={(delta) => {
                                const next = moved(subject.books.map((item) => item.id), bookIndex, delta);
                                if (next) void reorder(`/api/admin/subjects/${subject.code}/books/order`, next);
                              }}
                            />
                          </td>
                          <td className={`${TD_CLASS} whitespace-nowrap font-semibold`}>{book.label}</td>
                          <td className={`${TD_CLASS} text-slate-500`}>{series.dayWord} {book.days.length}개</td>
                          <td className={`${TD_CLASS} !pr-0 text-right`}>
                            <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "structure", subjectCode: subject.code, bookId: book.id })} type="button">
                              이름·하루 분량 고치기
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <button className={`btn-secondary ${SMALL_BUTTON}`} onClick={() => setDialog({ kind: "subject-new" })} type="button">{series.subjectWord} 더하기</button>

      {dialog?.kind === "subject-new" ? <SubjectDialog onClose={() => setDialog(null)} onSaved={saved} series={series} /> : null}
      {dialog?.kind === "subject" && dialogSubject ? <SubjectDialog onClose={() => setDialog(null)} onSaved={saved} series={series} subject={dialogSubject} /> : null}
      {dialog?.kind === "books" && dialogSubject ? <AddBooksDialog onClose={() => setDialog(null)} onSaved={saved} series={series} subject={dialogSubject} /> : null}
      {dialog?.kind === "structure" && dialogBook ? <StructureDialog book={dialogBook} onClose={() => setDialog(null)} onSaved={saved} series={series} /> : null}
    </div>
  );
}
