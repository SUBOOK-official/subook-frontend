import { Link } from "react-router-dom";
import { useIlseongData, useIlseongSales } from "../../lib/ilseongAdmin";
import { formatCount, formatEpochSeconds, serverCheckAge } from "../../lib/ilseongFormat";
import { homeTodos } from "../../lib/ilseongGuide";
import { ChevronRightIcon } from "../icons";
import { Badge, Disclosure, ErrorNote, Facts, LoadingNote, SMALL_BUTTON, Section, ilseongPath } from "./IlseongUi";

// 홈 — 들어오면 "지금 할 일"부터 보인다. 할 일은 화면이 있는 것을 보고 스스로 정한다(lib/ilseongGuide.js):
// 앱 서버 문제, 앱에 등록하지 못한 주문, 켜 둔 채 잊은 설정, 학습지마다 다음 단계.
// 그 아래에 하려는 일로 바로 가는 길과 숫자 몇 개.

const TODO_TONE = { red: "bg-rose-500", orange: "bg-amber-500", blue: "bg-brand" };

const SHORTCUTS = [
  { to: ilseongPath("books", "new"), title: "새 학습지를 내요", body: "이름과 과목을 정하고, 교재 PDF를 올리고, 사이트에서 팔기까지 차례로 안내해요." },
  { to: ilseongPath("users"), title: "학생 문의가 왔어요", body: "교재가 안 보인다, 새 기기에서 로그인이 안 된다, 교재를 열어 달라는 문의를 처리해요." },
  { to: ilseongPath("app-config"), title: "앱에 공지를 띄워요", body: "앱을 여는 학생 모두에게 알림을 보여 주거나, 점검하는 동안 앱을 막아요." },
];

const NUMBERS = [
  ["학생", "users", "명"],
  ["최근 7일에 공부한 학생", "activeLearners7d", "명"],
  ["교재가 등록된 학생", "bookOwners", "명"],
  ["사고 아직 앱에 로그인하지 않은 등록", "waitingPurchases", "건"],
];

export default function IlseongHome() {
  const overview = useIlseongData("/api/admin/overview");
  const catalog = useIlseongData("/api/admin/series");
  const config = useIlseongData("/api/admin/app-config");
  const system = useIlseongData("/api/admin/system", { refreshMs: 60_000 });
  const sales = useIlseongSales();

  const status = system.data;
  const age = status?.checkedAt ? serverCheckAge(status.checkedAt) : null;
  const loading = !catalog.data && catalog.loading;
  const todos = homeTodos({
    seriesList: catalog.data,
    sales: sales.data,
    system: status,
    config: config.data,
    serverStale: Boolean(age?.stale),
  });
  const firstError = catalog.error ?? overview.error ?? sales.error;

  return (
    <div className="space-y-4">
      {firstError ? (
        <ErrorNote
          error={firstError}
          onRetry={() => {
            void catalog.reload();
            void overview.reload();
            void sales.reload();
          }}
        />
      ) : null}

      <Section title="지금 할 일">
        {loading ? <LoadingNote /> : null}
        {!loading && todos.length === 0 ? <p className="text-sm text-slate-600">지금 할 일이 없어요. 모두 잘 돌아가고 있어요.</p> : null}
        {todos.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {todos.map((todo) => (
              <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0" key={todo.key}>
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${TODO_TONE[todo.tone]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-slate-900">{todo.text}</p>
                  {todo.hint ? <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{todo.hint}</p> : null}
                </div>
                {todo.action ? (
                  <Link className={`${todo.tone === "blue" ? "btn-primary !w-auto" : "btn-secondary"} ${SMALL_BUTTON}`} to={todo.action.to}>{todo.action.label}</Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="하려는 일 고르기">
        <ul className="divide-y divide-slate-100">
          {SHORTCUTS.map((entry) => (
            <li className="py-3.5 first:pt-0 last:pb-0" key={entry.title}>
              <Link className="group flex items-center gap-4" to={entry.to}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900 group-hover:text-brand">{entry.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{entry.body}</span>
                </span>
                <ChevronRightIcon className="shrink-0 text-slate-400 group-hover:text-brand" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {overview.data ? (
        <Section sub="관리자 계정과 탈퇴한 계정은 빼고 세요." title="숫자로 보기">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
            {NUMBERS.map(([label, key, unit]) => (
              <div key={key}>
                <dt className="text-[13px] text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {formatCount(overview.data[key])}
                  <span className="ml-0.5 text-sm font-semibold text-slate-400">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {status?.checkedAt ? (
        <Disclosure
          sub={age.stale ? `${age.minutes}분 전부터 점검 결과가 오지 않아요.` : status.ok ? `정상이에요. ${age.minutes}분 전에 확인했어요.` : "문제가 있어요. 개발자에게 알려 주세요."}
          title={<>앱 서버 <span className="ml-1 align-middle">{age.stale ? <Badge tone="orange">점검 멈춤</Badge> : status.ok ? <Badge tone="green">정상</Badge> : <Badge tone="red">확인 필요</Badge>}</span></>}
        >
          <div className="space-y-3">
            {(status.problems ?? []).length > 0 ? (
              <div className="notice-error space-y-1">
                {status.problems.map((problem) => <p key={problem}>{problem}</p>)}
              </div>
            ) : null}
            <p className="text-sm text-slate-500">개발자가 문제를 살필 때 보는 값이에요.</p>
            <Facts
              rows={[
                ["마지막 점검", `${formatEpochSeconds(status.checkedAt)} (${age.minutes}분 전)`],
                ["디스크", `${status.diskPercent ?? 0}% 씀`],
                ["남은 메모리", `${formatCount(status.memAvailableMb)}MB`],
                ["마지막 DB 백업", formatEpochSeconds(status.lastBackupAt)],
                ["서버 밖 백업", status.offsiteBackupAt ? formatEpochSeconds(status.offsiteBackupAt) : "아직 없음"],
                ["최근 5분 오류", `${formatCount(status.errorsLast5m)}번`],
                ["문제 알림", status.alerts === false ? "알림 주소가 없어 이 화면에서만 볼 수 있어요" : "켜져 있어요"],
                ["서버 판", <span className="font-mono text-[13px]" key="image">{status.image || "—"}</span>],
              ]}
            />
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}
