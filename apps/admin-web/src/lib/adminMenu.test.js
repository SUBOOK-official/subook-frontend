import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_MENU,
  buildAdminCommands,
  buildEntitySearches,
  getAdminMenu,
  resolveAdminLocation,
  searchAdminCommands,
  toChosung,
} from "./adminMenu.js";

const items = ADMIN_MENU.flatMap((group) => group.items);

test("메뉴 key와 주소는 서로 겹치지 않는다", () => {
  const keys = items.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  const routes = items.flatMap((item) => (item.tabs ? item.tabs.map((tab) => tab.to) : [item.to]));
  assert.equal(new Set(routes).size, routes.length);
});

test("탭이 있는 메뉴는 첫 탭이 메뉴 주소와 같다", () => {
  for (const item of items.filter((entry) => entry.tabs)) {
    assert.equal(item.tabs[0].to, item.to, item.key);
  }
});

test("주소로 메뉴와 탭을 찾는다", () => {
  const stock = resolveAdminLocation({ pathname: "/admin/inventory-insights" });
  assert.equal(stock.item.key, "products");
  assert.equal(stock.tab.key, "inventory-insights");
  assert.equal(stock.isMenuRoute, true);

  const home = resolveAdminLocation({ pathname: "/admin" });
  assert.equal(home.item.key, "overview");
  assert.equal(home.isMenuRoute, true);

  // 주소가 페이지가 넘긴 모듈 키보다 우선한다 (탈퇴 사유 화면은 activeModule="members"를 넘긴다)
  const withdrawal = resolveAdminLocation({ pathname: "/admin/withdrawal-reasons", explicitModule: "members" });
  assert.equal(withdrawal.tab.key, "withdrawal-reasons");
});

test("상세 화면은 속한 메뉴로 묶이고 메뉴 화면이 아니라고 표시된다", () => {
  const detail = resolveAdminLocation({ pathname: "/admin/shipments/123", explicitModule: "pickups" });
  assert.equal(detail.item.key, "pickups");
  assert.equal(detail.isMenuRoute, false);

  const legacy = resolveAdminLocation({ pathname: "/admin/unknown", explicitModule: "inspection" });
  assert.equal(legacy.item.key, "pickups");

  const guide = resolveAdminLocation({ pathname: "/admin/integrations", explicitModule: "integrations" });
  assert.equal(guide.item.key, "meta-ads");
  assert.equal(guide.isMenuRoute, false);
});

test("교재 등록 담당 계정은 상품 등록 메뉴 하나만 본다", () => {
  const menu = getAdminMenu("intake");
  assert.deepEqual(menu.flatMap((group) => group.items.map((item) => item.to)), ["/admin/register"]);
  assert.equal(menu[0].items[0].tabs, undefined, "상세 사진 촬영·AI 표지 변환 탭은 없다");
  assert.equal(getAdminMenu("admin"), ADMIN_MENU);
  assert.equal(getAdminMenu(undefined), ADMIN_MENU);

  const register = resolveAdminLocation({ pathname: "/admin/register", explicitModule: "register", role: "intake" });
  assert.equal(register.item.key, "register");
  assert.equal(register.tab, null);
  assert.equal(register.isMenuRoute, true);
  // 다른 주소에 있어도(이동 직전) 상품 등록 메뉴로만 본다
  const elsewhere = resolveAdminLocation({ pathname: "/admin/orders", role: "intake" });
  assert.equal(elsewhere.item.key, "register");
  assert.equal(elsewhere.isMenuRoute, false);
});

test("직원 계정은 사이드바 목록에 넣지 않고 통합 검색으로 찾는다", () => {
  const sidebarItems = ADMIN_MENU.filter((group) => group.sidebar !== false).flatMap((group) => group.items);
  assert.equal(sidebarItems.length, 16, "사이드바 메뉴는 한 화면에 들어오는 16개를 유지한다");
  assert.equal(sidebarItems.some((item) => item.key === "staff"), false);
  const staff = resolveAdminLocation({ pathname: "/admin/staff" });
  assert.equal(staff.item.key, "staff");
  assert.equal(staff.isMenuRoute, true);
  const commands = buildAdminCommands();
  for (const word of ["알바", "직원", "권한", "비밀번호"]) {
    assert.equal(searchAdminCommands(word, commands)[0].to, "/admin/staff", word);
  }
});

