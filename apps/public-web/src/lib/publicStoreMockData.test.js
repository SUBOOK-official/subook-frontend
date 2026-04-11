import assert from "node:assert/strict";
import test from "node:test";
import {
  STORE_MOCK_MODE_QUERY_KEY,
  STORE_MOCK_MODE_STORAGE_KEY,
  getMockStoreProductRows,
  readStoreMockModePreference,
} from "./publicStoreMockData.js";

test("getMockStoreProductRows provides a reusable storefront fixture catalog", () => {
  const rows = getMockStoreProductRows();

  assert.ok(rows.length >= 18);
  assert.ok(rows.every((row) => typeof row.id === "string" && row.id.startsWith("mock-book-")));
  assert.ok(rows.every((row) => Array.isArray(row.options) && row.options.length > 0));
  assert.ok(rows.some((row) => row.status === "sold_out"));
  assert.ok(rows.some((row) => row.subject === "수학"));
  assert.ok(rows.some((row) => row.subject === "국어"));
  assert.ok(rows.some((row) => row.subject === "영어"));
});

test("readStoreMockModePreference syncs the query parameter into localStorage", () => {
  const originalWindow = global.window;
  const storage = new Map();

  global.window = {
    location: {
      search: `?${STORE_MOCK_MODE_QUERY_KEY}=1`,
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
  };

  try {
    assert.equal(readStoreMockModePreference(), true);
    assert.equal(storage.get(STORE_MOCK_MODE_STORAGE_KEY), "true");
  } finally {
    global.window = originalWindow;
  }
});
