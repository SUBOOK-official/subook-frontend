import { Link } from "react-router-dom";
import ContentContainer from "./ContentContainer";

function FooterMailIcon() {
  return (
    <svg aria-hidden="true" className="public-footer__icon-svg" viewBox="0 0 24 24">
      <path
        d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75Zm2.2-.25 6.8 5.44 6.8-5.44H5.2Zm14.3 1.92-6.56 5.25a1.5 1.5 0 0 1-1.88 0L4.5 8.42v8.83c0 .14.11.25.25.25h14.5c.14 0 .25-.11.25-.25V8.42Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FooterInstagramIcon() {
  return (
    <svg aria-hidden="true" className="public-footer__icon-svg" viewBox="0 0 24 24">
      <path
        d="M7.25 3h9.5A4.25 4.25 0 0 1 21 7.25v9.5A4.25 4.25 0 0 1 16.75 21h-9.5A4.25 4.25 0 0 1 3 16.75v-9.5A4.25 4.25 0 0 1 7.25 3Zm0 1.75A2.5 2.5 0 0 0 4.75 7.25v9.5a2.5 2.5 0 0 0 2.5 2.5h9.5a2.5 2.5 0 0 0 2.5-2.5v-9.5a2.5 2.5 0 0 0-2.5-2.5h-9.5Zm10.13 1.62a1.13 1.13 0 1 1 0 2.26 1.13 1.13 0 0 1 0-2.26ZM12 7.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 1.75A2.75 2.75 0 1 0 14.75 12 2.75 2.75 0 0 0 12 9.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FooterChatIcon() {
  return (
    <svg aria-hidden="true" className="public-footer__icon-svg" viewBox="0 0 24 24">
      <path
        d="M12 4c5.25 0 9.5 3.6 9.5 8.05 0 4.44-4.25 8.05-9.5 8.05-.9 0-1.78-.1-2.6-.31l-4.27 2.01a.75.75 0 0 1-1.05-.78l.53-4.01C3.61 15.61 2.5 13.91 2.5 12.05 2.5 7.6 6.75 4 12 4Zm0 1.75c-4.28 0-7.75 2.82-7.75 6.3 0 1.47.62 2.82 1.76 3.89l.33.31-.34 2.58 2.75-1.3.31.1c.9.3 1.9.47 2.94.47 4.28 0 7.75-2.82 7.75-6.3 0-3.48-3.47-6.3-7.75-6.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

const footerTopLinks = [
  { label: "교재 판매하기", to: "/pickup/new" },
  { label: "이용약관", to: "/terms" },
  { label: "개인정보처리방침", to: "/privacy", bold: true },
  { label: "사업자정보확인", to: null },
  { label: "1:1문의", href: "mailto:subook2025@gmail.com" },
];

const footerMetaLines = [
  [
    ["상호", "수북(SUBOOK)"],
    ["대표", "박영제"],
    ["개인정보관리책임자", "진성욱"],
  ],
  [
    ["전화", "010-6271-5792"],
    ["이메일", "subook2025@gmail.com"],
    ["주소", "서울 서대문구 연세로 50 제1공학관"],
  ],
  [
    ["사업자등록번호", "등록 준비 중"],
    ["통신판매업신고번호", "등록 준비 중"],
  ],
];

function FooterMetaPair({ label, value }) {
  return (
    <span className="public-footer__pair">
      <span>{label}</span>
      <span className="public-footer__divider" aria-hidden="true">
        |
      </span>
      <span>{value}</span>
    </span>
  );
}

function PublicFooter() {
  return (
    <footer className="public-footer">
      <ContentContainer className="public-footer__inner">
        <div className="public-footer__content">
          <div className="public-footer__brand">SUBOOK®</div>

          <div className="public-footer__links">
            {footerTopLinks.map((link) => {
              const className = `public-footer__text-button${link.bold ? " public-footer__text-button--bold" : ""}`;

              return link.to ? (
                <Link className={className} key={link.label} to={link.to}>
                  {link.label}
                </Link>
              ) : link.href ? (
                <a className={className} href={link.href} key={link.label}>
                  {link.label}
                </a>
              ) : (
                <button className={className} key={link.label} type="button">
                  {link.label}
                </button>
              );
            })}
          </div>

          <div className="public-footer__meta">
            {footerMetaLines.map((line, index) => (
              <div className="public-footer__meta-line" key={`footer-meta-line-${index + 1}`}>
                {line.map(([label, value]) => (
                  <FooterMetaPair key={`${label}-${value}`} label={label} value={value} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="public-footer__side">
          <div className="public-footer__socials">
            <a aria-label="이메일 문의" className="public-footer__social" href="mailto:subook2025@gmail.com">
              <FooterMailIcon />
            </a>
            <a aria-label="인스타그램" className="public-footer__social" href="https://instagram.com/subook_official" rel="noopener noreferrer" target="_blank">
              <FooterInstagramIcon />
            </a>
            <a aria-label="카카오톡 채널" className="public-footer__social" href="https://pf.kakao.com/_subook" rel="noopener noreferrer" target="_blank">
              <FooterChatIcon />
            </a>
          </div>

          <p className="public-footer__copyright">© {new Date().getFullYear()} SUBOOK. All Rights Reserved.</p>
        </div>
      </ContentContainer>
    </footer>
  );
}

export default PublicFooter;
