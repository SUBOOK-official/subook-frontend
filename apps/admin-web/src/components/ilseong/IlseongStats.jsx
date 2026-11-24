import { useState } from "react";
import { useIlseongData } from "../../lib/ilseongAdmin";
import { formatCount, olderServerError } from "../../lib/ilseongFormat";
import {
  DEFAULT_STATS_PERIOD,
  STATS_PERIODS,
  barPercent,
  formatStatsDay,
  formatStudyTime,
  maxOf,
  newestFirst,
  percentOf,
  studentSteps,
} from "../../lib/ilseongStats";
import { ChevronRightIcon } from "../icons";
import { Badge, EmptyNote, ErrorNote, LoadingNote, SMALL_BUTTON, Section, TABLE_CLASS, TD_CLASS, TH_CLASS } from "./IlseongUi";

// 통계 — 교재를 산 학생이 앱을 실제로 쓰는지 한눈에 본다(앱 서버 GET /api/admin/stats?days=).
//   맨 위   가입 → 교재 등록 → 필기 → 완료까지 온 학생 수. 지금까지의 숫자라 기간과 관계없다
//   기간    7·30·90일을 고르면 그 기간의 숫자 네 개와 날짜별 표가 바뀐다
//   교재별  교재마다 등록한 학생, 펼쳐 본 학생, 끝낸 Day. 지금까지의 숫자다
// 무엇을 세는지는 앱 서버가 정한다. 화면은 읽는 말로 바꾸기만 한다(lib/ilseongStats.js).

// 날짜별 표는 길어서(90일이면 90줄) 처음에는 이만큼만 보여 준다
const FIRST_DAYS = 14;

