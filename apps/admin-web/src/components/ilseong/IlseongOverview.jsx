import { Link } from "react-router-dom";
import { useIlseongData } from "../../lib/ilseongAdmin";
import { formatCount, formatEpochSeconds, serverCheckAge } from "../../lib/ilseongFormat";
import { Badge, ErrorNote, Facts, LoadingNote, Section, WarnNote, ilseongPath } from "./IlseongUi";

// 요약 — 앱 학생 수·공부 현황·코드 수와 앱 서버 상태.

const TILES = [
  ["학생", "users", "명"],
  ["최근 7일 가입", "newUsers7d", "명"],
  ["최근 7일 공부한 학생", "activeLearners7d", "명"],
  ["오늘 끝낸 DAY", "completionsToday", "개"],
  ["등록된 코드", "codesRedeemed", "개"],
  ["등록 전 코드", "codesWaiting", "개"],
];

export default function IlseongOverview() {
  const overview = useIlseongData("/api/admin/overview");
  const numbers = overview.data;

  return (
    <div className="space-y-4">
      {!numbers ? <ErrorNote error={overview.error} onRetry={() => void overview.reload()} /> : null}
      {overview.loading && !numbers ? <LoadingNote /> : null}
      {numbers ? (
        <>
          <div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {TILES.map(([label, key, unit]) => (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4" key={key}>
                  <dt className="text-[13px] font-medium text-slate-500">{label}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                    {formatCount(numbers[key])}
                    <span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[13px] text-slate-400">관리자 계정과 탈퇴한 계정은 빼고 세요.</p>
          </div>

          <ServerStatus />

          <Section title="자주 하는 일">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["users", "앱에 교재가 안 보인다고 할 때", "앱 회원에서 학생을 찾아 등록한 교재를 봐요. 구매 없이 열어 줄 때는 그 화면에서 교재를 직접 등록해요."],
                ["sales", "구매한 주문이 앱에 등록됐는지 볼 때", "수북 판매 연결에서 주문번호로 찾아요. 구매한 수북 계정으로 앱에 로그인하면 등록돼요."],
                ["users", "기기를 바꿔 로그인이 안 될 때", "앱 회원에서 학생을 찾아 쓰지 않는 기기를 해제해요."],
              ].map(([view, heading, body]) => (
                <Link className="rounded-xl bg-slate-50 px-4 py-3.5 transition-colors hover:bg-slate-100" key={heading} to={ilseongPath(view)}>
                  <p className="text-sm font-bold text-slate-900">{heading}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
                </Link>
              ))}
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}

/** 운영 서버가 5분마다 스스로 점검한 결과. 1분마다 다시 읽는다. */
function ServerStatus() {
  const system = useIlseongData("/api/admin/system", { refreshMs: 60_000 });
  const status = system.data;
  if (!status) return null;

  if (!status.checkedAt) {
    return (
      <Section right={<Badge>정보 없음</Badge>} title="앱 서버 상태">
        <p className="text-sm text-slate-500">이 서버에는 점검이 켜져 있지 않아요(개발용이거나 아직 설정 전).</p>
      </Section>
    );
  }

  const { minutes, stale } = serverCheckAge(status.checkedAt);
  const problems = status.problems ?? [];
  const badge = stale ? <Badge tone="orange">점검 멈춤</Badge> : status.ok ? <Badge tone="green">정상</Badge> : <Badge tone="red">확인 필요</Badge>;

  return (
    <Section right={badge} title="앱 서버 상태">
      <div className="space-y-3">
        {stale ? (
          <WarnNote>
            {minutes}분 전부터 점검 결과가 오지 않아요. 서버가 꺼졌거나 점검이 멈췄을 수 있어요. 개발자에게 알려 주세요.
          </WarnNote>
        ) : null}
        {problems.length > 0 ? (
          <div className="notice-error space-y-1">
            {problems.map((problem) => <p key={problem}>{problem}</p>)}
          </div>
        ) : null}
        {status.alerts === false ? (
          <WarnNote>알림 주소가 없어서 문제가 생겨도 알림이 가지 않아요. 이 화면에서만 볼 수 있어요.</WarnNote>
        ) : null}
        <Facts
          rows={[
            ["마지막 점검", `${formatEpochSeconds(status.checkedAt)} (${minutes}분 전)`],
            ["디스크", `${status.diskPercent ?? 0}% 씀`],
            ["남은 메모리", `${formatCount(status.memAvailableMb)}MB`],
            ["마지막 DB 백업", formatEpochSeconds(status.lastBackupAt)],
            ["서버 밖 백업", status.offsiteBackupAt ? formatEpochSeconds(status.offsiteBackupAt) : "아직 없음"],
            ["최근 5분 오류", `${formatCount(status.errorsLast5m)}번`],
            ["서버 판", <span className="font-mono text-[13px]" key="image">{status.image || "—"}</span>],
          ]}
        />
      </div>
    </Section>
  );
}
