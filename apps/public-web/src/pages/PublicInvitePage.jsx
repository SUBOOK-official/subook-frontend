import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { completeSignupReferral, getMySignupReferral, getSignupReferralOffer } from "@shared-supabase/referralClient";
import { normalizeReferralCode, REFERRAL_EVENT_PATH, REFERRAL_MIN_ORDER_AMOUNT, REFERRAL_REWARD_AMOUNT } from "@shared-domain/referral";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { ArrowRightIcon, CheckCircleIcon, ChevronRightIcon, TicketIcon } from "../components/icons";
import referralGiftImage from "../assets/referral-gift.webp";
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
          if (completion.status === "expired") setNotice("이미 사용된 초대 링크로 쿠폰이 지급되지 않았습니다.");
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
  const rewardLabel = REFERRAL_REWARD_AMOUNT.toLocaleString();

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
      <div className="invite-page">
        <section className="invite-hero" aria-labelledby="invite-title">
          <ContentContainer className="invite-hero-grid">
            <div className="invite-intro">
              <p className="invite-eyebrow"><TicketIcon size={18} /> 수북 친구 초대</p>
              <h1 id="invite-title">나도 친구도<br /><strong>{rewardLabel}<span>원 쿠폰</span></strong></h1>
              <p className="invite-description">친구가 초대 링크로 가입하면<br />두 사람의 쿠폰함에 동시에, 바로.</p>
            </div>
            <div className="invite-art" aria-hidden="true">
              <img src={referralGiftImage} alt="" width="1100" height="1100" fetchPriority="high" />
            </div>
            <div className="invite-action-area" aria-busy={loading}>
              {loading ? <p className="invite-status" role="status">초대 정보를 확인하고 있습니다.</p> : null}
              {error ? <div className="invite-status" role="alert"><p>{error}</p><button className="invite-secondary" onClick={() => setReload((value) => value + 1)} type="button">다시 시도</button></div> : null}
              {!loading && !error && !offer?.active ? <p className="invite-status" role="status">현재 참여할 수 없는 이벤트입니다.</p> : null}
              {!loading && !error && invalidCode ? <p className="invite-status" role="alert">{offer?.code_expired ? <>이미 초대가 완료되어 만료된 링크입니다.<br />이 링크로는 쿠폰을 받을 수 없습니다.</> : <>사용할 수 없는 초대 링크입니다.<br />친구에게 링크를 다시 받아 주세요.</>}</p> : null}
              {!loading && !error && isAuthenticated && summary ? (
                <div className="invite-actions">
                  {received ? <p className="invite-success" role="status"><CheckCircleIcon size={20} /><span>나와 친구에게 {rewardLabel}원 쿠폰이 지급되었습니다.</span></p> : code ? <p className="invite-member-note">초대 가입 혜택은 신규 회원에게 지급됩니다.<br />내 링크로 친구를 초대해 보세요.</p> : null}
                  {summary.can_invite === false ? <p className="invite-success" role="status"><CheckCircleIcon size={20} /><span>친구 초대 혜택을 받았습니다.<br />1회 참여가 완료되어 내 초대 링크가 만료되었습니다.</span></p> : null}
                  {offer?.active && inviteUrl && summary.can_invite !== false ? <>
                    <button className="invite-primary" type="button" onClick={share}>친구에게 초대 링크 보내기 <ArrowRightIcon size={20} /></button>
                    <label className="invite-link-label" htmlFor="invite-link">내 초대 링크</label>
                    <div className="invite-link-field">
                      <input id="invite-link" readOnly value={inviteUrl} onFocus={(event) => event.target.select()} />
                      <button type="button" onClick={copyLink} aria-label="초대 링크 복사">복사</button>
                    </div>
                  </> : null}
                </div>
              ) : null}
              {!loading && !error && !isAuthenticated && offer?.active && !invalidCode ? (
                <div className="invite-actions">
                  {canJoin ? <Link className="invite-primary" to={referralSignupPath(code)}>가입하고 {rewardLabel}원 쿠폰 받기 <ArrowRightIcon size={20} /></Link> : <Link className="invite-primary" to="/login" state={{ from: REFERRAL_EVENT_PATH }}>로그인하고 친구 초대하기 <ArrowRightIcon size={20} /></Link>}
                  {canJoin ? <Link className="invite-login-link" to="/login" state={{ from: referralReturnPath(code) }}>이미 회원이신가요? <span>로그인</span></Link> : null}
                </div>
              ) : null}
              <p className="invite-quick-terms">교재 {REFERRAL_MIN_ORDER_AMOUNT.toLocaleString()}원 이상 구매 시{offer?.valid_days ? <><span aria-hidden="true"> · </span>발급일부터 {offer.valid_days}일</> : null}</p>
              {notice ? <p role="status" className="invite-notice">{notice}</p> : null}
            </div>
          </ContentContainer>
        </section>
        <ContentContainer className="invite-details">
          {!loading && !error && isAuthenticated && summary ? (
            <section className="invite-dashboard" aria-label="나의 초대 현황">
              <div className="invite-dashboard-heading"><TicketIcon size={24} /><h2>함께 쌓은 혜택</h2></div>
              <dl><div><dt>초대 가입 완료</dt><dd>{summary.reward_count}<span>명</span></dd></div><div><dt>받은 초대 쿠폰</dt><dd>{summary.reward_count}<span>장</span></dd></div></dl>
              <Link to="/mypage#coupons">내 쿠폰함 <ChevronRightIcon size={18} /></Link>
            </section>
          ) : null}
          <section className="invite-how" aria-labelledby="invite-how-title">
            <div className="invite-section-heading"><p>함께 받는 방법</p><h2 id="invite-how-title">링크 하나로 시작하는<br className="invite-mobile-break" /> 우리 둘의 혜택</h2></div>
            <ol className="invite-steps">
              <li><span className="invite-step-number" aria-hidden="true">01</span><div><h3>내 초대 링크 보내기</h3><p>로그인 후 친구에게<br />내 초대 링크를 공유해 주세요.</p></div></li>
              <li><span className="invite-step-number" aria-hidden="true">02</span><div><h3>친구가 가입하면</h3><p>친구가 링크를 통해<br />수북 회원가입을 완료합니다.</p></div></li>
              <li><span className="invite-step-number" aria-hidden="true">03</span><div><h3>함께 {rewardLabel}원 받기</h3><p>나도 친구도, 가입 완료 즉시<br />쿠폰함에 한 장씩 지급됩니다.</p></div></li>
            </ol>
          </section>
          <details className="invite-terms">
            <summary>참여 전 확인해 주세요 <ChevronRightIcon size={18} /></summary>
            <ul>
              <li>이메일 인증 또는 소셜 로그인 후 필수 약관 동의와 가입 정보 입력을 완료하면 지급됩니다.</li>
              <li>친구 한 명이 초대 링크로 가입을 완료하면 두 사람에게 한 장씩 지급됩니다. 초대 혜택은 1회이며, 지급 후 초대 링크는 만료됩니다.</li>
              <li>배송비를 제외한 할인 전 교재 금액 {REFERRAL_MIN_ORDER_AMOUNT.toLocaleString()}원 이상 주문에 쿠폰 1장을 사용할 수 있습니다.</li>
              {offer ? <li>{offer.valid_days ? `쿠폰은 발급일부터 ${offer.valid_days}일 동안 사용할 수 있습니다.` : "쿠폰의 사용 기한은 쿠폰함에서 확인할 수 있습니다."} 포인트는 기존 이용 조건에 따라 함께 사용할 수 있습니다.</li> : null}
            </ul>
          </details>
        </ContentContainer>
      </div>
      <PublicFooter />
    </PublicPageFrame>
  );
}
