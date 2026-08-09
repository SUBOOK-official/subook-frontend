import { useState } from "react";
import { Link } from "react-router-dom";
import ContentContainer from "./ContentContainer";
import { KAKAO_CHANNEL_URL } from "../lib/supportChannels";
import brandLogoWhiteImage from "../assets/brand/logo-horizontal-white.png";

const CONTACT_EMAIL = "subook2025@gmail.com";

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
  { label: "공지사항", to: "/notices" },
  { label: "자주 묻는 질문", to: "/faq" },
  { label: "비회원 주문 조회", to: "/order/lookup" },
  { label: "이용약관", to: "/terms" },
  { label: "개인정보처리방침", to: "/privacy", bold: true },
  { label: "환불정책", to: "/refund" },
  // 1:1문의는 카카오톡 채널 우선 (답장 속도/접근성), 이메일은 socials 아이콘으로 보조
  { label: "1:1문의 (카카오톡)", href: KAKAO_CHANNEL_URL, external: true },
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
    // 2026-07-16 정본 사업장 주소로 통일 (이용약관 사업자정보표와 일치)
    ["주소", "광주광역시 서구 치평로 15"],
  ],
  [
    [
      "사업자등록번호",
      "421-99-01928",
      // 공정거래위원회 통신판매 사업자정보 조회 팝업 (무신사 등 커머스 표준 패턴).
      // 통신판매업 신고 완료 후 자동으로 조회 결과가 표시된다 — 별도 코드 변경 불필요.
      {
        label: "사업자정보확인",
        href: "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=4219901928",
      },
    ],
    ["통신판매업신고번호", "2026-광주서구-0566"],
  ],
];

function FooterMetaPair({ label, value, action }) {
  return (
    <span className="public-footer__pair">
      <span>{label}</span>
      <span className="public-footer__divider" aria-hidden="true">
        |
      </span>
      <span>{value}</span>
      {action ? (
        <a
          className="public-footer__pair-action"
          href={action.href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {action.label}
        </a>
      ) : null}
    </span>
  );
}

function PublicFooter() {
  // mailto는 유지(메일앱 있으면 작성창)하되, 기본 메일앱이 없는 데스크톱에서 "아무 반응 없음"이
  // 되지 않도록: 클릭 시 이메일 주소를 클립보드에 복사하고, 복사가 막혀도(권한/구형 브라우저)
  // 주소 자체를 노출해 어느 기기에서든 피드백이 뜨게 한다.
  const [emailFeedback, setEmailFeedback] = useState(null);

  const flashEmailFeedback = (message) => {
    setEmailFeedback(message);
    window.setTimeout(() => setEmailFeedback(null), 2500);
  };

  const handleEmailClick = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(CONTACT_EMAIL).then(
        () => flashEmailFeedback(`이메일 주소를 복사했어요 · ${CONTACT_EMAIL}`),
        () => flashEmailFeedback(`문의 이메일 · ${CONTACT_EMAIL}`),
      );
      return;
    }
    flashEmailFeedback(`문의 이메일 · ${CONTACT_EMAIL}`);
  };

  return (
    <footer className="public-footer">
      <ContentContainer className="public-footer__inner">
        <div className="public-footer__content">
          <div className="public-footer__brand">
            <img alt="수북 SUBOOK" className="public-footer__brand-logo" src={brandLogoWhiteImage} />
          </div>

          <div className="public-footer__links">
            {footerTopLinks.map((link) => {
              const className = `public-footer__text-button${link.bold ? " public-footer__text-button--bold" : ""}`;

              return link.to ? (
                <Link className={className} key={link.label} to={link.to}>
                  {link.label}
                </Link>
              ) : link.href ? (
                <a
                  className={className}
                  href={link.href}
                  key={link.label}
                  {...(link.external
                    ? { rel: "noopener noreferrer", target: "_blank" }
                    : {})}
                >
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
                {line.map(([label, value, action]) => (
                  <FooterMetaPair action={action} key={`${label}-${value}`} label={label} value={value} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="public-footer__side">
          <div className="public-footer__socials">
            <a
              aria-label={`이메일 문의 (${CONTACT_EMAIL})`}
              className="public-footer__social"
              href={`mailto:${CONTACT_EMAIL}`}
              onClick={handleEmailClick}
              title={CONTACT_EMAIL}
            >
              <FooterMailIcon />
            </a>
            <a aria-label="인스타그램" className="public-footer__social" href="https://instagram.com/subook.official" rel="noopener noreferrer" target="_blank">
              <FooterInstagramIcon />
            </a>
            <a aria-label="카카오톡 채널" className="public-footer__social" href={KAKAO_CHANNEL_URL} rel="noopener noreferrer" target="_blank">
              <FooterChatIcon />
            </a>
          </div>

          {emailFeedback ? (
            <p
              className="public-footer__email-copied"
              role="status"
              style={{ margin: "6px 0 0", fontSize: "12px", fontWeight: 600, color: "#10b981" }}
            >
              {emailFeedback}
            </p>
          ) : null}

          <p className="public-footer__copyright">© {new Date().getFullYear()} SUBOOK. All Rights Reserved.</p>
        </div>
      </ContentContainer>
    </footer>
  );
}

export default PublicFooter;
