export const shipmentStatusLabel = {
  scheduled: "수거예정",
  inspecting: "검수중",
  inspected: "검수완료",
};

export const pickupRequestStatusLabel = {
  pending: "대기",
  pickup_scheduled: "수거접수",
  picking_up: "수거중",
  arrived: "입고",
  inspecting: "검수중",
  inspected: "검수완료",
  // 셀러 마이페이지가 이 상태를 '정산완료'로 표기하므로 admin도 같은 단어로 통일.
  // ('완료'는 검수완료와 구분이 안 돼 운영 혼동 유발 — 2026-07-13)
  completed: "정산완료",
  cancelled: "취소",
};

// 책 상태 = 판매(재고) 축. 셀러 입금 여부는 settlements/manual_settlements가 별도로
// 추적하므로 settled는 '정산완료'가 아니라 '판매완료'로 표기한다 (2026-07-19 용어 정리).
export const bookStatusLabel = {
  on_sale: "판매중",
  reserved: "주문 진행중",
  settled: "판매완료",
  discarded: "폐기",
};

export const productStatusLabel = {
  selling: "판매중",
  sold_out: "품절",
  hidden: "숨김",
  on_sale: "판매중",
  settled: "판매완료",
};

// 2026-05-19 정책: 신규 입고는 모두 S(새 책) 등급으로 매입. 등급은 S / A+ 두 종류로 이원화.
// 기존 A 등급 데이터는 재고 소진까지 화면 노출 (admin 신규 입력 옵션에서는 제거).
// 향후 A+ 재고도 소진되면 등급 제도 자체 폐지 예정 (디폴트 = 새 책).
export const bookConditionLabel = {
  S: "S (새 책)",
  A_PLUS: "A+ (사용감 적음)",
  A: "A (사용감 있음)",
  DISCARD: "폐기(판매 불가)",
};

// 정렬·우선 노출용 (높을수록 먼저).
export const bookConditionPriority = {
  S: 80,
  A_PLUS: 60,
  A: 40,
  DISCARD: 0,
};

// 등급별 시각 톤 (tailwind 호환). ProductCard / 상세 / admin 검수에서 공통 사용.
export const bookConditionTone = {
  S:       { badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", hex: "#059669" },
  A_PLUS:  { badge: "bg-sky-100 text-sky-800",         dot: "bg-sky-500",     hex: "#0284C7" },
  A:       { badge: "bg-slate-100 text-slate-700",     dot: "bg-slate-400",   hex: "#64748B" },
  DISCARD: { badge: "bg-rose-100 text-rose-700",       dot: "bg-rose-400",    hex: "#E11D48" },
};

export const orderStatusLabel = {
  pending: "입금대기",
  paid: "결제완료",
  preparing: "준비중",
  shipping: "배송중",
  delivered: "배송완료",
  confirmed: "구매확정",
  cancelled: "취소",
  refunded: "환불완료",
};

export const settlementStatusLabel = {
  pending: "정산대기",
  approved: "승인",
  completed: "정산완료",
  cancelled: "취소",
  recovery_required: "회사 손실",
};

export const memberStatusLabel = {
  active: "정상",
  blocked: "차단",
  dormant: "휴면",
  withdrawn: "탈퇴",
};

export const couponStatusLabel = {
  active: "활성",
  inactive: "비활성",
};
