// 공용 라인 아이콘 세트 — 이모지 아이콘(📦🔔🛒 등) 대체용.
// 24px 그리드, stroke 1.8, currentColor 상속. 텍스트 옆에 인라인으로 쓸 수 있게
// vertical-align을 살짝 내려 글자 베이스라인에 맞춘다.
// 새 아이콘이 필요하면 여기에 추가하고, 페이지에서 이모지를 직접 쓰지 말 것.

function IconBase({ size = 16, filled = false, children, style, ...props }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...style }}
      {...props}
    >
      {children}
    </svg>
  );
}

export function CartIcon(props) {
  return (
    <IconBase filled {...props}>
      <path d="M4.00436 6.41686L0.761719 3.17422L2.17593 1.76001L5.41857 5.00265H20.6603C21.2126 5.00265 21.6603 5.45037 21.6603 6.00265C21.6603 6.09997 21.6461 6.19678 21.6182 6.29L19.2182 14.29C19.0913 14.713 18.7019 15.0027 18.2603 15.0027H6.00436V17.0027H17.0044V19.0027H5.00436C4.45207 19.0027 4.00436 18.5549 4.00436 18.0027V6.41686ZM5.50436 23.0027C4.67593 23.0027 4.00436 22.3311 4.00436 21.5027C4.00436 20.6742 4.67593 20.0027 5.50436 20.0027C6.33279 20.0027 7.00436 20.6742 7.00436 21.5027C7.00436 22.3311 6.33279 23.0027 5.50436 23.0027ZM17.5044 23.0027C16.6759 23.0027 16.0044 22.3311 16.0044 21.5027C16.0044 20.6742 16.6759 20.0027 17.5044 20.0027C18.3328 20.0027 19.0044 20.6742 19.0044 21.5027C19.0044 22.3311 18.3328 23.0027 17.5044 23.0027Z" />
    </IconBase>
  );
}

export function BellIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 4a5 5 0 0 0-5 5v3.2l-1.6 3a.7.7 0 0 0 .6 1h12a.7.7 0 0 0 .6-1l-1.6-3V9a5 5 0 0 0-5-5Z" />
      <path d="M10 19.2a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function ClockIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </IconBase>
  );
}

export function MenuIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </IconBase>
  );
}

export function CloseIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </IconBase>
  );
}

export function BookIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M8.5 3v18" />
    </IconBase>
  );
}

export function BoxIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
      <path d="M3.5 8 12 12.5 20.5 8" />
      <path d="M12 12.5v8" />
    </IconBase>
  );
}

export function TicketIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5V8Z" />
      <path d="M14.5 7.5v1.5" />
      <path d="M14.5 11.2v1.6" />
      <path d="M14.5 15v1.5" />
    </IconBase>
  );
}

/* 정산·판매대금 — 원화(₩). 출처: Tabler Icons 'currency-won' (MIT).
   ⚠ 아이콘을 좌표로 직접 그리지 말 것 — 표준 라이브러리(Tabler/Lucide) 원본 path를 가져와 사용. */
export function CoinIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 6l3.245 11.358a.85 .85 0 0 0 1.624 .035l3.131 -9.393l3.131 9.393a.85 .85 0 0 0 1.624 -.035l3.245 -11.358" />
      <path d="M21 10h-18" />
      <path d="M21 14h-18" />
    </IconBase>
  );
}

export function UserIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </IconBase>
  );
}

export function MapPinIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 21s-6.5-5.3-6.5-10a6.5 6.5 0 0 1 13 0c0 4.7-6.5 10-6.5 10Z" />
      <circle cx="12" cy="10.6" r="2.3" />
    </IconBase>
  );
}

export function CardIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7 15h4" />
    </IconBase>
  );
}

export function HeartIcon({ filled = false, ...props }) {
  return (
    <IconBase filled={filled} {...props}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 6.9 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
    </IconBase>
  );
}

/* 찜한 상품 품절 알림용 — 하트 + 사선 */
export function HeartOffIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 6.9 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
      <path d="M4.5 4.5l15 15" />
    </IconBase>
  );
}

export function LockIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </IconBase>
  );
}

export function TruckIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M2.5 7h11v8.5H2.5V7Z" />
      <path d="M13.5 10h3.8l3.2 3.2v2.3h-7" />
      <circle cx="7" cy="17.8" r="1.6" />
      <circle cx="16.5" cy="17.8" r="1.6" />
    </IconBase>
  );
}

export function InboxIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" />
      <path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20" />
    </IconBase>
  );
}

export function SearchIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="M15.8 15.8 20.5 20.5" />
    </IconBase>
  );
}

export function CheckIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </IconBase>
  );
}

export function CheckCircleIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8.5 12.3l2.5 2.6 4.7-5" />
    </IconBase>
  );
}

export function AlertTriangleIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 4 21 19H3L12 4Z" />
      <path d="M12 10.2v3.6" />
      <path d="M12 16.4v.1" />
    </IconBase>
  );
}

export function InfoIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 11v5" />
      <path d="M12 8v.1" />
    </IconBase>
  );
}

export function EyeIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </IconBase>
  );
}

export function EyeOffIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4.5 8.5C3.2 9.9 2.5 12 2.5 12S6 18.2 12 18.2c1.3 0 2.5-.3 3.6-.8" />
      <path d="M9 6.2c.9-.3 1.9-.4 3-.4 6 0 9.5 6.2 9.5 6.2s-.9 1.6-2.5 3.1" />
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" />
      <path d="M4 4l16 16" />
    </IconBase>
  );
}

export function ArrowRightIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4.5 12h15" />
      <path d="M13 5.5 19.5 12 13 18.5" />
    </IconBase>
  );
}

export function ChevronRightIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M15 5.5 8.5 12 15 18.5" />
    </IconBase>
  );
}

export function ChevronUpIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5.5 15 12 8.5 18.5 15" />
    </IconBase>
  );
}

/* 필터/정렬 옵션 트리거용 슬라이더 */
export function SlidersIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="1.9" fill="#ffffff" />
      <circle cx="15" cy="12" r="1.9" fill="#ffffff" />
      <circle cx="9" cy="17" r="1.9" fill="#ffffff" />
    </IconBase>
  );
}

export function MailIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7.5 12 13l7.5-5.5" />
    </IconBase>
  );
}

export function BankIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 20.5 9.5h-17L12 3.5Z" />
      <path d="M5.5 9.5v7.5" />
      <path d="M9.8 9.5v7.5" />
      <path d="M14.2 9.5v7.5" />
      <path d="M18.5 9.5v7.5" />
      <path d="M3.5 20.5h17" />
    </IconBase>
  );
}

/* 고정 공지 핀 */
export function PinIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 3.5h6l-1 6.5 3 2.5V14H7v-1.5l3-2.5-1-6.5Z" />
      <path d="M12 14v6" />
    </IconBase>
  );
}
