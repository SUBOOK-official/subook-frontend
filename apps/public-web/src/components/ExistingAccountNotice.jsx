import { Link } from "react-router-dom";
import { ArrowRightIcon, CheckIcon } from "./icons";
import "./ExistingAccountNotice.css";

// Notion 로그인 화면의 명확한 제목·단일 주 행동 구성을 수북 색상으로 적용한다.
export default function ExistingAccountNotice({ onLogin, onRetry, busy = false }) {
  const label = <>기존 계정으로 로그인 <ArrowRightIcon size={17} /></>;
  return <section className="existing-account-notice" aria-label="기존 가입 계정 안내" role="status">
    <span className="existing-account-notice__verified"><CheckIcon size={15} /> 휴대폰 인증 완료</span>
    <h2>이미 가입한 계정이 있어요</h2>
    <p>이 전화번호로 가입한 수북 계정이 있어요.<br />기존에 이용하던 방법으로 로그인해 주세요.</p>
    <div className="existing-account-notice__methods" aria-label="로그인 방법"><span>이메일</span><span>카카오</span><span>Google</span></div>
    {onLogin ? <button type="button" disabled={busy} className="existing-account-notice__primary" onClick={onLogin}>{label}</button>
      : <Link className="existing-account-notice__primary" to="/login">{label}</Link>}
    {onRetry && <button type="button" disabled={busy} className="existing-account-notice__retry" onClick={onRetry}>다른 번호로 인증하기</button>}
  </section>;
}