test("초성 변환", () => {
  assert.equal(toChosung("주문·배송"), "ㅈㅁㅂㅅ");
  assert.equal(toChosung("FAQ 관리"), "faqㄱㄹ");
});

test("이름·찾기 낱말·초성으로 메뉴와 기능을 찾는다", () => {
  const commands = buildAdminCommands();
  assert.equal(searchAdminCommands("정산", commands)[0].to, "/admin/settlements");
  assert.equal(searchAdminCommands("ㅈㅅ", commands)[0].to, "/admin/settlements");
  assert.equal(searchAdminCommands("재고 분석", commands)[0].to, "/admin/inventory-insights");
  // 화면 이름이 아니라 운영자가 부르는 말로도 찾는다
  assert.ok(searchAdminCommands("송장", commands).some((command) => command.to === "/admin/orders?view=fulfillment"));
  assert.ok(searchAdminCommands("환불", commands).some((command) => command.to === "/admin/orders?view=refunds"));
  assert.ok(searchAdminCommands("알림톡", commands).some((command) => command.to === "/admin/notification-logs"));
  assert.ok(searchAdminCommands("탈퇴", commands).some((command) => command.to === "/admin/withdrawal-reasons"));
  assert.deepEqual(searchAdminCommands("", commands), []);
  assert.deepEqual(searchAdminCommands("없는메뉴이름", commands), []);
});

test("입력 형태에 따라 데이터 검색 대상을 고른다", () => {
  assert.deepEqual(buildEntitySearches("a"), []);
  assert.deepEqual(buildEntitySearches("ㅈㅅ"), []);
  assert.equal(buildEntitySearches("ORD-2609-0373")[0].to, "/admin/orders?q=ORD-2609-0373");
  assert.equal(buildEntitySearches("PU-2611-0007")[0].to, "/admin/pickups?q=PU-2611-0007");
  assert.ok(buildEntitySearches("0101234").at(0).to.startsWith("/admin/members?q="));
  const byName = buildEntitySearches("홍길동").map((entry) => entry.to.split("?")[0]);
  assert.deepEqual(byName.slice(0, 2), ["/admin/orders", "/admin/members"]);
  assert.equal(buildEntitySearches("책 제목")[0].to, "/admin/orders?q=%EC%B1%85%20%EC%A0%9C%EB%AA%A9");
});

test("일성월심 앱 관리는 상품·재고 메뉴의 탭이고, 화면 안 보기는 검색으로도 찾는다", () => {
  const app = resolveAdminLocation({ pathname: "/admin/ilseong" });
  assert.equal(app.item.key, "products");
  assert.equal(app.tab.key, "ilseong-app");
  assert.equal(app.isMenuRoute, true);
  const commands = buildAdminCommands();
  assert.equal(searchAdminCommands("학습지 만들기", commands)[0].to, "/admin/ilseong?view=books");
  assert.equal(searchAdminCommands("수북 상품 만들기", commands)[0].to, "/admin/ilseong?view=sales");
  assert.equal(commands.some((command) => String(command.to).includes("view=codes")), false);
  // 옮겨 온 앱 관리 기능을 운영자가 부르는 말로 찾는다
  assert.equal(searchAdminCommands("기기 해제", commands)[0].to, "/admin/ilseong?view=users");
  assert.equal(searchAdminCommands("교재 직접 등록", commands)[0].to, "/admin/ilseong?view=users");
  assert.equal(searchAdminCommands("PDF 올리기", commands)[0].to, "/admin/ilseong?view=books");
  assert.equal(searchAdminCommands("캡처 막기", commands)[0].to, "/admin/ilseong?view=app-config");
  assert.equal(searchAdminCommands("앱 관리 기록", commands)[0].to, "/admin/ilseong?view=actions");
});
