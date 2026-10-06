import { BellIcon, BoxIcon, CameraIcon, CartIcon, ChartBarIcon, CoinIcon, FolderIcon, HelpCircleIcon, InboxIcon, MegaphoneIcon, PlusIcon, StarIcon, TicketIcon, TrendingUpIcon, UserIcon } from "./icons";

export const adminNavigationGroups = [
  { key: "overview", label: null, items: [{ key: "overview", label: "오늘 할 일", to: "/admin", icon: ChartBarIcon }, { key: "work-history", label: "작업·변경 이력", to: "/admin/work-history", icon: InboxIcon }] },
  { key: "intake", label: "입고·검수", items: [
    { key: "pickups", label: "수거·검수", to: "/admin/pickups", icon: BoxIcon },
    { key: "register", label: "상품 등록", to: "/admin/register", icon: PlusIcon },
    { key: "photo-intake", label: "상세 사진 촬영", to: "/admin/photo-intake", icon: InboxIcon },
    { key: "studio", label: "사진 스튜디오", to: "/admin/studio", icon: CameraIcon },
  ] },
  { key: "inventory", label: "상품·재고", items: [
    { key: "products", label: "상품 재고", to: "/admin/products", icon: FolderIcon },
    { key: "inventory-insights", label: "재고 분석", to: "/admin/inventory-insights", icon: ChartBarIcon },
  ] },
  { key: "fulfillment", label: "주문·배송", items: [{ key: "orders", label: "주문·출고·환불", to: "/admin/orders", icon: CartIcon }] },
  { key: "settlement", label: "정산", items: [
    { key: "settlements", label: "정산 지급", to: "/admin/settlements", icon: CoinIcon },
    { key: "settlement-exceptions", label: "확인 필요", to: "/admin/settlement-exceptions", icon: CoinIcon },
  ] },
  { key: "customer", label: "고객·CS", items: [
    { key: "cs", label: "문의 작업함", to: "/admin/cs", icon: HelpCircleIcon },
    { key: "members", label: "회원", to: "/admin/members", icon: UserIcon },
    { key: "reviews", label: "후기", to: "/admin/reviews", icon: StarIcon },
    { key: "notification-logs", label: "알림 이력", to: "/admin/notification-logs", icon: BellIcon },
  ] },
  { key: "content", label: "마케팅·콘텐츠", items: [
    { key: "home-editor", label: "홈 편집", to: "/admin/home-editor", icon: MegaphoneIcon },
    { key: "coupons", label: "쿠폰", to: "/admin/coupons", icon: TicketIcon },
    { key: "meta-ads", label: "메타 광고", to: "/admin/meta-ads", icon: MegaphoneIcon },
    { key: "event-subscriptions", label: "행사 신청", to: "/admin/event-subscriptions", icon: BellIcon },
    { key: "notices", label: "공지사항", to: "/admin/notices", icon: MegaphoneIcon },
    { key: "faqs", label: "FAQ", to: "/admin/faqs", icon: HelpCircleIcon },
  ] },
  { key: "results", label: "성과", items: [
    { key: "performance", label: "매출·유입·광고", to: "/admin/performance", icon: TrendingUpIcon },
    { key: "analytics", label: "운영 분석", to: "/admin/analytics", icon: ChartBarIcon },
  ] },
];

export function resolveActiveAdminModule({ pathname, explicitModule }) {
  if (["themes", "recommendations", "promotions"].includes(explicitModule)) return "home-editor";
  if (explicitModule === "inspection") return "pickups";
  if (explicitModule) return explicitModule;
  if (/^\/admin\/(shipments|inspections)/.test(pathname)) return "pickups";
  if (/^\/admin\/(themes|recommendations|promotions)/.test(pathname)) return "home-editor";
  if (pathname.startsWith("/admin/manual-settlements")) return "settlements";
  if (pathname.startsWith("/admin/withdrawal-reasons")) return "members";
  if (pathname.startsWith("/admin/catalog")) return "products";
  return adminNavigationGroups.flatMap((group) => group.items).find((item) => item.to !== "/admin" && pathname.startsWith(item.to))?.key || "overview";
}
