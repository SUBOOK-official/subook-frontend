import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  applyOrderAttributionAnalyticsContext,
  captureOrderAttribution,
  getOrderAttributionAnalyticsParams,
  readOrderAttribution,
} from "./orderAttribution.js";
import { attachOrderAttributionContext } from "../../../../packages/shared-supabase/src/orderAttributionClient.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function capture(url, { storage = createStorage(), referrer = "", now = 1_789_171_200_000 } = {}) {
  const location = new URL(url);
  return {
    result: captureOrderAttribution({
      production: true,
      location,
      document: { referrer },
      navigator: { globalPrivacyControl: false },
      storage,
      now,
    }),
    storage,
  };
}

test("광고 UTM과 클릭 종류를 저장하되 원시 클릭 ID와 임의 쿼리는 남기지 않는다", () => {
  const { result, storage } = capture(
    "https://subook.kr/store/10?utm_source=Instagram&utm_medium=CPC&utm_campaign=fall_sale&fbclid=secret-click&email=user@example.com",
    { referrer: "https://l.instagram.com/redirect?private=value" },
  );

  assert.equal(result.first_touch.source, "instagram");
  assert.equal(result.first_touch.medium, "cpc");
  assert.equal(result.first_touch.campaign, "fall_sale");
  assert.deepEqual(result.first_touch.click_id_types, ["fbclid"]);
  assert.equal(result.first_touch.referrer_host, "l.instagram.com");
  assert.equal(result.first_touch.landing_path, "/store/10");
  const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
  assert.equal(raw.includes("secret-click"), false);
  assert.equal(raw.includes("user@example.com"), false);
});

test("로그인·결제 리퍼러와 직접 재방문은 마지막 유효 유입을 덮지 않는다", () => {
  const storage = createStorage();
  capture("https://subook.kr/?utm_source=naver&utm_medium=cpc&utm_campaign=brand", { storage });
  capture("https://subook.kr/auth/callback", {
    storage,
    referrer: "https://accounts.google.com/",
    now: 1_789_171_260_000,
  });
  capture("https://subook.kr/order/complete/1", {
    storage,
    referrer: "https://pay.nicepay.co.kr/",
    now: 1_789_171_320_000,
  });

  const stored = readOrderAttribution({ storage, now: 1_789_171_320_000 });
  assert.equal(stored.first_touch.source, "naver");
  assert.equal(stored.last_touch.source, "naver");
  assert.equal(stored.last_touch.campaign, "brand");
});

test("외부 자연 유입을 분류하고 90일 뒤에는 만료한다", () => {
  const { result, storage } = capture("https://subook.kr/store/20", {
    referrer: "https://m.search.naver.com/search.naver?query=test",
  });
  assert.equal(result.first_touch.source, "naver");
  assert.equal(result.first_touch.medium, "organic");
  assert.equal(
    readOrderAttribution({ storage, now: result.expires_at + 1 }),
    null,
  );
  assert.equal(result.expires_at - result.updated_at, ATTRIBUTION_TTL_MS);
});

test("GA 대체 파라미터는 최초·최종 유입만 반환한다", () => {
  const attribution = {
    first_touch: { source: "instagram", medium: "social" },
    last_touch: {
      source: "facebook",
      medium: "cpc",
      campaign: "fall_sale",
      click_id_types: ["fbclid"],
    },
  };
  assert.deepEqual(getOrderAttributionAnalyticsParams(attribution), {
    attribution_source: "facebook",
    attribution_medium: "cpc",
    attribution_campaign: "fall_sale",
    first_touch_source: "instagram",
    first_touch_medium: "social",
    attribution_click_id_types: "fbclid",
  });
});

test("저장한 출처를 이후 GA 방문·행동 이벤트의 공통 문맥으로 설정한다", () => {
  const calls = [];
  const applied = applyOrderAttributionAnalyticsContext({
    attribution: {
      first_touch: { source: "naver", medium: "organic" },
      last_touch: { source: "instagram", medium: "cpc", campaign: "fall_sale" },
    },
    gtag: (...args) => calls.push(args),
  });
  assert.equal(applied, true);
  assert.deepEqual(calls, [["set", {
    attribution_source: "instagram",
    attribution_medium: "cpc",
    attribution_campaign: "fall_sale",
    first_touch_source: "naver",
    first_touch_medium: "organic",
  }]]);
});

test("주문 출처 RPC는 일시적 실패만 재시도하고 결제를 막지 않는다", async () => {
  let attempts = 0;
  const client = {
    rpc(name, params) {
      assert.equal(name, "attach_order_attribution_context");
      assert.equal(params.p_order_number, "ORD-TEST");
      attempts += 1;
      return {
        abortSignal: async () =>
          attempts === 1
            ? { data: null, error: { code: "NETWORK" } }
            : { data: { recorded: true }, error: null },
      };
    },
  };
  const recorded = await attachOrderAttributionContext({
    client,
    orderNumber: "ORD-TEST",
    attribution: { version: 1, first_touch: {}, last_touch: {} },
  });
  assert.equal(recorded, true);
  assert.equal(attempts, 2);
});

test("GPC 또는 비운영 주소에서는 출처를 저장하지 않는다", () => {
  const storage = createStorage();
  const location = new URL("https://preview.example.com/?utm_source=test");
  const result = captureOrderAttribution({
    production: true,
    location,
    document: { referrer: "" },
    navigator: { globalPrivacyControl: true },
    storage,
  });
  assert.equal(result, null);
  assert.equal(storage.getItem(ATTRIBUTION_STORAGE_KEY), null);
});
