import { useCallback, useEffect, useState } from "react";
import AdminShell from "../components/AdminShell";
import AdminDialog from "../components/AdminDialog";
import { BusyText, InlineLoading } from "../components/Loading";
import { CheckIcon, CloseIcon, PlusIcon } from "../components/icons";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import {
  STAFF_ID_HINT,
  STAFF_PASSWORD_MIN_LENGTH,
  generateStaffPassword,
  isValidStaffId,
  normalizeStaffId,
  staffPasswordProblem,
} from "../../api/_lib/staffAccount.js";

// 직원 계정 — 교재 등록 담당(알바)에게 줄 로그인 계정을 만들고 관리한다.
// 계정이 할 수 있는 일은 서버(DB)에서 정해져 있다: 상품 등록 화면과 그 화면이 쓰는 요청만.
// 비밀번호는 이 화면(브라우저)에서 정하고, 만든 직후 한 번만 보여 준다.

const CAN_DO = ["도착한 수거 건 고르기", "교재 검색 · 신규 교재 등록", "등급 · 가격 · 보관 위치 입력", "표지 · 상세 사진 올리기"];
const CANNOT_DO = ["주문 · 배송 · 환불", "회원 정보 · 정산 · 계좌", "쿠폰 · 홈 화면 · 공지", "등록된 상품 수정 · 삭제"];

const whenFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : whenFormatter.format(date);
}

async function callStaffApi(method, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
  let response;
  try {
    response = await fetch("/api/admin/staff-accounts", {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error || `요청을 처리하지 못했어요 (HTTP ${response.status}).`);
  }
  return json;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// 비밀번호 입력 — 남에게 건넬 값이라 가리지 않고 보여 준다. 브라우저가 내 비밀번호로 저장하지 않게 text로 둔다.
function PasswordField({ id, value, onChange, disabled }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label" htmlFor={id}>비밀번호</label>
        <button
          className="text-[13px] font-semibold text-brand hover:underline disabled:opacity-50"
          disabled={disabled}
          onClick={() => onChange(generateStaffPassword())}
          type="button"
        >
          자동으로 만들기
        </button>
      </div>
      <input
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="input-base font-mono tracking-wide"
        data-1p-ignore="true"
        data-lpignore="true"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`영문 + 숫자 ${STAFF_PASSWORD_MIN_LENGTH}자 이상`}
        spellCheck={false}
        type="text"
        value={value}
      />
    </div>
  );
}

