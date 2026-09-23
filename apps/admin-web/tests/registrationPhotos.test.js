import test from "node:test";
import assert from "node:assert/strict";
import { getRegistrationDetailUrls } from "../src/lib/registrationPhotos.js";

test("상세 미첨부 상품은 AI 결과가 아닌 회전된 실물 표지를 사용한다", () => {
  assert.deepEqual(getRegistrationDetailUrls({
    coverUrl: "ai-studio.jpg", originalCoverUrl: "physical-portrait.png", detailUrls: [],
  }), ["physical-portrait.png"]);
});

test("운영자가 추가한 상세 사진을 기본 표지가 덮어쓰지 않는다", () => {
  const item = { originalCoverUrl: "physical.png", detailUrls: ["inside-1.jpg", "inside-2.jpg"] };
  assert.deepEqual(getRegistrationDetailUrls(item), ["inside-1.jpg", "inside-2.jpg"]);
  assert.deepEqual(getRegistrationDetailUrls({ ...item, detailUrls: [] }), ["physical.png"]);
});

test("초안 복원과 AI 재변환 후에도 같은 실물 원본을 사용한다", () => {
  const restored = JSON.parse(JSON.stringify({ originalCoverUrl: "physical.png", detailUrls: [], coverUrl: "first-ai.jpg" }));
  restored.coverUrl = "second-ai.jpg";
  assert.deepEqual(getRegistrationDetailUrls(restored), ["physical.png"]);
});

test("원본이 없는 과거 상품의 AI 표지를 실물 사진으로 표시하지 않는다", () => {
  assert.deepEqual(getRegistrationDetailUrls({ coverUrl: "ai-studio.jpg", detailUrls: [] }), []);
  assert.deepEqual(getRegistrationDetailUrls(undefined), []);
});
