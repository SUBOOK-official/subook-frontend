// 운영자 IA 그룹핑: 운영(수거→검수→주문→정산) / 카탈로그(상품·스튜디오) / 마케팅(쿠폰·공지·FAQ) / 분석·회원.
// 사이드바 평면 12개 나열은 신입 매니저 학습 비용이 컸음. 그룹 헤더 추가로 의미적 분류 노출.
export const adminNavigationGroups = [
  {
    key: "overview",
    label: null, // hero — 그룹 헤더 없이 단독 노출
    items: [
      { key: "overview", label: "개요", to: "/admin", icon: "📊" },
    ],
  },
  {
    key: "ops",
    label: "운영",
    items: [
      { key: "pickups", label: "수거", to: "/admin/pickups", icon: "📦" },
      { key: "inspection", label: "검수", to: "/admin/inspections", icon: "🔍" },
      { key: "orders", label: "주문", to: "/admin/orders", icon: "🛒" },
      { key: "settlements", label: "정산", to: "/admin/settlements", icon: "💰" },
    ],
  },
  {
    key: "catalog",
    label: "카탈로그",
    items: [
      { key: "products", label: "상품 마스터", to: "/admin/products", icon: "🗂" },
      { key: "studio", label: "사진 스튜디오 (AI)", to: "/admin/studio", icon: "📷" },
    ],
  },
  {
    key: "marketing",
    label: "마케팅",
    items: [
      { key: "coupons", label: "쿠폰", to: "/admin/coupons", icon: "🎟" },
      { key: "notices", label: "공지사항", to: "/admin/notices", icon: "📣" },
      { key: "faqs", label: "FAQ", to: "/admin/faqs", icon: "❓" },
    ],
  },
  {
    key: "data",
    label: "회원·분석",
    items: [
      { key: "members", label: "회원", to: "/admin/members", icon: "👤" },
      { key: "analytics", label: "분석", to: "/admin/analytics", icon: "📈" },
    ],
  },
];

// 평면 리스트 (호환용 — 기존 코드가 adminNavigationItems를 import하는 경우 대비)
export const adminNavigationItems = adminNavigationGroups.flatMap((group) => group.items);

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

  if (pathname.startsWith("/admin/products")) {
    return "products";
  }

  if (pathname.startsWith("/admin/catalog")) {
    return "catalog";
  }

  if (pathname.startsWith("/admin/orders")) {
    return "orders";
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
