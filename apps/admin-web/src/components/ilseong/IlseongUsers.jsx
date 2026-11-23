import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ilseongAdmin, useIlseongData } from "../../lib/ilseongAdmin";
import { formatCount, formatDate, formatDateTime, platformLabel, providersLabel } from "../../lib/ilseongFormat";
import { ChevronLeftIcon, SearchIcon } from "../icons";
import IlseongGrantCard from "./IlseongGrantCard";
import IlseongOrders from "./IlseongOrders";
import {
  Badge,
  EmptyNote,
  ErrorNote,
  FIELD_CLASS,
  Facts,
  LoadingNote,
  ProductPickerDialog,
  SMALL_BUTTON,
  Section,
  SubjectDot,
  TABLE_CLASS,
  TD_CLASS,
  TH_CLASS,
  WarnNote,
  ilseongPath,
  useIlseongFeedback,
} from "./IlseongUi";

// 학생·문의 — 학생 문의에 답할 때 쓴다. 학생 찾기(기기·교재·진도, 기기 해제, 교재 직접 등록),
// 주문으로 확인하기(산 주문이 앱에 등록됐는지), 문의마다 무엇을 하면 되는지 적은 안내.
// 여기의 학생은 앱에 한 번이라도 로그인한 사람이다. 수북 회원 목록(고객 › 회원)과는 다른 목록이다: 앱 서버가 가진 앱 계정이다.
// 앱에 아직 로그인하지 않은 수북 회원은 여기에 없다. 그런 회원에게 교재를 미리 등록하는 일은 수북 회원 상세의
// 「일성월심 앱」 칸에서 한다(MemberAppSection, 앱 저장소 docs/adr/0038).

export default function IlseongUsers({ userId }) {
  return userId ? <UserDetail key={userId} userId={userId} /> : <UserList />;
}