// 만든 직후(또는 비밀번호를 바꾼 직후) 한 번만 보여 주는 전달용 정보
function HandoverCard({ loginId, password }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = `${window.location.origin}/admin/login`;
  const handoverText = `수북 교재 등록 계정\n로그인 주소: ${loginUrl}\n아이디: ${loginId}\n비밀번호: ${password}`;

  const handleCopy = async () => {
    setCopied(await copyText(handoverText));
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4 px-6 py-5">
      <dl className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4">
        {[
          ["로그인 주소", loginUrl],
          ["아이디", loginId],
          ["비밀번호", password],
        ].map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 py-3" key={label}>
            <dt className="shrink-0 text-[13px] font-medium text-slate-500">{label}</dt>
            <dd className="min-w-0 break-all text-right font-mono text-[15px] font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <button className="btn-primary" onClick={handleCopy} type="button">
        {copied ? (
          <span className="inline-flex items-center gap-1.5"><CheckIcon size={16} /> 복사했어요</span>
        ) : (
          "아이디와 비밀번호 복사"
        )}
      </button>
      <p className="text-[13px] leading-relaxed text-slate-500">
        비밀번호는 이 창을 닫으면 다시 볼 수 없어요. 잊어버리면 목록에서 비밀번호를 새로 정하면 돼요.
      </p>
    </div>
  );
}

function CreateDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ displayName: "", loginId: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({ displayName: "", loginId: "", password: "" });
      setError("");
      setCreated(null);
    }
  }, [open]);

  const loginId = normalizeStaffId(form.loginId);
  const idProblem = form.loginId && !isValidStaffId(loginId) ? `아이디는 ${STAFF_ID_HINT}로 정해 주세요.` : "";
  const passwordProblem = form.password ? staffPasswordProblem(form.password) : "";
  const canSubmit = form.displayName.trim() && isValidStaffId(loginId) && form.password && !passwordProblem;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await callStaffApi("POST", {
        action: "create",
        displayName: form.displayName.trim(),
        loginId,
        password: form.password,
      });
      setCreated({ loginId: result.account.loginId, password: form.password });
      onCreated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <AdminDialog
        footer={<div className="flex justify-end"><button className="btn-secondary" onClick={onClose} type="button">닫기</button></div>}
        onClose={onClose}
        open={open}
        size="sm"
        title="계정을 만들었어요"
      >
        <HandoverCard loginId={created.loginId} password={created.password} />
      </AdminDialog>
    );
  }

  return (
    <AdminDialog busy={busy} onClose={onClose} open={open} size="sm" title="직원 계정 만들기">
      <form className="space-y-4 px-6 py-5" onSubmit={handleSubmit}>
        <div>
          <label className="label" htmlFor="staff-display-name">이름</label>
          <input
            autoComplete="off"
            className="input-base"
            disabled={busy}
            id="staff-display-name"
            maxLength={30}
            onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
            placeholder="누구의 계정인지 (예: 김수북)"
            value={form.displayName}
          />
        </div>
        <div>
          <label className="label" htmlFor="staff-login-id">아이디</label>
          <input
            aria-describedby="staff-login-id-hint"
            aria-invalid={Boolean(idProblem)}
            autoCapitalize="off"
            autoComplete="off"
            className="input-base"
            disabled={busy}
            id="staff-login-id"
            maxLength={20}
            onChange={(event) => setForm((prev) => ({ ...prev, loginId: event.target.value }))}
            placeholder="예: alba01"
            spellCheck={false}
            value={form.loginId}
          />
          <p className={`mt-1.5 text-[13px] ${idProblem ? "text-rose-600" : "text-slate-400"}`} id="staff-login-id-hint">
            {idProblem || STAFF_ID_HINT}
          </p>
        </div>
        <div>
          <PasswordField
            disabled={busy}
            id="staff-password"
            onChange={(password) => setForm((prev) => ({ ...prev, password }))}
            value={form.password}
          />
          {passwordProblem ? <p className="mt-1.5 text-[13px] text-rose-600">{passwordProblem}</p> : null}
        </div>
        {error ? <p className="notice-error" role="alert">{error}</p> : null}
        <button className="btn-primary" disabled={!canSubmit || busy} type="submit">
          {busy ? <BusyText>만드는 중...</BusyText> : "계정 만들기"}
        </button>
      </form>
    </AdminDialog>
  );
}

