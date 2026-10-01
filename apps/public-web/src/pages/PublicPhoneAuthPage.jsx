import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { bindMemberPhone, memberIdentityRpc, normalizeMemberPhone, safeMemberNext, sendMemberLoginOtp, verifyMemberLoginOtp } from "@shared-supabase/memberIdentityClient";
import MemberIdentityLayout from "../components/MemberIdentityLayout";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { sendPhoneOtp } from "../lib/pickupRequest";
import { getSignupReferralCode } from "../lib/signupReferral";
import { usePageMeta } from "../lib/usePageMeta";

export default function PublicPhoneAuthPage({ mode = "login" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasSession, isLoading, identity, identityPolicy, profile, refreshProfile, signOut } = usePublicAuth();
  const verifying = mode === "verify";
  const next = safeMemberNext(new URLSearchParams(location.search).get("next"));
  const [phone, setPhone] = useState(() => normalizeMemberPhone(profile?.phone));
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canBind, setCanBind] = useState(false);
  const codeInput = useRef(null);
  usePageMeta({ title: verifying ? "휴대폰 인증" : "휴대폰으로 시작하기", noindex: true });
  useEffect(() => { getSignupReferralCode(location.search); }, [location.search]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (sent) codeInput.current?.focus(); }, [sent]);

  const finish = async (result) => {
    if (result.status === "merge_required" || (result.status === "unverified" && result.can_merge)) {
      await refreshProfile();
      navigate("/auth/merge", { replace: true });
      return;
    }
    if (result.status !== "verified") throw new Error("휴대폰 인증 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    setCanBind(true);
    await bindMemberPhone();
    await refreshProfile();
    navigate(next === "/signup" || next.startsWith("/signup?") ? "/auth/oauth-consent" : next, { replace: true });
  };
  const send = async (event) => {
    event?.preventDefault();
    if (busy || cooldown) return;
    if (!/^010\d{8}$/.test(phone)) { setError("010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요."); return; }
    setBusy(true); setError("");
    try {
      if (verifying) { const result = await sendPhoneOtp(phone); if (!result.success) throw result.error; }
      else await sendMemberLoginOtp(phone);
      setSent(true); setCooldown(60); setCode(""); setNotice("인증번호를 보냈어요. 5분 안에 입력해 주세요.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const verify = async (event) => {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError("");
    try {
      if (verifying) await finish(await memberIdentityRpc("verify_phone_otp", { p_code: code }));
      else { await verifyMemberLoginOtp(phone, code); await finish(await memberIdentityRpc("get_my_member_identity")); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const retryBind = async () => {
    setBusy(true); setError("");
    try { await finish({ status: "verified" }); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (verifying && !isLoading && !hasSession) return <Navigate to="/login" replace state={{ from: `/auth/verify-phone?next=${encodeURIComponent(next)}` }} />;
  const merged = identity?.status === "merged";
  const unavailable = !verifying && !identityPolicy?.legacy_phone_login_enabled;
  return <MemberIdentityLayout step={sent ? 2 : 1} eyebrow={verifying ? "안전한 계정을 위한 한 번의 확인" : "휴대폰으로 간편하게"}
    title={merged ? "대표 계정으로 만나요" : verifying ? "내 번호로, 내 계정 확인" : sent ? "인증번호를 입력해 주세요" : "기존 가입 계정 확인"}
    description={merged ? "이 계정은 통합이 완료되었어요. 선택하신 대표 계정으로 로그인해 주세요." : verifying ? "휴대폰 번호 하나로 계정 하나를 이용해요.\n계속 이용하려면 내 번호를 인증해 주세요." : "휴대폰만으로 가입했던 계정을 확인하고,\n앞으로 사용할 이메일을 등록해 주세요."}>
    {merged ? <button className="member-identity-primary" onClick={async () => { await signOut(); navigate("/login"); }}>대표 계정으로 로그인</button>
      : unavailable ? <><p className="member-identity-message">{identityPolicy?.error ? "인증 서비스 상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : "휴대폰 로그인을 준비하고 있어요."}</p><Link className="member-identity-secondary" to="/login">기존 계정으로 로그인</Link></>
      : <><form className="member-identity-form" onSubmit={sent ? verify : send}>
        <label htmlFor="identity-phone">휴대폰 번호</label>
        <div className="member-identity-country"><span>대한민국 +82</span><input id="identity-phone" name="phone" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="010 1234 5678" value={phone} onChange={(e) => setPhone(normalizeMemberPhone(e.target.value).slice(0, 11))} disabled={sent || busy} required /></div>
        {sent && <><div className="member-identity-tools"><button type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); setNotice(""); }}>번호 수정</button><button type="button" disabled={busy || cooldown > 0} onClick={send}>{cooldown ? `${cooldown}초 후 재전송` : "인증번호 다시 받기"}</button></div>
          <label htmlFor="identity-code">인증번호 6자리</label><input ref={codeInput} id="identity-code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} required /></>}
        {notice && <p className="member-identity-message" role="status">{notice}</p>}
        {error && <p className="member-identity-message is-error" role="alert">{error}</p>}
        {canBind ? <button type="button" className="member-identity-primary" disabled={busy} onClick={retryBind}>{busy ? "연결 중…" : "인증된 계정 연결 마무리"}</button>
          : <button className="member-identity-primary" disabled={busy || (!sent && cooldown > 0) || (sent && code.length !== 6)}>{busy ? "확인 중…" : sent ? "인증하고 계속하기" : "인증번호 받기"}</button>}
        {!sent && <small>입력한 번호로 인증번호를 보내드려요.</small>}
      </form>
      <div className="member-identity-note"><strong>계정이 여러 개여도 괜찮아요.</strong>같은 번호로 가입한 계정이 있다면, 로그인 확인 후 대표 계정을 선택해 이용 내역을 모을 수 있어요.</div>
      {verifying ? <button className="member-identity-text-button" style={{ marginTop: 22 }} onClick={async () => { await signOut(); navigate("/login"); }}>다른 계정으로 로그인</button>
        : <Link className="member-identity-secondary" to="/login" state={{ from: next }}>이메일 · 카카오 · 구글로 로그인</Link>}
      </>}
  </MemberIdentityLayout>;
}
