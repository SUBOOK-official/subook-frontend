import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminAccessState, homePathForRole } from "../lib/adminAuth";
import { toLoginEmail } from "../../api/_lib/staffAccount.js";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/adminSupabaseClient";
import brandLogoImage from "../assets/brand/logo-horizontal.png";
import { BusyText } from "../components/Loading";

const initialForm = {
  email: "",
  password: "",
};

function AdminLoginPage() {
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [resetError, setResetError] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        return;
      }

      const accessState = await getAdminAccessState();
      if (accessState.error) {
        setError(accessState.error);
        return;
      }

      if (accessState.isAdmin) {
        navigate(homePathForRole(accessState.role), { replace: true });
        return;
      }

      await supabase.auth.signOut();
      setError("관리자 권한이 없는 계정입니다.");
    };

    void checkExistingSession();
  }, [navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setResetNotice("");
    setResetError("");

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    if (!form.email.trim() || !form.password) {
      setError("이메일(또는 아이디)과 비밀번호를 입력해 주세요.");
      return;
    }

    setIsLoading(true);

    // 직원(교재 등록 담당) 계정은 "@" 없이 아이디만 입력한다 → 전용 주소로 바꿔 로그인
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(form.email),
      password: form.password,
    });

    if (loginError) {
      setError("로그인에 실패했습니다. 계정 정보를 확인해 주세요.");
      setIsLoading(false);
      return;
    }

    const accessState = await getAdminAccessState();
    if (accessState.error) {
      setError(accessState.error);
      setIsLoading(false);
      return;
    }

    if (!accessState.isAdmin) {
      await supabase.auth.signOut();
      setError("관리자 권한이 없는 계정입니다.");
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    navigate(homePathForRole(accessState.role), { replace: true });
  };

  const handleSendReset = async () => {
    setResetNotice("");
    setResetError("");

    if (!isSupabaseConfigured || !supabase) {
      setResetError("Supabase 환경 변수가 설정되지 않았습니다.");
      return;
    }

    const email = form.email.trim();
    if (!email) {
      setResetError("비밀번호 재설정 메일을 받으려면 이메일을 입력해 주세요.");
      return;
    }
    // 직원 계정은 메일함이 없다 — 관리자가 직원 계정 화면에서 새로 정해 준다
    if (!email.includes("@")) {
      setResetError("아이디로 로그인하는 계정은 관리자에게 비밀번호 변경을 요청해 주세요.");
      return;
    }

    setIsSendingReset(true);
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: resetMailError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (resetMailError) {
      setResetError(resetMailError.message || "비밀번호 재설정 메일 전송에 실패했습니다.");
      setIsSendingReset(false);
      return;
    }

    setIsSendingReset(false);
    setResetNotice("비밀번호 재설정 메일을 전송했습니다. 메일함을 확인해 주세요.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <img alt="SUBOOK" className="mx-auto h-6 w-auto" src={brandLogoImage} />
          <h1 className="mt-5 text-[26px] font-bold tracking-tight text-slate-900">관리자 로그인</h1>
          <p className="mt-2 text-sm text-slate-500">
            관리자 계정으로 로그인해 주세요
          </p>
        </header>

        {!isSupabaseConfigured ? (
          <p className="notice-error mb-4">
            `.env` 파일에 `VITE_SUPABASE_ADMIN_URL`, `VITE_SUPABASE_ADMIN_ANON_KEY`를 설정해 주세요.
          </p>
        ) : null}

        {error ? <p className="notice-error mb-4">{error}</p> : null}

        <section className="card animate-rise !p-6 sm:!p-7">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="label">이메일 또는 아이디</span>
              <input
                className="input-base"
                name="email"
                onChange={handleChange}
                placeholder="이메일 또는 아이디"
                autoCapitalize="none"
                autoComplete="username"
                inputMode="email"
                spellCheck={false}
                type="text"
                value={form.email}
              />
            </label>

            <label className="block">
              <span className="label">비밀번호</span>
              <input
                className="input-base"
                name="password"
                onChange={handleChange}
                placeholder="비밀번호"
                type="password"
                value={form.password}
              />
            </label>

            <button className="btn-primary" disabled={isLoading} type="submit">
              {isLoading ? <BusyText>로그인 중...</BusyText> : "로그인"}
            </button>
          </form>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <button
              className="btn-secondary w-full"
              disabled={isSendingReset}
              onClick={handleSendReset}
              type="button"
            >
              {isSendingReset ? <BusyText>전송 중...</BusyText> : "비밀번호 재설정 메일 보내기"}
            </button>
            {resetError ? <p className="notice-error mt-3">{resetError}</p> : null}
            {resetNotice ? <p className="notice-success mt-3">{resetNotice}</p> : null}
          </div>
        </section>

        <div className="mt-5 text-center">
          <a className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800" href={sellerPortalUrl}>
            판매자 조회 화면으로
          </a>
        </div>
      </div>
    </main>
  );
}

export default AdminLoginPage;
