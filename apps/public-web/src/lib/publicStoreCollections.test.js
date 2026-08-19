import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INSTRUCTOR_COLLECTIONS,
  SERIES_COLLECTIONS,
  findInstructorCollection,
  findInstructorCollectionByName,
  findSeriesCollection,
  findSeriesForTitle,
  getInstructorCollectionMeta,
  getSeriesCollectionMeta,
} from "./publicStoreCollections.js";

test("컬렉션 슬러그는 중복 없이 유일하다 (라우트·사이트맵 충돌 방지)", () => {
  const seriesSlugs = SERIES_COLLECTIONS.map((series) => series.slug);
  const instructorSlugs = INSTRUCTOR_COLLECTIONS.map((instructor) => instructor.slug);
  assert.equal(new Set(seriesSlugs).size, seriesSlugs.length);
  assert.equal(new Set(instructorSlugs).size, instructorSlugs.length);
});

test("findSeriesCollection / findInstructorCollection 은 슬러그로 조회하고 없으면 null", () => {
  assert.equal(findSeriesCollection("숏컷")?.label, "시대인재 숏컷");
  assert.equal(findSeriesCollection(" 숏컷 ")?.label, "시대인재 숏컷");
  assert.equal(findSeriesCollection("없는시리즈"), null);
  assert.equal(findInstructorCollection("박종민")?.subject, "수학");
  assert.equal(findInstructorCollection("없는강사"), null);
});

test("findSeriesForTitle 은 상품명 한/영 표기 모두 매칭한다", () => {
  assert.equal(findSeriesForTitle("2026 시대인재 숏컷 수학1")?.slug, "숏컷");
  assert.equal(findSeriesForTitle("2025 시대인재 SHORTCUT 미적분")?.slug, "숏컷");
  assert.equal(findSeriesForTitle("2026 시대인재 서바이벌 모의고사 수학")?.slug, "서바이벌");
  // '서바' 축약 표기도 서바이벌 시리즈로 매칭
  assert.equal(findSeriesForTitle("2026 시대인재 서바 지구과학1")?.slug, "서바이벌");
  assert.equal(findSeriesForTitle("2026 메가스터디 수분감 수학2"), null);
  assert.equal(findSeriesForTitle(""), null);
  assert.equal(findSeriesForTitle(null), null);
});

test("findInstructorCollectionByName 은 정확 일치만 허용한다", () => {
  assert.equal(findInstructorCollectionByName("박종민")?.slug, "박종민");
  assert.equal(findInstructorCollectionByName("박종민T"), null);
  assert.equal(findInstructorCollectionByName(""), null);
});

test("시리즈 메타 문구 공식 — 프리렌더(prerender-collection.js)와 동일해야 한다", () => {
  const meta = getSeriesCollectionMeta(findSeriesCollection("숏컷"));
  assert.equal(meta.title, "시대인재 숏컷 교재");
  assert.equal(
    meta.description,
    "시대인재 숏컷 교재 구매 — 검수 완료된 새 책 수준의 미사용 교재를 합리적인 가격에.",
  );
  assert.equal(meta.canonicalPath, `/store/series/${encodeURIComponent("숏컷")}`);
});

test("강사 메타 문구 공식 — 프리렌더(prerender-collection.js)와 동일해야 한다", () => {
  const meta = getInstructorCollectionMeta(findInstructorCollection("이신혁"));
  assert.equal(meta.title, "이신혁 지구과학 교재");
  assert.equal(
    meta.description,
    "시대인재 이신혁 지구과학 교재 구매 — 검수 완료된 새 책 수준의 미사용 교재를 합리적인 가격에.",
  );
  assert.equal(meta.canonicalPath, `/store/instructor/${encodeURIComponent("이신혁")}`);
});
