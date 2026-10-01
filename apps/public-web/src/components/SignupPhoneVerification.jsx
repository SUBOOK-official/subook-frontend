import { useEffect, useState } from "react";
import { signupPhoneRequest, normalizeMemberPhone } from "@shared-supabase/memberIdentityClient";
import ExistingAccountNotice from "./ExistingAccountNotice";

export default function SignupPhoneVerification({ email, phone, onPhoneChange, proof, onVerified, disabled }) {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [existingAccount, setExistingAccount] = useState(null);
  const normalizedPhone = normalizeMemberPhone(phone);
  const verified = proof?.email === email && proof?.phone === normalizedPhone;
  const duplicate = existingAccount?.email === email && existingAccount?.phone === normalizedPhone;
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const send = async () => {
    if (busy || cooldown) return;
    setBusy(true); setError("");
    try {
      const result = await signupPhoneRequest({ action: "send", email, phone: normalizedPhone });
      setChallenge({ ...result, email, phone: normalizedPhone }); setCode(""); setCooldown(60);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!challenge || busy) return;
    setBusy(true); setError("");
    try {
      const result = await signupPhoneRequest({ action: "verify", id: challenge.id, secret: challenge.secret, code });
      if (result.status === "existing_account") { setExistingAccount(challenge); onVerified(null); return; }
      onVerified(challenge);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const currentChallenge = challenge?.email === email && challenge?.phone === normalizedPhone;
  return <div className="public-auth-field-row">
    <label className="public-auth-field-row__label" htmlFor="public-signup-phone">휴대폰 번호 <span className="public-auth-field-row__required">*</span></label>
    <div className="public-auth-field-row__control" style={{ display: "flex", gap: 8 }}>
      <input className="public-auth-field-row__input" style={{ minWidth: 0, flex: 1 }} id="public-signup-phone" type="tel" autoComplete="tel" placeholder="010-1234-5678" value={phone} disabled={disabled || busy || verified} onChange={onPhoneChange} />
      {!verified && !duplicate && <button type="button" className="public-auth-button" style={{ width: "auto", flexShrink: 0, padding: "0 12px", margin: 0 }} disabled={disabled || busy || cooldown > 0 || !/^010\d{8}$/.test(normalizedPhone) || !email.includes("@")} onClick={send}>{cooldown ? `${cooldown}초` : currentChallenge ? "다시 받기" : "인증번호 받기"}</button>}
      {verified && !disabled && <button type="button" className="public-auth-button" style={{ width: "auto", flexShrink: 0, padding: "0 12px", margin: 0 }} onClick={() => { onVerified(null); setChallenge(null); setCode(""); setError(""); }}>다시 인증</button>}
    </div>
    {currentChallenge && !verified && !duplicate && <div className="public-auth-field-row__control" style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <input aria-label="휴대폰 인증번호" className="public-auth-field-row__input" style={{ minWidth: 0, flex: 1 }} autoComplete="one-time-code" inputMode="numeric" placeholder="문자로 받은 6자리" maxLength={6} value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
      <button type="button" className="public-auth-button" style={{ width: "auto", flexShrink: 0, padding: "0 12px", margin: 0 }} disabled={busy || code.length !== 6} onClick={verify}>확인</button>
    </div>}
    {duplicate ? <ExistingAccountNotice onRetry={() => { setExistingAccount(null); setChallenge(null); setCode(""); }} />
      : <p className={`public-auth-inline-message public-auth-inline-message--${error ? "error" : verified ? "success" : "info"}`} role={error ? "alert" : "status"}>{error || (verified ? "휴대폰 인증 완료" : "휴대폰 인증을 마친 뒤 이메일 인증을 진행해 주세요.")}</p>}
  </div>;
}
