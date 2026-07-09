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
  ReceiptIcon,
  SearchIcon,
  TicketIcon,
  TrendingUpIcon,
  UserIcon,
} from "./icons";

export const adminNavigationGroups = [
  {
    key: "overview",
    label: null, // hero — 그룹 헤더 없이 단독 노출
    items: [
      { key: "overview", label: "개요", to: "/admin", icon: ChartBarIcon },
    ],
  },
  {
    key: "ops",
    label: "운영",
    items: [
      { key: "pickups", label: "수거", to: "/admin/pickups", icon: BoxIcon },
      { key: "inspection", label: "검수", to: "/admin/inspections", icon: SearchIcon },
      { key: "orders", label: "주문", to: "/admin/orders", icon: CartIcon },
      { key: "settlements", label: "정산", to: "/admin/settlements", icon: CoinIcon },
      { key: "manual-settlements", label: "수동 정산", to: "/admin/manual-settlements", icon: ReceiptIcon },
    ],
  },
  {
    key: "catalog",
    label: "카탈로그",
    items: [
      { key: "register", label: "상품 등록", to: "/admin/register", icon: PlusIcon },
      { key: "products", label: "상품 마스터", to: "/admin/products", icon: FolderIcon },
      { key: "studio", label: "사진 스튜디오 (AI)", to: "/admin/studio", icon: CameraIcon },
    ],
  },
  {
    key: "marketing",
    label: "마케팅",
    items: [
      { key: "coupons", label: "쿠폰", to: "/admin/coupons", icon: TicketIcon },
      { key: "notices", label: "공지사항", to: "/admin/notices", icon: MegaphoneIcon },
      { key: "faqs", label: "FAQ", to: "/admin/faqs", icon: HelpCircleIcon },
    ],
  },
  {
    key: "data",
    label: "회원·분석",
    items: [
      { key: "members", label: "회원", to: "/admin/members", icon: UserIcon },
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

  if (pathname.startsWith("/admin/shipments/") || pathname.startsWith("/admin/inspections")) {
    return "inspection";
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
    return "catalog";
  }

  if (pathname.startsWith("/admin/orders")) {
    return "orders";
  }

  if (pathname.startsWith("/admin/manual-settlements")) {
    return "manual-settlements";
  }

  if (pathname.startsWith("/admin/settlements")) {
    return "settlements";
  }

  if (pathname.startsWith("/admin/coupons")) {
    return "coupons";
  }

  if (pathname.startsWith("/admin/members")) {
    return "members";
  }

  return "overview";
}
