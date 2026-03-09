import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSellerLookupOrigin } from "../lib/portalLinks";
import { isSupabaseConfigured, supabase } from "@shared-supabase/supabaseClient";

function buildAuthLinkErrorMessage({ error, errorCode, errorDescription }) {
  const parts = [];
  if (error) parts.push(error);
  if (errorCode) parts.push(errorCode);

  const head = parts.length ? `인증 링크 오류: ${parts.join(" / ")}` : "인증 링크 오류가 발생했습니다.";
  return errorDescription ? `${head}\n${errorDescription}` : head;
}

function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const sellerPortalUrl = getSellerLookupOrigin();

  const [phase, setPhase] = useState("checking"); // checking | ready | saving | done | error
  const [pageTitle, setPageTitle] = useState("비밀번호 설정");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });

  const urlInfo = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashString = (location.hash || "").startsWith("#")
      ? location.hash.slice(1)
      : location.hash || "";
    const hashParams = new URLSearchParams(hashString);

    const type = hashParams.get("type") || searchParams.get("type") || "";
    const code = searchParams.get("code") || "";
    const accessToken = hashParams.get("access_token") || "";
    const refreshToken = hashParams.get("refresh_token") || "";

    const urlError = hashParams.get("error") || searchParams.get("error") || "";
    const errorCode = hashParams.get("error_code") || searchParams.get("error_code") || "";
    const errorDescription =
      hashParams.get("error_description") || searchParams.get("error_description") || "";

    return {
      type,
      code,
      accessToken,
      refreshToken,
      urlError,
      errorCode,
      errorDescription,
      hasAnyAuthParams: Boolean(type || code || accessToken || refreshToken || urlError),
    };
  }, [location.hash, location.search]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setError("");
      setNotice("");
      setPhase("checking");

      if (!isSupabaseConfigured || !supabase) {
        setError("Supabase 환경 변수가 설정되지 않았습니다.");
        setPhase("error");
        return;
      }

      if (urlInfo.type === "invite") {
        setPageTitle("관리자 비밀번호 설정");
      } else if (urlInfo.type === "recovery") {
        setPageTitle("비밀번호 재설정");
      } else {
        setPageTitle("비밀번호 설정");
      }

      if (urlInfo.urlError) {
        setError(
          buildAuthLinkErrorMessage({
            error: urlInfo.urlError,
            errorCode: urlInfo.errorCode,
            errorDescription: urlInfo.errorDescription,
          }),
        );
        setPhase("error");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message || "세션을 확인할 수 없습니다.");
        setPhase("error");
        return;
      }

      if (!sessionData.session) {
        if (urlInfo.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(urlInfo.code);
          if (exchangeError) {
            setError("인증 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.");
            setPhase("error");
            return;
          }
        } else if (urlInfo.accessToken && urlInfo.refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: urlInfo.accessToken,
            refresh_token: urlInfo.refreshToken,
          });
          if (setSessionError) {
            setError("인증 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.");
            setPhase("error");
            return;
          }
        }
      }

      const { data: sessionDataAfter, error: sessionErrorAfter } =
        await supabase.auth.getSession();
      if (sessionErrorAfter) {
        setError(sessionErrorAfter.message || "세션을 확인할 수 없습니다.");
        setPhase("error");
        return;
      }

      if (!sessionDataAfter.session) {
        setError(
          "로그인 세션을 만들 수 없습니다. 링크가 만료되었거나 잘못된 링크일 수 있습니다.",
        );
        setPhase("error");
        return;
      }

      // Clear auth params from URL after we've stored the session.
      if (!cancelled && urlInfo.hasAnyAuthParams && (location.hash || location.search)) {
        window.history.replaceState({}, document.title, location.pathname);
      }

      if (!cancelled) {
        setPhase("ready");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search, urlInfo]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase 환경 변수가 설정되지 않았습니다.");
      setPhase("error");
      return;
    }

    const password = form.password || "";
    const confirm = form.confirmPassword || "";

    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 입력해 주세요.");
      return;
    }

    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setPhase("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "비밀번호 변경에 실패했습니다.");
      setPhase("ready");
      return;
    }

    setNotice("비밀번호가 설정되었습니다. 관리자 화면으로 이동합니다.");
    setPhase("done");
    setTimeout(() => {
      navigate("/admin", { replace: true });
    }, 700);
  };

  return (
    <main className="app-shell">
      <header className="mb-6">
        <p className="text-sm font-bold uppercase tracking-wide text-brand">Admin</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">{pageTitle}</h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          초대/비밀번호 재설정 메일에서 넘어온 링크로 관리자 비밀번호를 설정합니다.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <p className="notice-error mb-4">
          `.env` 파일에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정해 주세요.
        </p>
      ) : null}

      {phase === "checking" ? (
        <p className="text-sm font-semibold text-slate-500">인증 정보를 확인하는 중입니다...</p>
      ) : null}

      {error ? <p className="notice-error mb-4 whitespace-pre-wrap">{error}</p> : null}
      {notice ? <p className="notice-success mb-4">{notice}</p> : null}

      <section className="card animate-rise">
        <h2 className="section-title">새 비밀번호</h2>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block">
            <span className="label">새 비밀번호</span>
            <input
              autoComplete="new-password"
              className="input-base"
              disabled={phase !== "ready"}
              name="password"
              onChange={handleChange}
              placeholder="8자 이상"
              type="password"
              value={form.password}
            />
          </label>

          <label className="block">
            <span className="label">새 비밀번호 확인</span>
            <input
              autoComplete="new-password"
              className="input-base"
              disabled={phase !== "ready"}
              name="confirmPassword"
              onChange={handleChange}
              placeholder="한 번 더 입력"
              type="password"
              value={form.confirmPassword}
            />
          </label>

          <button className="btn-primary" disabled={phase !== "ready"} type="submit">
            {phase === "saving" ? "저장 중..." : "비밀번호 저장"}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          <Link className="btn-secondary w-full" to="/admin/login">
            관리자 로그인으로 돌아가기
          </Link>
          <a className="btn-secondary w-full" href={sellerPortalUrl}>
            판매자 조회 화면으로
          </a>
        </div>
      </section>
    </main>
  );
}

export default ResetPasswordPage;
