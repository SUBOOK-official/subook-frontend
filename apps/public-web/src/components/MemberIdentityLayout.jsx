import { Link } from "react-router-dom";
import logo from "../assets/brand/logo-horizontal.png";
import books from "../assets/member-auth-books.webp";
import "./MemberIdentityLayout.css";

export default function MemberIdentityLayout({ eyebrow, title, description, children, step = 1 }) {
  return <main className="member-identity-page">
    <header className="member-identity-header"><Link to="/" aria-label="수북 홈"><img src={logo} alt="수북 SUBOOK" /></Link><span>수능을 위한 가장 똑똑한 선택</span></header>
    <div className="member-identity-shell">
      <aside className="member-identity-editorial" aria-label="수북 소개">
        <img src={books} alt="햇살 아래 차곡차곡 놓인 남색과 하늘색 책" width="900" height="1200" />
        <div><p>YOUR NEXT CHAPTER</p><h2>오늘의 공부를<br />더 가볍게.</h2><span>좋은 책이 다음의 당신에게.</span></div>
      </aside>
      <section className="member-identity-content" aria-labelledby="member-identity-title">
        <div className="member-identity-progress" aria-label={`${step}단계`}><span className="is-active" /><span className={step >= 2 ? "is-active" : ""} /><span className={step >= 3 ? "is-active" : ""} /></div>
        <p className="member-identity-eyebrow">{eyebrow}</p>
        <h1 id="member-identity-title">{title}</h1><p className="member-identity-description">{description}</p>
        {children}
      </section>
    </div>
    <footer className="member-identity-footer"><span>책이 쌓이는 만큼, 가능성도 수북.</span><a href="mailto:subook2025@gmail.com">도움이 필요하신가요?</a></footer>
  </main>;
}
