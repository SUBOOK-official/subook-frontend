import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { completeSignupReferral, getMySignupReferral, getSignupReferralOffer } from "@shared-supabase/referralClient";
import { normalizeReferralCode, REFERRAL_EVENT_PATH, REFERRAL_MIN_ORDER_AMOUNT, REFERRAL_REWARD_AMOUNT } from "@shared-domain/referral";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { clearSignupReferral, referralReturnPath, referralSignupPath, rememberSignupReferral } from "../lib/signupReferral";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicInvitePage.css";

export default function PublicInvitePage() {
  usePageMeta({ title: "친구 초대 · 함께 4,000원 쿠폰", description: "친구가 초대 링크로 가입하면 나도 친구도 4,000원 쿠폰. 교재 3만원 이상 구매 시 사용할 수 있습니다.", noindex: true });
  const { search } = useLocation();
  const rawCode = new URLSearchParams(search).get("ref");
  const code = normalizeReferralCode(rawCode);
  const { isAuthenticated, isLoading: authLoading, user } = usePublicAuth();
  const [offer, setOffer] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSummary(null);
    const load = async () => {
      try {
        const nextOffer = await getSignupReferralOffer(supabase, code);
        if (cancelled) return;
        setOffer(nextOffer);
        if (!isAuthenticated && code && nextOffer.code_valid && nextOffer.active) rememberSignupReferral(code);
        if (isAuthenticated) {
          const completion = await completeSignupReferral(supabase);
          const nextSummary = await getMySignupReferral(supabase);
          if (cancelled) return;
          setSummary(nextSummary);
          clearSignupReferral();
          if (completion.status === "unavailable") setNotice("현재 초대 쿠폰을 발급할 수 없습니다. 잠시 후 다시 확인해 주세요.");
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, user?.id, code, reload]);

  const inviteUrl = summary?.code ? `${window.location.origin}${referralReturnPath(summary.code)}` : "";
  const received = summary?.received_reward;
  const invalidCode = rawCode !== null && (!code || (offer && !offer.code_valid));
  const canJoin = !loading && !error && offer?.active && code && !invalidCode;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("초대 링크를 복사했습니다.");
    } catch { setNotice("아래 초대 링크를 길게 누르거나 선택해서 복사해 주세요."); }
  };
  const share = async () => {
    if (!navigator.share) { await copyLink(); return; }
    try {
      await navigator.share({ title: "수북 친구 초대", text: "이 링크로 수북에 가입하면 우리 둘 다 4,000원 쿠폰! 교재 3만원 이상 구매 시 사용할 수 있어요.", url: inviteUrl });
    } catch (err) { if (err.name !== "AbortError") await copyLink(); }
  };

  return (
    <PublicPageFrame>
      <PublicSiteHeader />
      <ContentContainer className="invite-content">
        <section className="invite-card" aria-labelledby="invite-title">
          <p className="invite-eyebrow">수북 친구 초대</p>
          <h1 id="invite-title">나도 친구도<br /><strong>{REFERRAL_REWARD_AMOUNT.toLocaleString()}원 쿠폰</strong></h1>
          <p className="invite-description">친구가 초대 링크로 가입하면<br />두 사람의 쿠폰함에 바로 지급됩니다.</p>
          <div className="invite-ticket"><span>친구와 함께 받는 할인</span><strong>{REFERRAL_REWARD_AMOUNT.toLocaleString()}원</strong><span>교재 {REFERRAL_MIN_ORDER_AMOUNT.toLocaleString()}원 이상 구매 시</span></div>
          {loading ? <p role="status">초대 정보를 확인하고 있습니다.</p> : null}
          {error ? <div role="alert"><p>{error}</p><button className="invite-secondary" onClick={() => setReload((value) => value + 1)} type="button">다시 시도</button></div> : null}
          {!loading && !error && !offer?.active ? <p role="status">현재 참여할 수 없는 이벤트입니다.</p> : null}
          {!loading && !error && invalidCode ? <p role="alert">사용할 수 없는 초대 링크입니다. 친구에게 링크를 다시 받아 주세요.</p> : null}
          {!loading && !error && isAuthenticated && summary ? (
            <div className="invite-actions">
              {received ? <p className="invite-success" role="status">나와 친구에게 4,000원 쿠폰이 지급되었습니다.</p> : code ? <p>초대 가입 혜택은 신규 회원에게 지급됩니다. 내 링크로 친구를 초대해 보세요.</p> : null}
              {offer?.active ? <>
                <button className="invite-primary" type="button" onClick={share}>친구에게 초대 링크 보내기</button>
                <button className="invite-secondary" type="button" onClick={copyLink}>초대 링크 복사</button>
                <label className="invite-link-label">내 초대 링크<input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} /></label>
              </> : null}
              <p className="invite-count">초대 가입 완료 <strong>{summary.reward_count}명</strong> · 받은 초대 쿠폰 <strong>{summary.reward_count}장</strong></p>
              <Link className="invite-text-link" to="/mypage#coupons">내 쿠폰함 보기 →</Link>
            </div>
          ) : null}
          {!loading && !error && !isAuthenticated && offer?.active && !invalidCode ? (
            <div className="invite-actions">
              {canJoin ? <Link className="invite-primary" to={referralSignupPath(code)}>가입하고 4,000원 쿠폰 받기</Link> : <Link className="invite-primary" to="/login" state={{ from: REFERRAL_EVENT_PATH }}>로그인하고 친구 초대하기</Link>}
              {canJoin ? <Link className="invite-text-link" to="/login" state={{ from: referralReturnPath(code) }}>이미 회원이신가요? 로그인</Link> : null}
            </div>
          ) : null}
          {notice ? <p role="status" className="invite-notice">{notice}</p> : null}
          <ul className="invite-terms">
            <li>이메일 인증 또는 소셜 로그인 후 필수 약관 동의와 가입 정보 입력을 완료하면 지급됩니다.</li>
            <li>초대받은 친구는 신규 가입 시 1회, 초대한 회원은 친구가 가입할 때마다 1장씩 받습니다.</li>
            <li>배송비를 제외한 할인 전 교재 금액 30,000원 이상 주문에 쿠폰 1장을 사용할 수 있습니다.</li>
            {offer ? <li>{offer.valid_days ? `쿠폰은 발급일부터 ${offer.valid_days}일 동안 사용할 수 있습니다.` : "쿠폰의 사용 기한은 쿠폰함에서 확인할 수 있습니다."} 포인트는 기존 이용 조건에 따라 함께 사용할 수 있습니다.</li> : null}
          </ul>
        </section>
      </ContentContainer>
      <PublicFooter />
    </PublicPageFrame>
  );
}
