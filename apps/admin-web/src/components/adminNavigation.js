import { ADMIN_MENU, INTAKE_MENU, resolveAdminLocation } from "../lib/adminMenu";
import {
  BellIcon,
  BookIcon,
  BoxIcon,
  CartIcon,
  ClockIcon,
  CoinIcon,
  FileTextIcon,
  HomeIcon,
  KeyIcon,
  LayoutIcon,
  MegaphoneIcon,
  MessageIcon,
  PlusIcon,
  StarIcon,
  TicketIcon,
  TrendingUpIcon,
  UserIcon,
} from "./icons";

// lib/adminMenu.js 의 icon 이름 → 아이콘 컴포넌트.
// 메뉴 데이터는 순수 JS로 두고(단위 테스트 가능), 화면에서만 컴포넌트로 바꾼다.
export const adminMenuIcons = {
  home: HomeIcon,
  box: BoxIcon,
  plus: PlusIcon,
  book: BookIcon,
  cart: CartIcon,
  coin: CoinIcon,
  message: MessageIcon,
  user: UserIcon,
  star: StarIcon,
  bell: BellIcon,
  layout: LayoutIcon,
  ticket: TicketIcon,
  megaphone: MegaphoneIcon,
  file: FileTextIcon,
  trending: TrendingUpIcon,
  clock: ClockIcon,
  key: KeyIcon,
};

const withIcons = (menu) =>
  menu.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, icon: adminMenuIcons[item.icon] || HomeIcon })),
  }));

// sidebar: false 인 그룹(설정)은 사이드바 목록에서 뺀다 — 계정 영역 링크·통합 검색으로 들어간다.
export const adminNavigationGroups = withIcons(ADMIN_MENU.filter((group) => group.sidebar !== false));
// 교재 등록 담당 계정용 — 상품 등록 하나
export const intakeNavigationGroups = withIcons(INTAKE_MENU);

// 사이드바에서 강조할 메뉴 key
export function resolveActiveAdminModule({ pathname, explicitModule }) {
  return resolveAdminLocation({ pathname, explicitModule }).item.key;
}
