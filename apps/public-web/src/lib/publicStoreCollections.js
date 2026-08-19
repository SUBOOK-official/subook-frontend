// 시리즈·강사 랜딩(/store/series/:slug, /store/instructor/:slug) 큐레이션 목록.
//
// 선정 근거: 네이버 서치어드바이저 검색 키워드 실측(2026-08, 고노출·저CTR 쿼리)
// + DB 재고(상품 수). 시리즈는 별도 컬럼이 없어 상품명 부분 일치(한/영 표기 배열),
// 강사는 products.instructor_name 정확 일치로 목록을 만든다.
//
// ⚠ api/prerender-collection.js·api/prerender-product.js의 동명 상수와 반드시 동기 유지
//   (봇/사람 동일 콘텐츠 원칙 — api/는 의존성 제로 제약으로 import 불가).
// ⚠ 항목을 추가·삭제하면 public/sitemap-pages.xml의 URL 목록도 함께 갱신할 것.

export const SERIES_COLLECTIONS = [
  { slug: "숏컷", label: "시대인재 숏컷", terms: ["숏컷", "shortcut"] },
  { slug: "볼텍스", label: "시대인재 볼텍스", terms: ["볼텍스", "vortex"] },
  { slug: "엣지", label: "시대인재 엣지", terms: ["엣지", "edge"] },
  { slug: "브릿지", label: "시대인재 브릿지", terms: ["브릿지", "bridge"] },
  { slug: "엑셀러레이터", label: "시대인재 엑셀러레이터", terms: ["엑셀러레이터", "accelerator"] },
  { slug: "서바이벌", label: "시대인재 서바이벌", terms: ["서바"] },
  { slug: "강기본", label: "강기본", terms: ["강기본"] },
];

// subject는 실제 상품 제목에서 확인한 표기(지구과학·생명과학·화학 등 세부 과목) 기준.
export const INSTRUCTOR_COLLECTIONS = [
  { slug: "박종민", name: "박종민", subject: "수학", brand: "시대인재" },
  { slug: "이동준", name: "이동준", subject: "수학", brand: "시대인재" },
  { slug: "안가람", name: "안가람", subject: "수학", brand: "시대인재" },
  { slug: "김현우", name: "김현우", subject: "수학", brand: "시대인재" },
  { slug: "김범찬", name: "김범찬", subject: "수학", brand: "시대인재" },
  { slug: "이신혁", name: "이신혁", subject: "지구과학", brand: "시대인재" },
  { slug: "김강민", name: "김강민", subject: "화학", brand: "시대인재" },
  { slug: "손창빈", name: "손창빈", subject: "국어", brand: "시대인재" },
  { slug: "현우진", name: "현우진", subject: "수학", brand: "메가스터디" },
  { slug: "강민철", name: "강민철", subject: "국어", brand: "메가스터디" },
  { slug: "백호", name: "백호", subject: "생명과학", brand: "메가스터디" },
];

function normalizeSlug(value) {
  return String(value ?? "").trim();
}

export function findSeriesCollection(slug) {
  const normalized = normalizeSlug(slug);
  return SERIES_COLLECTIONS.find((series) => series.slug === normalized) ?? null;
}

export function findInstructorCollection(slug) {
  const normalized = normalizeSlug(slug);
  return INSTRUCTOR_COLLECTIONS.find((instructor) => instructor.slug === normalized) ?? null;
}

// 상품 제목 → 매칭되는 시리즈 (상품 상세의 시리즈 랜딩 교차링크용)
export function findSeriesForTitle(title) {
  const normalizedTitle = String(title ?? "").toLowerCase();
  if (!normalizedTitle) return null;
  return (
    SERIES_COLLECTIONS.find((series) =>
      series.terms.some((term) => normalizedTitle.includes(term.toLowerCase())),
    ) ?? null
  );
}

// 강사명 → 컬렉션 (상품 상세의 강사 랜딩 교차링크용)
export function findInstructorCollectionByName(name) {
  const normalized = normalizeSlug(name);
  if (!normalized) return null;
  return INSTRUCTOR_COLLECTIONS.find((instructor) => instructor.name === normalized) ?? null;
}

// 타이틀·설명 문구의 단일 진실 — 프리렌더(api/prerender-collection.js)와 동일 유지
// (클로킹 오해 방지 원칙). usePageMeta가 " | 수북 SUBOOK" 접미를 붙인다.
export function getSeriesCollectionMeta(series) {
  return {
    title: `${series.label} 교재`,
    description: `${series.label} 교재 구매 — 검수 완료된 새 책 수준의 미사용 교재를 합리적인 가격에.`,
    canonicalPath: `/store/series/${encodeURIComponent(series.slug)}`,
  };
}

export function getInstructorCollectionMeta(instructor) {
  return {
    title: `${instructor.name} ${instructor.subject} 교재`,
    description: `${instructor.brand} ${instructor.name} ${instructor.subject} 교재 구매 — 검수 완료된 새 책 수준의 미사용 교재를 합리적인 가격에.`,
    canonicalPath: `/store/instructor/${encodeURIComponent(instructor.slug)}`,
  };
}
