export const STOREFRONT_FEATURED_YEARS = [2027, 2026, 2025];
export const STOREFRONT_OTHER_YEAR = "other";
// 목록 RPC의 integer[] 인자에서 0은 대표 연도 외 모든 연도(NULL 포함)를 뜻한다.
export const STOREFRONT_OTHER_YEAR_RPC_VALUE = 0;

export function toStorefrontRpcYears(years = []) {
  return [...new Set(years.flatMap((year) => {
    if (year === STOREFRONT_OTHER_YEAR) return [STOREFRONT_OTHER_YEAR_RPC_VALUE];
    const value = Number(year);
    return Number.isInteger(value) && value > 0 ? [value] : [];
  }))];
}

export function matchesStorefrontYear(publishedYear, years = []) {
  if (years.length === 0) return true;
  const year = publishedYear == null ? null : Number(publishedYear);
  return years.some((selected) => selected === STOREFRONT_OTHER_YEAR
    ? !STOREFRONT_FEATURED_YEARS.includes(year)
    : year !== null && year === Number(selected));
}
