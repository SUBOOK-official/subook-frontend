import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import AdminQueryState from "../components/AdminQueryState";
import { BoxIcon, CameraIcon, CardIcon, ChevronRightIcon, ClockIcon, CoinIcon, MessageIcon, PlusIcon, ReceiptIcon, SearchIcon, TruckIcon } from "../components/icons";
import { useAdminBadgeCounts, refreshAdminBadgeCounts } from "../lib/useAdminBadgeCounts";
import { useAdminOperations } from "../lib/useAdminOperations";
import { toKstInput } from "../lib/adminDateTime";

// 하루 업무 순서: 주문(입금 확인 → 출고) → 매입(수거 접수 → 검수·등록) → 정산
const TASKS = [
  { label: "입금 확인", countKey: "ordersPending", to: "/admin/orders?status=pending", unit: "주문", icon: CardIcon },
  { label: "출고 대기", countKey: "ordersPreparing", to: "/admin/orders?view=fulfillment", unit: "주문", icon: TruckIcon },
  { label: "수거 접수", countKey: "pickups", to: "/admin/pickups?status=pending", unit: "신청", icon: BoxIcon },
  { label: "검수·등록", countKey: "inspection", to: "/admin/pickups?tab=inspection", unit: "수거 건", icon: SearchIcon },
  { label: "정산 지급", countKey: "settlements", to: "/admin/settlements", unit: "미지급 원장", icon: CoinIcon },
];

const QUICK_ACTIONS = [
  { label: "상품 등록", to: "/admin/register", icon: PlusIcon },
  { label: "상세 사진 촬영", to: "/admin/photo-intake", icon: CameraIcon },
  { label: "환불 신청 확인", to: "/admin/orders?view=refunds", icon: ReceiptIcon },
  { label: "문의 등록·응대", to: "/admin/cs", icon: MessageIcon },
  { label: "지급 후 환불 확인", to: "/admin/settlement-exceptions", icon: CoinIcon },
  { label: "작업 결과 확인", to: "/admin/work-history", icon: ClockIcon },
];

const todayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" });

function elapsed(value) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value)) / 3600000));
  return hours >= 24 ? Math.floor(hours / 24) + "일 경과" : hours + "시간 경과";
}

export default function AdminDashboardPage() {
  const counts = useAdminBadgeCounts();
  const queue = useAdminOperations("queue");

  const values = TASKS.map((task) => counts[task.countKey]);
  const allLoaded = values.every((value) => value != null);
  const total = allLoaded ? values.reduce((sum, value) => sum + value, 0) : null;
  let headline = <>처리할 일을 확인하고 있어요</>;
  if (counts.error && !allLoaded) headline = <>업무 건수를 불러오지 못했어요</>;
  else if (total === 0) headline = <>지금 처리할 일이 없어요</>;
  else if (total != null) headline = <>지금 처리할 일이 <span className="text-blue-600">{total.toLocaleString("ko-KR")}건</span> 있어요</>;

  return (
    <AdminShell
      actions={
        <button className="btn-secondary !py-2 text-[13px]" onClick={() => { void refreshAdminBadgeCounts(); queue.refresh(); }} type="button">
          새로고침
        </button>
      }
      activeModule="overview"
      title="오늘 할 일"
    >
      <section aria-label="처리 대기 업무" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <p className="text-sm font-medium text-slate-500">{todayFormatter.format(new Date())}</p>
        <p className="mt-1 text-[22px] font-bold tracking-tight text-slate-900 sm:text-[26px]">{headline}</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {TASKS.map((task) => {
            const Icon = task.icon;
            const count = counts[task.countKey];
            const hasWork = count != null && count > 0;
            return (
              <Link
                className="flex min-w-0 flex-col rounded-xl bg-slate-100 px-4 py-4 transition-colors hover:bg-slate-200"
                key={task.countKey}
                to={task.to}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-600">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${hasWork ? "bg-blue-100 text-blue-600" : "bg-white text-slate-400"}`}>
                    <Icon size={15} />
                  </span>
                  {task.label}
                </span>
                <span className="mt-3 flex items-baseline gap-1.5">
                  <span className={`text-[28px] font-bold leading-none tabular-nums tracking-tight ${hasWork ? "text-slate-900" : "text-slate-400"}`}>
                    {count == null ? "—" : count.toLocaleString("ko-KR")}
                  </span>
                  <span className="text-xs text-slate-500">{count == null ? (counts.error ? "조회 실패" : "조회 중") : task.unit}</span>
                </span>
                <span className={`mt-3 inline-flex items-center gap-0.5 text-xs font-semibold ${hasWork ? "text-blue-600" : "text-slate-400"}`}>
                  {hasWork ? "처리하러 가기" : "목록 보기"}
                  <ChevronRightIcon size={13} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-7">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">먼저 확인할 업무</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
              {queue.data ? queue.data.total_count + "건" : "—"}
            </span>
          </div>
          <div className="px-2 pb-2 sm:px-4">
            <AdminQueryState empty={!queue.data?.items?.length} error={queue.error} loading={queue.loading} onRetry={queue.refresh}>
              <ul>
                {queue.data?.items.map((task) => (
                  <li key={task.id}>
                    <Link className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50" to={task.href}>
                      <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${task.priority === 1 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"}`}>
                        {task.category}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">{task.title}</span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-semibold text-slate-600">{elapsed(task.since)}</span>
                        <span className="block text-[11px] tabular-nums text-slate-400">{toKstInput(task.since).replace("T", " ")}</span>
                      </span>
                      <ChevronRightIcon className="shrink-0 text-slate-300" size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </AdminQueryState>
          </div>
          <div className="border-t border-slate-100 px-5 py-3.5 text-xs leading-5 text-slate-500 sm:px-7">
            <p>출고·수거 접수 2일, 검수 7일 이상 대기한 건과 미처리 환불을 표시합니다. 알림 실패는 최근 24시간 기준입니다.</p>
            {queue.data?.total_count > 30 ? <p>우선순위·경과시간 순 상위 30건입니다. 각 업무 메뉴에서 전체 대상을 확인하세요.</p> : null}
            {counts.updatedAt ? <p className="text-slate-400">업무 건수 갱신 {toKstInput(counts.updatedAt).replace("T", " ")}</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">빠른 작업</h2>
          <ul className="-mx-2 mt-2 grid grid-cols-2 xl:grid-cols-1">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.to}>
                  <Link className="flex items-center gap-3 rounded-xl px-2 py-2 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-50" to={action.to}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-500">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{action.label}</span>
                    <ChevronRightIcon className="shrink-0 text-slate-300" size={15} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
