// 운영자 IA 그룹핑: 운영(수거→검수→주문→정산) / 카탈로그(상품·스튜디오) / 마케팅(쿠폰·공지·FAQ) / 분석·회원.
// 사이드바 평면 12개 나열은 신입 매니저 학습 비용이 컸음. 그룹 헤더 추가로 의미적 분류 노출.
// icon은 이모지 문자열이 아니라 icons.jsx의 컴포넌트 "참조"를 담는다 (.js 파일이라 JSX 사용 불가).
// 렌더는 AdminShell의 NavList가 <item.icon size={16} />으로 수행.
import {
  BoxIcon,
  CameraIcon,
  CartIcon,
  ChartBarIcon,
  CoinIcon,
  FolderIcon,
  HelpCircleIcon,
  MegaphoneIcon,
  PlusIcon,
  TicketIcon,
  TrendingUpIcon,
  UserIcon,
} from "./icons";

// 2026-07-16 R1 개편: 기능 축 → "업무 축" 그룹핑.
// 신입 운영자의 멘탈 모델(셀러 물건이 들어와서 팔리는 흐름 / 구매자 주문이 나가는 흐름)을
// 사이드바 순서 그대로 반영한다. 저빈도 페이지(탈퇴 사유)는 회원 페이지 내부 탭으로 흡수,
// 검수는 수거·검수 통합 페이지의 탭으로 흡수 (별도 메뉴 제거).
export const adminNavigationGroups = [
  {
    key: "overview",
    label: null, // hero — 그룹 헤더 없이 단독 노출
    items: [
      { key: "overview", label: "오늘 할 일", to: "/admin", icon: ChartBarIcon },
    ],
  },
  {
    key: "seller-flow",
    label: "셀러 흐름",
    items: [
      { key: "pickups", label: "수거·검수", to: "/admin/pickups", icon: BoxIcon },
      { key: "register", label: "상품 등록", to: "/admin/register", icon: PlusIcon },
      { key: "products", label: "상품 재고", to: "/admin/products", icon: FolderIcon },
    ],
  },
  {
    key: "buyer-flow",
    label: "구매자 흐름",
    items: [
      { key: "orders", label: "주문·배송", to: "/admin/orders", icon: CartIcon },
      { key: "settlements", label: "정산", to: "/admin/settlements", icon: CoinIcon },
    ],
  },
  {
    key: "customer",
    label: "고객",
    items: [
      { key: "members", label: "회원", to: "/admin/members", icon: UserIcon },
      { key: "coupons", label: "쿠폰", to: "/admin/coupons", icon: TicketIcon },
    ],
  },
  {
    key: "content",
    label: "콘텐츠",
    items: [
      { key: "notices", label: "공지사항", to: "/admin/notices", icon: MegaphoneIcon },
      { key: "faqs", label: "FAQ", to: "/admin/faqs", icon: HelpCircleIcon },
    ],
  },
  {
    key: "tools",
    label: "도구",
    items: [
      { key: "studio", label: "사진 스튜디오 (AI)", to: "/admin/studio", icon: CameraIcon },
      { key: "analytics", label: "분석", to: "/admin/analytics", icon: TrendingUpIcon },
    ],
  },
];

export function resolveActiveAdminModule({ pathname, explicitModule }) {
  if (explicitModule) {
    return explicitModule;
  }

  if (pathname.startsWith("/admin/studio")) {
    return "studio";
  }

  if (pathname.startsWith("/admin/analytics")) {
    return "analytics";
  }

  if (pathname.startsWith("/admin/faqs")) {
    return "faqs";
  }

  if (pathname.startsWith("/admin/notices")) {
    return "notices";
  }

  // 검수(shipment 상세·구 inspections 경로)는 수거·검수 통합 메뉴에 속한다
  if (pathname.startsWith("/admin/shipments/") || pathname.startsWith("/admin/inspections")) {
    return "pickups";
  }

  if (pathname.startsWith("/admin/pickups")) {
    return "pickups";
  }

  if (pathname.startsWith("/admin/register")) {
    return "register";
  }

  if (pathname.startsWith("/admin/products")) {
    return "products";
  }

  if (pathname.startsWith("/admin/catalog")) {
    return "products";
  }

  if (pathname.startsWith("/admin/orders")) {
    return "orders";
  }

  // 수동(식스샵) 정산은 정산 메뉴의 탭 — 사이드바 하이라이트는 '정산'으로
  if (pathname.startsWith("/admin/manual-settlements")) {
    return "settlements";
  }

  if (pathname.startsWith("/admin/settlements")) {
    return "settlements";
  }

  if (pathname.startsWith("/admin/coupons")) {
    return "coupons";
  }

  // 탈퇴 사유는 회원 메뉴의 탭 — 사이드바 하이라이트는 '회원'으로
  if (pathname.startsWith("/admin/withdrawal-reasons")) {
    return "members";
  }

  if (pathname.startsWith("/admin/members")) {
    return "members";
  }

  return "overview";
}
