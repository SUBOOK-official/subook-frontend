import assert from "node:assert/strict";
import test from "node:test";
import { isPrerenderProductVisible } from "../../api/prerender-product.js";

test("공유·검색 봇도 전일 품절 모의고사에 접근하되 숨긴 재고는 공개하지 않는다", () => {
  const product = { brand: "전일학원", book_type: "모의고사", status: "hidden" };
  const sold = [{ status: "reserved", is_public: false }];
  assert.equal(isPrerenderProductVisible(product, sold), true);
  assert.equal(isPrerenderProductVisible(product, [{ status: "settled" }]), true);
  assert.equal(isPrerenderProductVisible(product, [...sold, { status: "on_sale", is_public: false }]), false);
  assert.equal(isPrerenderProductVisible(product, [{ status: "discarded" }]), false);
  assert.equal(isPrerenderProductVisible({ ...product, brand: "시대인재" }, sold), false);
  assert.equal(isPrerenderProductVisible({ ...product, book_type: "N제" }, sold), false);
  assert.equal(isPrerenderProductVisible(product, []), false);
  assert.equal(isPrerenderProductVisible(null, sold), false);
});
