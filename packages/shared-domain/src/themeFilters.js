// 테마의 고정 조건은 탐색 UI에만 사용한다. 운영자가 선정한 교재를 걸러내지 않는다.
export const THEME_FILTER_FIELDS = [
  { key: "brands", label: "브랜드" },
  { key: "types", label: "유형" },
  { key: "years", label: "학년도" },
  { key: "subject", label: "과목" },
];

export function normalizeThemeFilterContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(THEME_FILTER_FIELDS.flatMap(({ key }) => {
    const text = typeof value[key] === "string" ? value[key].trim() : "";
    return text && text.length <= 60 ? [[key, text]] : [];
  }));
}

export function themeFilterContextLabels(value) {
  const context = normalizeThemeFilterContext(value);
  return THEME_FILTER_FIELDS.flatMap(({ key }) => context[key]
    ? [key === "years" ? `${context[key]}학년도` : context[key]] : []);
}