function PasswordDialog({ account, onClose }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPassword("");
    setError("");
    setDone(false);
  }, [account?.userId]);

  const passwordProblem = password ? staffPasswordProblem(password) : "";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password || passwordProblem || busy) return;
    setBusy(true);
    setError("");
    try {
      await callStaffApi("POST", { action: "set_password", userId: account.userId, password });
      setDone(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (done && account) {
    return (
      <AdminDialog
        footer={<div className="flex justify-end"><button className="btn-secondary" onClick={onClose} type="button">닫기</button></div>}
        onClose={onClose}
        open
        size="sm"
        title="비밀번호를 바꿨어요"
      >
        <HandoverCard loginId={account.loginId} password={password} />
      </AdminDialog>
    );
  }

  return (
    <AdminDialog busy={busy} onClose={onClose} open={Boolean(account)} size="sm" title="비밀번호 바꾸기">
      {account ? (
        <form className="space-y-4 px-6 py-5" onSubmit={handleSubmit}>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{account.displayName || account.loginId}</span> ({account.loginId}) 계정의 새 비밀번호를 정해요.
          </p>
          <div>
            <PasswordField disabled={busy} id="staff-new-password" onChange={setPassword} value={password} />
            {passwordProblem ? <p className="mt-1.5 text-[13px] text-rose-600">{passwordProblem}</p> : null}
          </div>
          {error ? <p className="notice-error" role="alert">{error}</p> : null}
          <button className="btn-primary" disabled={!password || Boolean(passwordProblem) || busy} type="submit">
            {busy ? <BusyText>바꾸는 중...</BusyText> : "비밀번호 바꾸기"}
          </button>
        </form>
      ) : null}
    </AdminDialog>
  );
}

function DeleteDialog({ account, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setError(""); }, [account?.userId]);

  const handleDelete = async () => {
    setBusy(true);
    setError("");
    try {
      await callStaffApi("POST", { action: "delete", userId: account.userId });
      onDeleted();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      busy={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={onClose} type="button">취소</button>
          <button className="btn-danger" disabled={busy} onClick={handleDelete} type="button">
            {busy ? <BusyText>삭제 중...</BusyText> : "계정 삭제"}
          </button>
        </div>
      }
      onClose={onClose}
      open={Boolean(account)}
      size="sm"
      title="계정을 삭제할까요?"
    >
      {account ? (
        <div className="space-y-3 px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">{account.displayName || account.loginId}</span> ({account.loginId}) 계정을 삭제하면
            지금 로그인해 있는 화면도 바로 막히고, 다시 로그인할 수 없어요.
          </p>
          <p className="text-[13px] text-slate-500">이 계정으로 등록한 교재 {account.registered.total.toLocaleString("ko-KR")}권은 그대로 남아요.</p>
          {error ? <p className="notice-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </AdminDialog>
  );
}

function AccountRow({ account, onChangePassword, onDelete }) {
  const { registered } = account;
  const facts = [
    registered.lastAt ? `마지막 등록 ${formatWhen(registered.lastAt)}` : "아직 등록한 교재 없음",
    account.lastSignInAt ? `마지막 로그인 ${formatWhen(account.lastSignInAt)}` : "아직 로그인한 적 없음",
  ];

  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-slate-900">{account.displayName || account.loginId}</span>
          <span className="font-mono text-[13px] text-slate-500">{account.loginId}</span>
        </p>
        <p className="mt-1 text-sm text-slate-600">
          오늘 <span className="font-bold tabular-nums text-slate-900">{registered.today.toLocaleString("ko-KR")}</span>권
          <span className="mx-1.5 text-slate-300">·</span>
          전체 <span className="font-bold tabular-nums text-slate-900">{registered.total.toLocaleString("ko-KR")}</span>권 등록
        </p>
        <p className="mt-0.5 text-[13px] text-slate-400">{facts.join(" · ")}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button className="btn-secondary !px-3.5 !py-2 text-[13px]" onClick={() => onChangePassword(account)} type="button">
          비밀번호 바꾸기
        </button>
        <button className="btn-danger-weak !px-3.5 !py-2 text-[13px]" onClick={() => onDelete(account)} type="button">
          삭제
        </button>
      </div>
    </li>
  );
}

function AdminStaffAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      setLoading(false);
      return;
    }
    setError("");
    try {
      const result = await callStaffApi("GET");
      setAccounts(result.accounts || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminShell
      actions={
        <button className="btn-primary !w-auto gap-1.5 !px-4 !py-2.5" onClick={() => setIsCreateOpen(true)} type="button">
          <PlusIcon size={16} />
          직원 계정 만들기
        </button>
      }
      activeModule="staff"
      title="직원 계정"
    >
      <section className="card">
        <h2 className="text-[15px] font-bold text-slate-900">교재 등록 담당 계정</h2>
        <p className="mt-1 text-sm text-slate-500">
          상품 등록 화면만 열리는 계정이에요. 셀러 전화번호는 끝 4자리만 보여요.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1.5">
            {CAN_DO.map((text) => (
              <li className="flex items-center gap-2 text-sm text-slate-700" key={text}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-brand"><CheckIcon size={12} /></span>
                {text}
              </li>
            ))}
          </ul>
          <ul className="space-y-1.5">
            {CANNOT_DO.map((text) => (
              <li className="flex items-center gap-2 text-sm text-slate-500" key={text}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><CloseIcon size={12} /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400"><InlineLoading /></p>
        ) : error ? (
          <div className="space-y-3 px-5 py-8 text-center">
            <p className="text-sm font-medium text-rose-600" role="alert">{error}</p>
            <button className="btn-secondary !px-4 !py-2 text-[13px]" onClick={() => { setLoading(true); void load(); }} type="button">
              다시 불러오기
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-base font-bold text-slate-900">아직 직원 계정이 없어요</p>
            <p className="mt-1 text-sm text-slate-500">계정을 만들면 아이디와 비밀번호를 바로 건넬 수 있어요.</p>
            <button className="btn-primary mt-5 !w-auto !px-5" onClick={() => setIsCreateOpen(true)} type="button">
              직원 계정 만들기
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <AccountRow account={account} key={account.userId} onChangePassword={setPasswordTarget} onDelete={setDeleteTarget} />
            ))}
          </ul>
        )}
      </section>

      <CreateDialog onClose={() => setIsCreateOpen(false)} onCreated={() => void load()} open={isCreateOpen} />
      <PasswordDialog account={passwordTarget} onClose={() => setPasswordTarget(null)} />
      <DeleteDialog
        account={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); void load(); }}
      />
    </AdminShell>
  );
}

export default AdminStaffAccountsPage;
