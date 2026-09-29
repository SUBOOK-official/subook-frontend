const FIELDS = ['source','medium','campaign','id','content'];
function parseLanding(value) {
  const url = new URL(value);
  if (url.origin !== 'https://subook.kr' || url.username || url.password) throw new Error('https://subook.kr의 공개 랜딩 주소를 입력해 주세요.');
  if (/^\/(order|mypage|admin|auth|api)(\/|$)/.test(url.pathname)) throw new Error('주문·계정 화면은 캠페인 랜딩으로 사용할 수 없어요.');
  return url;
}
export function inspectCampaignUrl(value) {
  try {
    const url = parseLanding(value);
    const issues = FIELDS.filter((field) => !url.searchParams.get(`utm_${field}`)?.trim()).map((field) => `utm_${field} 누락`);
    for (const field of FIELDS) if (url.searchParams.getAll(`utm_${field}`).length > 1) issues.push(`utm_${field} 중복`);
    if (url.searchParams.get('utm_campaign') === '0803subook') issues.push('이전 공용 캠페인명입니다. 현재 캠페인별 이름·ID로 구분해 주세요.');
    if (url.searchParams.has('pg_review_mode')) issues.push('PG 심사 모드 주소는 사용할 수 없어요.');
    return { valid: issues.length === 0, issues };
  } catch(error) { return { valid:false, issues:[error.message || '주소를 확인해 주세요.'] }; }
}
export function buildCampaignUrl(values) {
  const url = parseLanding(values.url);
  for (const field of FIELDS) {
    const value = String(values[field] ?? '').trim();
    if (!value || value.length > 100 || !/^[\p{L}\p{N}_.-]+$/u.test(value)) throw new Error(`${field}: 100자 이내의 이름·ID를 입력해 주세요. 공백 대신 밑줄을 사용하고 개인정보를 넣지 마세요.`);
    url.searchParams.set(`utm_${field}`, ['source','medium'].includes(field) ? value.toLowerCase() : value);
  }
  const check = inspectCampaignUrl(url.href);
  if (!check.valid) throw new Error(check.issues.join(' · '));
  return url.href;
}
export function campaignObjectiveLabel(value) {
  return ({OUTCOME_SALES:'판매',CONVERSIONS:'전환',PRODUCT_CATALOG_SALES:'카탈로그 판매',OUTCOME_TRAFFIC:'트래픽',LINK_CLICKS:'링크 클릭',OUTCOME_ENGAGEMENT:'참여',OUTCOME_AWARENESS:'인지',OUTCOME_LEADS:'리드',OUTCOME_APP_PROMOTION:'앱 홍보'})[value] || value || '목표 미확인';
}
