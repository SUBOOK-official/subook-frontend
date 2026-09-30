export const metaKinds = {
  campaign: "캠페인",
  adset: "광고세트",
  ad: "광고",
  creative: "소재",
};
export const metaStatusLabels = {
  ACTIVE: "켜짐",
  PAUSED: "꺼짐",
  CAMPAIGN_PAUSED: "캠페인 꺼짐",
  ADSET_PAUSED: "광고세트 꺼짐",
  ARCHIVED: "보관됨",
  DELETED: "삭제됨",
  DISAPPROVED: "심사 반려",
  PENDING_REVIEW: "심사 중",
  PREAPPROVED: "사전 승인",
  WITH_ISSUES: "확인 필요",
  IN_PROCESS: "처리 중",
  PENDING_BILLING_INFO: "결제 정보 필요",
};
export const metaActionLabels = {
  create: "새로 만들기",
  update: "수정",
  status: "상태 변경",
  copy: "복사",
  image: "이미지 업로드",
  video: "동영상 업로드",
};
export const metaOperationLabels = {
  prepared: "검토 대기",
  executing: "처리 중 · 재실행 금지",
  succeeded: "반영 완료",
  failed: "반영 실패",
  unknown: "결과 확인 필요 · 재실행 금지",
  expired: "검토 만료",
};
export const metaFieldLabels = {
  name: "이름",
  status: "상태",
  daily_budget: "하루 예산",
  lifetime_budget: "전체 기간 예산",
  budget_remaining: "남은 예산",
  objective: "목표",
  start_time: "시작",
  end_time: "종료",
  stop_time: "종료",
  campaign_id: "캠페인",
  adset_id: "광고세트",
  creative: "사용할 소재",
  targeting: "광고 대상",
  promoted_object: "구매 측정",
  optimization_goal: "성과 목표",
  billing_event: "과금 기준",
  destination_type: "도착 위치",
  bid_strategy: "입찰 방식",
  object_story_spec: "소재 내용",
  object_story_id: "기존 게시물",
  url_tags: "광고 출처 이름표",
  status_option: "복사본 상태",
  deep_copy: "하위 광고도 복사",
  rename_options: "복사본 이름",
  bytes: "파일 크기",
  file_url: "동영상 주소",
  special_ad_categories: "특별 광고 카테고리",
  buying_type: "구매 방식",
  is_adset_budget_sharing_enabled: "광고세트 간 예산 공유",
};
export function won(value) {
  return value == null || value === "" || !Number.isFinite(Number(value))
    ? "—"
    : `${Number(value).toLocaleString("ko-KR")}원`;
}
export function metaBudget(row) {
  return Number(row.daily_budget) > 0
    ? `${won(row.daily_budget)} / 일`
    : Number(row.lifetime_budget) > 0
      ? `${won(row.lifetime_budget)} / 전체 기간`
      : "상위·하위에서 관리";
}
export function metaTargetLabel(target = {}) {
  return [
    target.age_min ? `${target.age_min}~${target.age_max || 65}세` : null,
    target.geo_locations?.countries?.join(", "),
    target.geo_locations?.cities?.length
      ? `도시 ${target.geo_locations.cities.length}곳`
      : null,
    target.genders?.length === 1
      ? target.genders[0] === 1
        ? "남성"
        : "여성"
      : "전체 성별",
    target.publisher_platforms?.join(" · ") || "자동 게재 위치",
    target.custom_audiences?.length
      ? `포함 그룹 ${target.custom_audiences.map((row) => row.id).join(", ")}`
      : null,
    target.excluded_custom_audiences?.length
      ? `제외 그룹 ${target.excluded_custom_audiences.map((row) => row.id).join(", ")}`
      : null,
    target.flexible_spec?.length ? "기존 상세 관심사 유지" : null,
  ]
    .filter(Boolean)
    .join(" / ");
}
export function reviewValue(key, value) {
  if (value == null) return "미설정";
  if (key.endsWith("_budget") || key === "spend_cap") return won(value);
  if (["status", "status_option"].includes(key))
    return metaStatusLabels[value] || value;
  if (key === "objective")
    return (
      { OUTCOME_SALES: "판매", OUTCOME_TRAFFIC: "사이트 방문" }[value] || value
    );
  if (["start_time", "end_time", "stop_time"].includes(key))
    return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  if (key === "targeting") return metaTargetLabel(value);
  if (key === "creative") return value.name || `소재 ID ${value.creative_id || value.id}`;
  if (key === "promoted_object") return `픽셀 ${value.pixel_id} · 구매 완료`;
  if (key === "object_story_spec") {
    const data = value.link_data || value.video_data || {};
    return [
      `페이지 ${value.page_id}`,
      value.instagram_user_id ? `Instagram ${value.instagram_user_id}` : "",
      data.message,
      data.name || data.title,
      data.description,
      data.link || data.call_to_action?.value?.link,
      data.image_hash ? `이미지 ${data.image_hash}` : `영상 ${data.video_id}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (key === "rename_options") return `이름 뒤에 ${value.rename_suffix} 추가`;
  if (key === "bytes") return `${(Number(value) / 1024 / 1024).toFixed(1)} MB`;
  if (typeof value === "boolean") return value ? "사용" : "사용 안 함";
  if (Array.isArray(value)) return value.join(", ") || "해당 없음";
  return (
    {
      LOWEST_COST_WITHOUT_CAP: "최대한 많은 성과",
      OFFSITE_CONVERSIONS: "웹사이트 구매",
      LANDING_PAGE_VIEWS: "도착 페이지 조회",
      LINK_CLICKS: "링크 클릭",
      IMPRESSIONS: "노출",
      WEBSITE: "웹사이트",
      AUCTION: "경매",
    }[value] || String(value)
  );
}
export function koreaInput(value) {
  if (!value) return "";
  const time = new Date(value).getTime();
  return Number.isFinite(time)
    ? new Date(time + 9 * 3600000).toISOString().slice(0, 16)
    : "";
}
export function koreaTimestamp(value) {
  return value ? `${value}:00+09:00` : undefined;
}
