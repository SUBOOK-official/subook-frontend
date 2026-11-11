import test from "node:test";
import assert from "node:assert/strict";
import { registrationVisibilityLabel } from "./registrationVisibility.js";

test("일부 재고만 공개되면 실제 공개·비공개 권수를 표시한다", () => {
  assert.equal(registrationVisibilityLabel({ created_books: 10, published_books: 7, unpublished_books: 3 }), "스토어 공개 7권 · 비공개 3권");
  assert.equal(registrationVisibilityLabel({ created_books: 2, published_books: 0, unpublished_books: 2 }), "스토어 공개 0권 · 비공개 2권");
  assert.equal(registrationVisibilityLabel({ created_books: 2, published_books: 2, unpublished_books: 0 }), "스토어 공개 2권 · 비공개 0권");
});

test("이전 서버 또는 잘못된 응답을 공개 성공으로 표시하지 않는다", () => {
  for (const result of [undefined, {}, { created_books: 2 }, { created_books: 2, published_books: 3, unpublished_books: -1 }, { created_books: 2, published_books: 1, unpublished_books: 0 }]) {
    assert.equal(registrationVisibilityLabel(result), "공개 상태 확인 필요");
  }
});
