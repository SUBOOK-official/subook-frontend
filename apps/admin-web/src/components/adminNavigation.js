// 사용 빈도 순으로 정렬 (운영자 일과: 수거 → 검수 → 주문 → 정산 → 상품 마스터 → 회원 ...).
// catalog(/admin/catalog) 라우트는 거의 빈 화면이라 사이드바에서 제외했지만 라우트 자체는 App.jsx에 유지.
export const adminNavigationItems = [
  { key: "overview", label: "개요", to: "/admin", icon: "📊" },
  { key: "pickups", label: "수거", to: "/admin/pickups", icon: "📦" },
  { key: "inspection", label: "검수", to: "/admin/inspections", icon: "🔍" },
  { key: "orders", label: "주문", to: "/admin/orders", icon: "🛒" },
  { key: "settlements", label: "정산", to: "/admin/settlements", icon: "💰" },
  { key: "products", label: "상품 마스터", to: "/admin/products", icon: "🗂" },
  { key: "members", label: "회원", to: "/admin/members", icon: "👤" },
  { key: "studio", label: "스튜디오", to: "/admin/studio", icon: "📷" },
  { key: "coupons", label: "쿠폰", to: "/admin/coupons", icon: "🎟" },
  { key: "notices", label: "공지사항", to: "/admin/notices", icon: "📣" },
  { key: "faqs", label: "FAQ", to: "/admin/faqs", icon: "❓" },
  { key: "analytics", label: "분석", to: "/admin/analytics", icon: "📈" },
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
