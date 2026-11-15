import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_MENU,
  buildAdminCommands,
  buildEntitySearches,
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