export default function IlseongStats() {
  const [days, setDays] = useState(DEFAULT_STATS_PERIOD);
  // 기간을 바꾸는 동안 앞서 받은 숫자를 그대로 보여 준다(화면이 비었다 차지 않게)
  const stats = useIlseongData(`/api/admin/stats?days=${days}`, { keepPrevious: true });
  const data = stats.data;

  return (
    <div className="space-y-4">
      <ErrorNote error={olderServerError(stats.error)} onRetry={() => void stats.reload()} />
      {stats.loading && !data ? <LoadingNote /> : null}
      {data ? (
        <>
          <StudentSteps funnel={data.funnel} />
          <Period data={data} days={days} loading={stats.loading} onPick={setDays} onReload={() => void stats.reload()} />
          <Books books={data.books ?? []} />
          <p className="px-1 text-[13px] leading-relaxed text-slate-500">
            공부한 학생은 그날 완료를 기록했거나, 교재·노트를 열어 봤거나, 필기를 한 학생이에요. 공부 시간은 2026년 11월 24일 앱 업데이트 뒤부터 잰 것이라, 그 전 날짜는 0분으로 보여요.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Count({ value, unit }) {
  return (
    <>
      {formatCount(value)}
      <span className="ml-0.5 text-sm font-semibold text-slate-400">{unit}</span>
    </>
  );
}

/** 표 안의 숫자. 0은 흐리게 써서 값이 있는 날이 눈에 들어오게 한다. */
function Cell({ value, unit }) {
  const number = Number(value || 0);
  return <span className={number > 0 ? "" : "text-slate-400"}>{formatCount(number)}{unit}</span>;
}

// ── 가입부터 완료까지 ────────────────────────────────────────

function StudentSteps({ funnel }) {
  const steps = studentSteps(funnel);
  return (
    <Section
      sub="지금까지 가입한 학생 가운데 몇 명이 교재를 등록하고, 필기를 하고, 완료를 기록했는지예요. 관리자 계정과 탈퇴한 계정은 빼고 세요."
      title="가입부터 완료까지"
    >
      <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
        {steps.map((step, index) => (
          <li className="relative rounded-xl bg-slate-50 px-4 py-3.5" key={step.key}>
            {/* 네 칸이 한 줄에 놓일 때만 칸 사이에 화살표를 둔다(아이콘은 제 style로 보이기를 정해서 감싼 쪽에서 숨긴다) */}
            {index > 0 ? (
              <span aria-hidden="true" className="absolute -left-5 top-1/2 hidden -translate-y-1/2 text-slate-300 lg:flex">
                <ChevronRightIcon size={16} />
              </span>
            ) : null}
            <p className="text-[13px] text-slate-500">{step.label}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900"><Count unit="명" value={step.count} /></p>
            {step.share === null ? null : <p className="mt-0.5 text-[13px] tabular-nums text-slate-500">앞 단계의 {step.share}%</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ── 기간 ─────────────────────────────────────────────────────

function Period({ data, days, loading, onPick, onReload }) {
  const [allDays, setAllDays] = useState(false);
  const recent = data.recent ?? {};
  const daily = newestFirst(data.daily);
  const rows = allDays ? daily : daily.slice(0, FIRST_DAYS);
  const topActive = maxOf(daily, "activeUsers");
  // 받아 온 숫자가 어느 기간의 것인지는 앱 서버의 답(data.days)을 따른다. 기간을 막 바꿨을 때는 고른 값과 잠깐 다르다
  const shownDays = data.days ?? days;
  const tiles = [
    ["새로 가입한 학생", <Count key="new" unit="명" value={recent.newUsers} />],
    ["공부한 학생", <Count key="active" unit="명" value={recent.activeUsers} />],
    ["공부 시간", formatStudyTime(recent.studySeconds)],
    ["끝낸 Day 수", <Count key="done" unit="개" value={recent.completedDays} />],
  ];

  return (
    <Section
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="기간" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="group">
            {STATS_PERIODS.map((period) => {
              const active = days === period;
              return (
                <button
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${active ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`}
                  key={period}
                  onClick={() => onPick(period)}
                  type="button"
                >
                  {period}일
                </button>
              );
            })}
          </div>
          <button className={`btn-secondary ${SMALL_BUTTON}`} disabled={loading} onClick={onReload} type="button">
            새로고침
          </button>
        </div>
      }
      title={`최근 ${shownDays}일`}
    >
      <div aria-busy={loading} className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="text-[15px] font-bold text-slate-900">날짜별</h3>
          {daily.length === 0 ? (
            <EmptyNote>이 기간의 기록이 없어요.</EmptyNote>
          ) : (
            <>
              <div className="mt-2 overflow-x-auto">
                <table className={`${TABLE_CLASS} min-w-[680px]`}>
                  <thead>
                    <tr>
                      <th className={TH_CLASS}>날짜</th>
                      <th className={TH_CLASS}>새로 가입</th>
                      <th className={TH_CLASS}>공부한 학생</th>
                      <th className={TH_CLASS}>끝낸 Day</th>
                      <th className={`${TH_CLASS} !pr-0`}>공부 시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.date}>
                        <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}>
                          {formatStatsDay(row.date)}
                          {row.date === data.today ? <span className="ml-2"><Badge tone="blue">오늘</Badge></span> : null}
                        </td>
                        <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}><Cell unit="명" value={row.newUsers} /></td>
                        <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}>
                          <span className="flex items-center gap-3">
                            <span className="w-14 shrink-0"><Cell unit="명" value={row.activeUsers} /></span>
                            <span aria-hidden="true" className="block h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-brand" style={{ width: `${barPercent(row.activeUsers, topActive)}%` }} />
                            </span>
                          </span>
                        </td>
                        <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}><Cell unit="개" value={row.completedDays} /></td>
                        <td className={`${TD_CLASS} whitespace-nowrap !pr-0 tabular-nums`}>
                          <span className={Number(row.studySeconds || 0) > 0 ? "" : "text-slate-400"}>{formatStudyTime(row.studySeconds)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {daily.length > FIRST_DAYS ? (
                <button className={`btn-secondary mt-3 ${SMALL_BUTTON}`} onClick={() => setAllDays((value) => !value)} type="button">
                  {allDays ? `최근 ${FIRST_DAYS}일만 보기` : `나머지 ${daily.length - FIRST_DAYS}일도 보기`}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── 교재별 ───────────────────────────────────────────────────

function Books({ books }) {
  return (
    <Section
      sub="지금까지의 숫자예요. 학생이 한 명이라도 등록한 교재만 보여요. 펼쳐 본 학생은 그 교재를 열어 봤거나 필기를 한 학생이에요."
      title="교재별"
    >
      {books.length === 0 ? (
        <EmptyNote>아직 교재를 등록한 학생이 없어요.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[640px]`}>
            <thead>
              <tr>
                <th className={TH_CLASS}>교재</th>
                <th className={TH_CLASS}>등록한 학생</th>
                <th className={TH_CLASS}>펼쳐 본 학생</th>
                <th className={`${TH_CLASS} !pr-0`}>끝낸 Day</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => {
                const share = percentOf(book.readers, book.owners);
                return (
                  <tr key={book.bookId}>
                    <td className={`${TD_CLASS} font-semibold`}>{book.label}</td>
                    <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}><Cell unit="명" value={book.owners} /></td>
                    <td className={`${TD_CLASS} whitespace-nowrap tabular-nums`}>
                      <Cell unit="명" value={book.readers} />
                      {share === null ? null : <span className="ml-2 text-[13px] text-slate-500">등록한 학생의 {share}%</span>}
                    </td>
                    <td className={`${TD_CLASS} whitespace-nowrap !pr-0 tabular-nums`}><Cell unit="개" value={book.completedDays} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
