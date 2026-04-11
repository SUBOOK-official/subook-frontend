export const adminNavigationItems = [
  { key: "overview", label: "개요", to: "/admin" },
  { key: "pickups", label: "수거", to: "/admin/pickups" },
  { key: "inspection", label: "검수", to: "/admin/inspections" },
  { key: "catalog", label: "상품", to: "/admin/catalog" },
  { key: "orders", label: "주문", to: "/admin/orders" },
  { key: "settlements", label: "정산", to: "/admin/settlements" },
  { key: "members", label: "회원", to: "/admin/members" },
  { key: "studio", label: "스튜디오", to: "/admin/studio" },
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

  if (pathname.startsWith("/admin/catalog")) {
    return "catalog";
  }

  if (pathname.startsWith("/admin/orders")) {
    return "orders";
  }

  if (pathname.startsWith("/admin/settlements")) {
    return "settlements";
  }

  if (pathname.startsWith("/admin/members")) {
    return "members";
  }

  return "overview";
}
