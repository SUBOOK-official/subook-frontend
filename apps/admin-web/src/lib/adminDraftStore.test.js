import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminDraftStore } from "./adminDraftStore.js";
test("수거별 초안 격리 및 다른 탭의 쓰기/삭제 충돌 감지", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const a = createAdminDraftStore(storage, 1), b = createAdminDraftStore(storage, 2), other = createAdminDraftStore(storage, 1);
  a.write({ title: "수학" }); b.write({ title: "국어" });
  assert.equal(createAdminDraftStore(storage, 1).read().title, "수학");
  assert.equal(createAdminDraftStore(storage, 2).read().title, "국어");
  assert.throws(() => other.write({ title: "덮어쓰기" }), /다른 탭/);
  assert.throws(() => other.clear(), /다른 탭/);
  a.clear(); assert.equal(createAdminDraftStore(storage, 2).read().title, "국어");
});