function UserList() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [input]);

  const users = useIlseongData(`/api/admin/users?q=${encodeURIComponent(query)}`, { keepPrevious: true });
  const list = users.data;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
    <Section title="학생 찾기">
      <label className="relative block">
        <span className="sr-only">학생 찾기</span>
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          autoFocus
          className={`${FIELD_CLASS} !pl-10`}
          onChange={(event) => setInput(event.target.value)}
          placeholder="이름 또는 앱 회원 번호"
          type="search"
          value={input}
        />
      </label>
      <p className="mt-2 text-[13px] text-slate-500">
        앱에 한 번이라도 로그인한 학생이 나와요. 비워 두면 최근에 가입한 50명이 보여요.
      </p>

      <div className="mt-4">
        {!list ? <ErrorNote error={users.error} onRetry={() => void users.reload()} /> : null}
        {users.loading && !list ? <LoadingNote /> : null}
        {list && list.length === 0 ? <EmptyNote>찾는 학생이 없어요. 아직 앱에 로그인하지 않았을 수 있어요.</EmptyNote> : null}
        {list && list.length > 0 ? (
          <div className="overflow-x-auto">
            <table className={`${TABLE_CLASS} min-w-[540px]`}>
              <thead>
                <tr>
                  <th className={TH_CLASS}>번호</th>
                  <th className={TH_CLASS}>이름</th>
                  <th className={TH_CLASS}>로그인</th>
                  <th className={TH_CLASS}>가입한 날</th>
                  <th className={TH_CLASS} />
                </tr>
              </thead>
              <tbody>
                {list.map((user) => (
                  <tr
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    key={user.id}
                    onClick={() => navigate(ilseongPath("users", user.id))}
                  >
                    <td className={`${TD_CLASS} tabular-nums text-slate-400`}>{user.id}</td>
                    <td className={TD_CLASS}>
                      {/* 줄 전체를 누를 수 있지만, 키보드로도 들어갈 수 있게 이름은 링크로 둔다 */}
                      <Link className="font-semibold text-slate-900 hover:underline" onClick={(event) => event.stopPropagation()} to={ilseongPath("users", user.id)}>
                        {user.name ?? <span className="font-normal text-slate-400">이름 없음</span>}
                      </Link>
                    </td>
                    <td className={`${TD_CLASS} whitespace-nowrap`}>{providersLabel(user.providers)}</td>
                    <td className={`${TD_CLASS} whitespace-nowrap text-slate-500`}>{formatDate(user.createdAt)}</td>
                    <td className={`${TD_CLASS} !pr-0 text-right`}>
                      <span className="inline-flex gap-1.5">
                        {user.role === "ADMIN" ? <Badge tone="blue">관리자</Badge> : null}
                        {user.deletedAt ? <Badge tone="red">탈퇴</Badge> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Section>
        <IlseongOrders />
      </div>
      <HelpCases />
    </div>
  );
}

const CASES = [
  {
    q: "앱에 교재가 안 보인대요",
    a: (
      <>
        교재를 산 수북 계정으로 앱에 로그인해야 보여요. 학생을 찾아 '등록한 교재'를 보고, 비어 있으면 주문번호로 확인해 주세요.
        '앱 로그인을 기다려요'라고 나오면 산 계정이 아닌 다른 계정으로 로그인한 거예요.
      </>
    ),
  },
  {
    q: "새 기기에서 로그인이 안 된대요",
    a: <>기기 수가 꽉 찼거나, 기기를 바꿀 수 있는 횟수를 다 쓴 거예요. 한 계정은 기기 2대까지 쓰고, 학생이 스스로 기기를 바꾸는 것은 30일에 2번까지예요. 학생을 찾아 '로그인한 기기'에서 안 쓰는 기기를 [해제]해 주면 새 기기로 로그인할 수 있어요. 필기와 진도는 그대로 남아요.</>,
  },
  {
    q: "사지 않은 사람에게 교재를 열어 줘야 해요",
    a: (
      <>
        체험·교사용처럼 구매 없이 열어 줄 때예요. 앱에 로그인한 적이 있으면 학생을 찾아 [교재 직접 등록]을 눌러요.
        아직 로그인한 적이 없으면 <Link className="font-semibold text-brand hover:underline" to="/admin/members">고객 › 회원</Link>에서 찾아
        「일성월심 앱」 칸의 [앱 교재 미리 등록]을 눌러요.
      </>
    ),
  },
  {
    q: "환불했는데 앱에 교재가 그대로래요",
    a: (
      <>
        주문번호로 확인해 '환불로 끝났어요'가 아니면 [다시 처리]를 눌러 주세요. 바로 거두려면 학생을 찾아 '등록한 교재'에서 [교재 권한 거두기]를 눌러요.
        환불할 때 앱 교재를 어떻게 할지는 <Link className="font-semibold text-brand hover:underline" to={ilseongPath("app-config")}>앱 설정</Link>에서 정해요.
      </>
    ),
  },
];

function HelpCases() {
  return (
    <Section title="이럴 땐 이렇게">
      <dl className="space-y-4">
        {CASES.map((entry) => (
          <div key={entry.q}>
            <dt className="text-sm font-bold text-slate-900">{entry.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-slate-600">{entry.a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function UserDetail({ userId }) {
  const detail = useIlseongData(`/api/admin/users/${userId}`);
  const data = detail.data;
  const reload = () => void detail.reload({ quiet: true });

  return (
    <div className="space-y-4">
      <div>
        <Link className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-slate-500 hover:text-slate-800" to={ilseongPath("users")}>
          <ChevronLeftIcon size={14} />
          학생 찾기
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{data ? (data.user.name ?? "이름 없음") : `${userId}번 회원`}</h2>
          <span className="text-sm tabular-nums text-slate-400">{userId}번</span>
          {data?.user.role === "ADMIN" ? <Badge tone="blue">관리자</Badge> : null}
          {data?.user.deletedAt ? <Badge tone="red">{formatDate(data.user.deletedAt)} 탈퇴</Badge> : null}
        </div>
      </div>

      {!data ? <ErrorNote error={detail.error} onRetry={() => void detail.reload()} /> : null}
      {detail.loading && !data ? <LoadingNote /> : null}
      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section title="정보">
              <Facts
                rows={[
                  ["로그인", providersLabel(data.user.providers)],
                  ["수북 회원", data.subookMemberRef
                    ? <Link className="font-semibold text-brand hover:underline" key="member" to={`/admin/members?member=${data.subookMemberRef}`}>회원 화면에서 보기</Link>
                    : null],
                  ["가입한 날", formatDate(data.user.createdAt)],
                  ["마지막 공부", data.lastStudyDate ? formatDate(data.lastStudyDate) : "아직 없음"],
                  ["공부한 날", `${formatCount(data.studyDays)}일`],
                ]}
              />
            </Section>
            <Section sub="가진 교재의 하루 분량 가운데 끝낸 수" title="진도">
              <div className="space-y-3.5">
                {data.progress.filter((subject) => subject.ownedBooks > 0).length === 0 ? <p className="text-sm text-slate-400">등록된 교재가 없어요.</p> : null}
                {data.progress.filter((subject) => subject.ownedBooks > 0).map((subject) => (
                  <div key={subject.code}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-800"><SubjectDot color={subject.color} />{subject.name}</span>
                      <span className="tabular-nums text-slate-500">
                        {formatCount(subject.completedDays)} / {formatCount(subject.totalDays)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: subject.totalDays ? `${Math.round((subject.completedDays / subject.totalDays) * 100)}%` : 0,
                          background: subject.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
          <Devices devices={data.devices} max={data.maxDevices} onChanged={reload} swaps={data.deviceSwaps} userId={userId} />
          <Books detail={data} onChanged={reload} onGranted={detail.setData} userId={userId} />
        </>
      ) : null}
    </div>
  );
}

/**
 * 등록한 교재(구매로 자동 등록된 것, 직접 등록한 것)와 교재 직접 등록.
 * 앱에는 코드 입력이 없어서, 구매 없이 열어 줄 때(체험·교사용·문의 대응)는 여기서 등록한다(앱 저장소 docs/adr/0036).
 */
function Books({ userId, detail, onGranted, onChanged }) {
  const { confirm, toast } = useIlseongFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [picking, setPicking] = useState(false);

  // 직접 등록할 수 있는 학습지(서버는 학습지마다 딸린 상품 코드로 준다). 이미 다 가진 학습지는 고를 수 없다
  const products = detail.grantable ?? [];
  const open = products.filter((product) => !product.ownsAll);

  const grant = async (product) => {
    setPicking(false);
    setBusy(true);
    setError(null);
    try {
      onGranted(await ilseongAdmin.request("POST", `/api/admin/users/${userId}/books`, { productCode: product.code }));
      toast(`${product.name}의 교재를 등록했어요`);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (products.length > 1) {
      setPicking(true);
      return;
    }
    const ok = await confirm({
      title: "이 학생에게 교재를 등록할까요?",
      message:
        `${open[0].name}의 교재가 모두 이 학생의 책장에 등록돼요. 수북에서 산 사람은 자동으로 등록되니, 구매 없이 열어 줄 때만 써 주세요.\n등록한 뒤에는 아래 목록에서 다시 거둘 수 있어요.`,
      confirm: "등록",
    });
    if (ok) await grant(open[0]);
  };

  return (
    <Section
      right={
        detail.user.deletedAt || open.length === 0 ? null : (
          <button className={`btn-primary !w-auto ${SMALL_BUTTON}`} disabled={busy} onClick={() => void start()} type="button">
            교재 직접 등록
          </button>
        )
      }
      sub="수북에서 산 사람은 그 계정으로 앱에 로그인하면 자동으로 등록돼요."
      title="등록한 교재"
    >
      {picking ? (
        <ProductPickerDialog
          message={"고른 학습지의 교재가 모두 이 학생의 책장에 등록돼요. 구매 없이 열어 줄 때만 써 주세요.\n등록한 뒤에는 아래 목록에서 다시 거둘 수 있어요."}
          onClose={() => setPicking(false)}
          onPick={(code) => void grant(products.find((product) => product.code === code))}
          open
          products={products.map((product) => ({ code: product.code, name: product.name, disabled: product.ownsAll, note: product.ownsAll ? "이미 모두 등록돼 있어요" : null }))}
          title="어느 학습지의 교재를 등록할까요?"
        />
      ) : null}
      <ErrorNote className="mb-3" error={error} />
      {detail.codes.length === 0 ? (
        <EmptyNote>등록한 교재가 없어요.</EmptyNote>
      ) : (
        <div className="divide-y divide-slate-100">
          {detail.codes.map((code) => (
            <div className="py-4 first:pt-0 last:pb-0" key={code.id}>
              <IlseongGrantCard code={code} onChanged={onChanged} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// swaps = 학생이 스스로 기기를 바꾼 횟수와 한도(앱 저장소 ADR 0049). 여기서 해 주는 해제는 그 횟수에 넣지 않는다.
function Devices({ userId, devices, onChanged, swaps, max }) {
  const { confirm, toast } = useIlseongFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const unlink = async (device) => {
    const ok = await confirm({
      title: `'${device.name}'을 해제할까요?`,
      message: "그 기기에서는 로그아웃돼요. 필기와 진도는 계정에 남아 있어서, 다시 로그인하면 그대로 보여요.",
      confirm: "해제",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await ilseongAdmin.request("DELETE", `/api/admin/users/${userId}/devices/${device.id}`);
      toast("기기를 해제했어요");
      onChanged();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      sub={
        swaps
          ? `한 계정은 기기 ${max}대까지 쓰고, 학생이 스스로 기기를 바꿀 수 있는 횟수는 ${swaps.windowDays}일에 ${swaps.limit}번이에요. 횟수를 다 쓴 학생은 여기서 해제해 주면 새 기기로 로그인할 수 있어요. 여기서 한 해제는 횟수에 넣지 않아요.`
          : "기기 수를 넘어 새 기기로 로그인하지 못할 때 쓰지 않는 기기를 해제해요."
      }
      title="로그인한 기기"
    >
      <ErrorNote className="mb-3" error={error} />
      {devices.length === 0 ? (
        <EmptyNote>로그인한 기기가 없어요.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${TABLE_CLASS} min-w-[560px]`}>
            <thead>
              <tr>
                <th className={TH_CLASS}>기기</th>
                <th className={TH_CLASS}>종류</th>
                <th className={TH_CLASS}>처음 로그인</th>
                <th className={TH_CLASS}>마지막 사용</th>
                <th className={TH_CLASS} />
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td className={TD_CLASS}>{device.name}</td>
                  <td className={`${TD_CLASS} whitespace-nowrap`}>{platformLabel(device.platform)}</td>
                  <td className={`${TD_CLASS} whitespace-nowrap text-slate-500`}>{formatDate(device.createdAt)}</td>
                  <td className={`${TD_CLASS} whitespace-nowrap text-slate-500`}>{formatDateTime(device.lastSeenAt)}</td>
                  <td className={`${TD_CLASS} !pr-0 text-right`}>
                    <button className={`btn-danger-weak ${SMALL_BUTTON}`} disabled={busy} onClick={() => void unlink(device)} type="button">해제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {swaps ? (
        <p className="mt-3 text-sm text-slate-600">
          최근 {swaps.windowDays}일 동안 학생이 스스로 기기를 바꾼 횟수:{" "}
          <strong className="font-bold tabular-nums text-slate-900">{swaps.used}번</strong> / {swaps.limit}번
          {swaps.nextAt ? ` · ${formatDateTime(swaps.nextAt)}부터 학생이 다시 바꿀 수 있어요` : ""}
        </p>
      ) : null}
      {swaps && swaps.used >= swaps.limit ? (
        <WarnNote className="mt-2">횟수를 다 쓴 계정이에요. 기기를 자주 바꾸는 까닭을 물어본 뒤에 해제해 주세요. 한 계정을 여러 사람이 돌려 쓰면 이렇게 돼요.</WarnNote>
      ) : null}
    </Section>
  );
}
