export const adminNavigationItems = [
  { key: "overview", label: "개요", to: "/admin", icon: "📊" },
  { key: "pickups", label: "수거", to: "/admin/pickups", icon: "📦" },
  { key: "inspection", label: "검수", to: "/admin/inspections", icon: "🔍" },
  { key: "catalog", label: "상품", to: "/admin/catalog", icon: "📚" },
  { key: "products", label: "상품 마스터", to: "/admin/products", icon: "🗂" },
  { key: "orders", label: "주문", to: "/admin/orders", icon: "🛒" },
  { key: "settlements", label: "정산", to: "/admin/settlements", icon: "💰" },
  { key: "coupons", label: "쿠폰", to: "/admin/coupons", icon: "🎟" },
  { key: "members", label: "회원", to: "/admin/members", icon: "👤" },
  { key: "studio", label: "스튜디오", to: "/admin/studio", icon: "📷" },
];

export function resolveActiveAdminModule({ pathname, explicitModule }) {
  if (explicitModule) {
    return explicitModule;
  }

  if (pathname.startsWith("/admin/studio")) {
    return "studio";
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
