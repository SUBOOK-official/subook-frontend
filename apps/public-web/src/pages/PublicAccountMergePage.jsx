import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { bindMemberPhone, memberIdentityRpc } from "@shared-supabase/memberIdentityClient";
import MemberIdentityLayout from "../components/MemberIdentityLayout";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { usePageMeta } from "../lib/usePageMeta";
import { clearSignupReferral } from "../lib/signupReferral";

const storageKey = "subook.member.merge";
function readMergeRequest() {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; }
}
function saveMergeRequest(request) { sessionStorage.setItem(storageKey, JSON.stringify(request)); }

export default function PublicAccountMergePage() {
  const { hasSession, isLoading, user, signOut, refreshProfile } = usePublicAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState(readMergeRequest);
  const [view, setView] = useState(null);
  const [selected, setSelected] = useState(() => readMergeRequest()?.target || "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  usePageMeta({ title: "대표 계정 선택", noindex: true });

  useEffect(() => {
    if (!hasSession || !user?.id) return;
    let cancelled = false;
    const load = async () => {
      setBusy(true); setError("");
      try {
        const saved = readMergeRequest();
        let result;
        if (saved) {
          result = await memberIdentityRpc("prove_member_account_merge", { p_id: saved.id, p_secret: saved.secret });
          if (!cancelled) setRequest(saved);
        } else {
          result = await memberIdentityRpc("start_member_account_merge");
          const created = { id: result.id, secret: result.secret };
          if (!cancelled) { saveMergeRequest(created); setRequest(created); }
        }
        if (!cancelled) { setView(result); setSelected((current) => current || user.id); }
      } catch (err) { if (!cancelled) setError(err.message); }
      finally { if (!cancelled) setBusy(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [hasSession, user?.id]);

  const switchAccount = async (account, asTarget = false) => {
    setBusy(true); setError("");
    if (asTarget) saveMergeRequest({ ...request, target: account.id });
    const result = await signOut("account_merge_verify");
    if (result.error) { setError("로그아웃하지 못했습니다. 다시 시도해 주세요."); setBusy(false); return; }
    if (account.provider === "phone") navigate("/auth/phone?next=%2Fauth%2Fmerge");
    else navigate("/login", { state: { from: "/auth/merge", email: account.verified ? account.email : "", notice: "통합할 계정으로 로그인해 주세요. 로그인 후 계정 통합으로 돌아옵니다." } });
  };
  const complete = async () => {
    if (busy || !confirmed || !request) return;
    const target = view.accounts.find((account) => account.id === selected && account.verified);
    if (!target) return;
    if (target.id !== user.id) { await switchAccount(target, true); return; }
    setBusy(true); setError("");
    try {
      await bindMemberPhone(view.completed ? "bind" : "merge", { id: request.id, secret: request.secret });
      await refreshProfile();
      sessionStorage.removeItem(storageKey); clearSignupReferral(); setSuccess(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const restart = () => { sessionStorage.removeItem(storageKey); navigate("/auth/verify-phone", { replace: true }); };
  if (!isLoading && !hasSession) return <Navigate to="/login" replace state={{ from: "/auth/merge" }} />;
  const verifiedCount = view?.accounts.filter((account) => account.verified).length || 0;
  return <MemberIdentityLayout step={success ? 3 : 2} eyebrow="내 이용 내역을 한곳에" title={success ? "하나의 계정으로 모았어요" : "어떤 계정으로 계속할까요?"}
    description={success ? "주문과 포인트, 판매 내역이 대표 계정에 모였어요. 다음부터는 대표 계정으로 로그인해 주세요." : "내 계정에 각각 로그인해 소유를 확인해 주세요.\n확인된 계정 중 앞으로 사용할 대표 계정을 골라주세요."}>
    {success ? <Link className="member-identity-primary" to="/mypage">내 계정으로 가기</Link> : <>
      {view && <fieldset className="member-merge-accounts"><legend className="sr-only">대표 계정 선택</legend>{view.accounts.map((account) => <label className="member-merge-account" key={account.id}>
        <input type="radio" name="representative" aria-label={`${account.email} 대표 계정 선택`} value={account.id} checked={selected === account.id} disabled={!account.verified || busy || view.completed} onChange={() => { setSelected(account.id); setConfirmed(false); }} />
        <div><strong>{account.email}</strong><p>{account.verified ? `로그인 확인됨${account.id === user.id ? " · 현재 계정" : ""}` : "로그인 확인 필요"}</p>
          {account.verified ? <p>주문 {account.orders || 0}건 · 포인트 {Number(account.points || 0).toLocaleString()}P</p>
            : <button type="button" className="member-identity-text-button" disabled={busy} onClick={() => switchAccount(account)}>이 계정으로 로그인해 확인하기</button>}</div>
      </label>)}</fieldset>}
      {busy && <p role="status" className="member-identity-message">계정 정보를 확인하고 있어요…</p>}
      {error && <p role="alert" className="member-identity-message is-error">{error}</p>}
      {view && <><div className="member-identity-note"><strong>통합 전에 확인해 주세요.</strong>
        로그인 확인된 {verifiedCount}개 계정의 주문·판매 내역과 포인트를 모아요. 동일한 중복 쿠폰은 한 장만 남고, 사용한 혜택은 추가로 지급되지 않아요. 통합 후에는 대표 계정으로 로그인하며, 원 계정의 개인정보는 30일 후 정리됩니다.</div>
        <label className="member-merge-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />확인된 계정들이 모두 제 계정이며, 선택한 대표 계정으로 통합하는 데 동의해요.</label>
        <button className="member-identity-primary" disabled={busy || !confirmed || verifiedCount < 2} onClick={complete}>{view.completed ? "휴대폰 로그인 연결 마무리" : selected !== user?.id ? "대표 계정으로 로그인하고 통합하기" : "이 계정을 대표로 통합하기"}</button>
        {verifiedCount < 2 && <p className="member-identity-message">통합할 다른 계정에도 로그인해 주세요.</p>}
      </>}
      <button className="member-identity-text-button" style={{ marginTop: 20 }} onClick={restart}>휴대폰 인증부터 다시 하기</button>
      <p className="member-identity-message">모르는 계정이거나 로그인할 수 없다면 <a href="mailto:subook2025@gmail.com">고객센터에 문의해 주세요.</a></p>
    </>}
  </MemberIdentityLayout>;
}
