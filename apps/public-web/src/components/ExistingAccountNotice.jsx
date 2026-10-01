import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { prepareExistingAccountOAuth, safeMemberNext } from "@shared-supabase/memberIdentityClient";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { trackOAuthStart } from "../lib/analytics";
import { ArrowRightIcon, CheckIcon } from "./icons";
import "./ExistingAccountNotice.css";

const labels = { email: "이메일", kakao: "카카오", google: "Google" };

export default function ExistingAccountNotice({ accounts = [], onRetry, onSwitchingAccount, busy = false, next = "/" }) {
  const { hasSession, user, signOut } = usePublicAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState("");
  const [error, setError] = useState("");
  const pending = busy || Boolean(active);
  const matches = Array.isArray(accounts) ? accounts : [];
  const login = async (account, provider, index) => {
    if (pending) return;
    setActive(`${index}:${provider}`); setError("");
    try {
      const social = provider === "google" || provider === "kakao";
      const url = social ? await prepareExistingAccountOAuth(provider, next) : null;
      if (hasSession) {
        onSwitchingAccount?.(true);
        const result = await signOut("existing_phone_account");
        if (result.error) throw new Error("현재 계정에서 로그아웃하지 못했습니다. 다시 시도해 주세요.");
      }
      if (social) {
        trackOAuthStart(provider, "existing_phone_account");
        window.location.assign(url);
      } else {
        navigate(provider === "reset" ? "/forgot-password" : "/login", { state: {
          from: safeMemberNext(next),
          notice: `${account.email_hint}에 해당하는 전체 이메일 주소로 로그인해 주세요.`,
        } });
      }
    } catch (err) { onSwitchingAccount?.(false); setError(err.message); setActive(""); }
  };

  return <section className="existing-account-notice" aria-label="기존 가입 계정 안내">
    <span className="existing-account-notice__verified"><CheckIcon size={15} /> 휴대폰 인증 완료</span>
    {hasSession && user?.email && <div className="existing-account-notice__current"><span>현재 로그인한 계정</span><strong>{user.email}</strong></div>}
    <h2>{matches.length > 1 ? "이 번호로 확인된 계정" : "이 번호에 연결된 계정"}</h2>
    {matches.length ? <>
      <p>{hasSession ? "현재 로그인한 계정과 다른 계정이에요." : "새로 가입하지 않고 아래 계정으로 이용할 수 있어요."}</p>
      <div className="existing-account-notice__accounts">{matches.map((account, index) => {
        const providers = [...new Set((account.providers || []).filter(provider => labels[provider]))];
        return <article className="existing-account-notice__account" key={`${account.email_hint}:${index}`} aria-label={`확인된 계정 ${index + 1}`}>
          <span className="existing-account-notice__account-label">{matches.length > 1 ? `계정 ${index + 1}` : "가입 이메일"}</span>
          <strong className="existing-account-notice__email">{account.email_hint || "이메일 확인이 필요한 계정"}</strong>
          {providers.length ? <>
            <p className="existing-account-notice__methods">로그인 방법 <b>{providers.map(provider => labels[provider]).join(" · ")}</b></p>
            <div className="existing-account-notice__actions">{providers.map(provider => <button type="button" disabled={pending}
              className={`existing-account-notice__primary existing-account-notice__primary--${provider}`} key={provider}
              onClick={() => login(account, provider, index)}>
              {active === `${index}:${provider}` ? "연결 중…" : `${labels[provider]}로 로그인`} <ArrowRightIcon size={17} />
            </button>)}</div>
            {providers.includes("email") && <button type="button" className="existing-account-notice__reset" disabled={pending} onClick={() => login(account, "reset", index)}>비밀번호가 기억나지 않나요?</button>}
          </> : <p>로그인 정보 확인을 위해 고객센터에 문의해 주세요.</p>}
        </article>;
      })}</div>
      <p className="existing-account-notice__hint">개인정보 보호를 위해 이메일 일부만 표시해요.<br />로그인할 때는 위 이메일에 해당하는 계정을 선택해 주세요.</p>
    </> : <p>이 번호에 연결된 계정의 로그인 정보를 표시할 수 없어요. 고객센터에서 계정 찾기를 도와드릴게요.</p>}
    {error && <p className="existing-account-notice__error" role="alert">{error}</p>}
    <a className="existing-account-notice__help" href="mailto:subook2025@gmail.com?subject=%EC%88%98%EB%B6%81%20%EA%B3%84%EC%A0%95%20%EC%B0%BE%EA%B8%B0%20%EB%AC%B8%EC%9D%98">{matches.length ? "이 계정이 기억나지 않아요 · 고객센터" : "고객센터에 계정 찾기 문의"} <ArrowRightIcon size={14} /></a>
    {onRetry && <button type="button" disabled={pending} className="existing-account-notice__retry" onClick={onRetry}>다른 번호로 인증하기</button>}
  </section>;
}
