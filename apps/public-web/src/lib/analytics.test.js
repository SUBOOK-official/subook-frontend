import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  makeOnceGuard,
  sanitizeParams,
  trackBuyClick,
  trackEvent,
  trackException,
  trackPurchase,
  trackSelectContent,
} from "./analytics.js";

// gtag 호출을 가로채는 최소 window 스텁 — 모듈은 호출 시점에만 window를 읽는다.
let calls = [];
beforeEach(() => {
  calls = [];
  globalThis.window = {
    gtag: (...args) => {
      calls.push(args);
    },
  };
});

test("sanitizeParams: 빈 값 제거·100자 클램프·camelCase→snake_case", () => {
  const long = "가".repeat(150);
  const out = sanitizeParams({
    uiSurface: "hero",
    empty: "",
    nothing: null,
    missing: undefined,
    longText: long,
    count: 3,
    nan: Number.NaN,
    flag: true,
    items: [{ item_id: "1" }],
    emptyItems: [],
    nested: { a: 1 },
  });
  assert.deepEqual(Object.keys(out).sort(), ["count", "flag", "items", "long_text", "ui_surface"]);
  assert.equal(out.long_text.length, 100);
  assert.equal(out.ui_surface, "hero");
  assert.equal(out.count, 3);
  assert.equal(out.flag, true);
});

test("trackEvent: 이름 규칙 위반은 버리고, 유효하면 정제된 파라미터로 전송", () => {
  trackEvent("Bad-Name", { a: 1 });
  trackEvent("a".repeat(41), { a: 1 });
  assert.equal(calls.length, 0);
  trackEvent("cart_select_all", { uiAction: "select_all", itemCount: 4, note: "" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["event", "cart_select_all", { ui_action: "select_all", item_count: 4 }]);
});

test("trackException: description 클램프 + fatal 기본 false, extra로 덮어쓰기 가능", () => {
  trackException("product_not_found", { itemId: "42" });
  trackException("boundary_crash", { fatal: true, errorMessage: "boom" });
  assert.deepEqual(calls[0], [
    "event",
    "exception",
    { description: "product_not_found", fatal: false, item_id: "42" },
  ]);
  assert.deepEqual(calls[1], [
    "event",
    "exception",
    { description: "boundary_crash", fatal: true, error_message: "boom" },
  ]);
});

test("trackBuyClick: ui_surface·extra가 표준 파라미터와 함께 실린다", () => {
  trackBuyClick("buy_now", { productId: 7, itemCount: 2, value: 30000, uiSurface: "sticky_bar" });
  const [, name, params] = calls[0];
  assert.equal(name, "buy_click");
  assert.equal(params.buy_type, "buy_now");
  assert.equal(params.item_id, "7");
  assert.equal(params.item_count, 2);
  assert.equal(params.ui_surface, "sticky_bar");
  assert.equal(params.value, 30000);
  assert.equal(params.currency, "KRW");
});

test("trackPurchase: checkout_type 등 extra 전달, items index 포함", () => {
  trackPurchase({
    transactionId: "ORD-1",
    value: 12000,
    shipping: 3000,
    items: [{ productId: 1, title: "책", price: 9000, quantity: 1, index: 0 }],
    checkoutType: "guest",
  });
  const [, name, params] = calls[0];
  assert.equal(name, "purchase");
  assert.equal(params.transaction_id, "ORD-1");
  assert.equal(params.checkout_type, "guest");
  assert.equal(params.items[0].index, 0);
  assert.equal(params.shipping, 3000);
});

test("trackSelectContent: content_id 없으면 생략", () => {
  trackSelectContent("nav", "", { uiSurface: "header_desktop" });
  assert.deepEqual(calls[0], [
    "event",
    "select_content",
    { content_type: "nav", ui_surface: "header_desktop" },
  ]);
});

test("makeOnceGuard: 같은 key는 한 번만 true", () => {
  const once = makeOnceGuard();
  assert.equal(once("a"), true);
  assert.equal(once("a"), false);
  assert.equal(once("b"), true);
  assert.equal(once(), true);
  assert.equal(once(), false);
});

test("window 없는 환경에서는 조용히 no-op", () => {
  delete globalThis.window;
  assert.doesNotThrow(() => trackEvent("cart_open", { uiSurface: "x" }));
});
