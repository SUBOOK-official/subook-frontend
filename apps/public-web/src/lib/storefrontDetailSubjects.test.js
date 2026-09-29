import test from "node:test";
import assert from "node:assert/strict";
import { matchesDetailSubjects } from "./storefrontDetailSubjects.js";
import { parseStorefrontQuery, serializeStorefrontQuery } from "./publicStoreNavigation.js";
test("matches subject spelling variants and combines multiple choices with OR",()=>{
  assert.equal(matchesDetailSubjects({title:'2026 물리Ⅰ 모의고사'},['물리학']),true);
  assert.equal(matchesDetailSubjects({title:'수능 생활과 윤리'},['생활과윤리']),true);
  assert.equal(matchesDetailSubjects({title:'사회·문화 기출'},['사회문화']),true);
  assert.equal(matchesDetailSubjects({title:'생윤 N제'},['생활과윤리']),true);
  assert.equal(matchesDetailSubjects({title:'지구과학Ⅱ'},['물리학','지구과학']),true);
  assert.equal(matchesDetailSubjects({title:'생명과학Ⅰ'},['물리학']),false);
});
test("only accepts subsubjects belonging to selected parent and preserves them through navigation",()=>{
  const parsed=parseStorefrontQuery('?subject=과학&detailSubject=물리학,화학,경제&discount=sale&sort=discount_desc');
  assert.deepEqual(parsed.selectedFilters.detailSubjects,['물리학','화학']);
  const serialized=serializeStorefrontQuery({...parsed,currentPage:1});
  assert.deepEqual(parseStorefrontQuery(serialized).selectedFilters.detailSubjects,['물리학','화학']);
  assert.deepEqual(parseStorefrontQuery('?subject=국어&detailSubject=물리학').selectedFilters.detailSubjects,[]);
});
