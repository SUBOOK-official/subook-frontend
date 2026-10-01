import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import MemberIdentityLayout from "../components/MemberIdentityLayout";
import { hasRequiredPasswordConditions, isValidEmailFormat } from "../lib/publicAuthFormUtils";

export default function PublicRequiredEmailPage() {
  const { hasSession, isLoading, needsEmailRegistration, refreshProfile, signOut } = usePublicAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); if (busy) return;
    setError(""); setBusy(true);
    try {
      if (!sent) {
        if (!isValidEmailFormat(email.trim()) || !hasRequiredPasswordConditions(password)) throw new Error("이메일과 비밀번호 형식을 확인해 주세요.");
        const result = await supabase.auth.updateUser({ email: email.trim().toLowerCase(), password });
        if (result.error) throw result.error;
        setSent(true);
      } else {
        const result = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: "email_change" });
        if (result.error) throw result.error;
        await refreshProfile(); navigate("/auth/oauth-consent", { replace: true });
      }
    } catch (err) { setError(err.message || "이메일 등록에 실패했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  if (!isLoading && !hasSession) return <Navigate replace to="/login" />;
  if (!isLoading && !needsEmailRegistration) return <Navigate replace to="/auth/oauth-consent" />;
  return <MemberIdentityLayout step={sent ? 2 : 1} eyebrow="기존 계정 이어서 사용하기" title="이메일을 등록해 주세요" description="앞으로 로그인할 이메일과 비밀번호를 등록해 주세요.\n기존 이용 내역은 그대로 유지돼요.">
    <form className="member-identity-form" onSubmit={submit}>
      <label htmlFor="required-email">이메일</label><input id="required-email" type="email" autoComplete="email" required disabled={busy || sent} value={email} onChange={(event) => setEmail(event.target.value)} />
      {!sent && <><label htmlFor="required-password">비밀번호</label><input id="required-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><small>영문과 숫자를 포함해 8자 이상 입력해 주세요.</small></>}
      {sent && <><label htmlFor="required-email-code">이메일 인증번호</label><input id="required-email-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /><p className="member-identity-message">이메일로 받은 인증번호를 입력해 주세요.</p></>}
      {error && <p className="member-identity-message is-error" role="alert">{error}</p>}
      <button className="member-identity-primary" disabled={busy}>{busy ? "확인 중…" : sent ? "이메일 인증하고 계속하기" : "이메일 인증번호 받기"}</button>
      {sent && <button type="button" className="member-identity-text-button" onClick={() => { setSent(false); setCode(""); }}>이메일 수정 · 다시 받기</button>}
    </form>
    <button className="member-identity-text-button" onClick={async () => { await signOut(); navigate("/login"); }}>다른 계정으로 로그인</button>
  </MemberIdentityLayout>;
}
