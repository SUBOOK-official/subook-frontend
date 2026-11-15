// 어드민 메뉴의 단일 원본.
// 사이드바(AdminNavigationPanel) · 페이지 상단 탭(AdminShell) · 통합 검색(AdminCommandPalette)이
// 모두 이 목록을 읽는다. 메뉴를 옮기거나 이름을 바꿀 때는 여기만 고치면 된다.
//
// 구조: 그룹 → 메뉴(item) → 탭(tabs, 같은 메뉴 안의 화면) / 바로가기(shortcuts, 검색 전용)
// - item.key / tab.key 는 각 페이지가 AdminShell에 넘기는 activeModule 값과 같다.
// - icon 은 components/adminNavigation.js 의 아이콘 표에서 컴포넌트로 바뀐다 (이 파일은 순수 데이터).
// - keywords 는 통합 검색에서만 쓰는 찾기 낱말이다. 운영자가 실제로 부르는 말을 넣는다.

export const ADMIN_MENU = [
  {
    key: "home",
    label: null,
    items: [
      {
        key: "overview",
        label: "홈",
        title: "오늘 할 일",
        to: "/admin",
        icon: "home",
        keywords: ["오늘 할 일", "대시보드", "대기 건수", "처리할 일"],
      },
    ],
  },
  {
    key: "work",
    label: "업무",
    items: [
      {
        key: "pickups",
        label: "수거·검수",
        to: "/admin/pickups",
        icon: "box",
        keywords: ["수거 신청", "픽업", "CJ 접수", "입고", "검수", "셀러", "판매 신청"],
        shortcuts: [
          { label: "수거 접수 대기", to: "/admin/pickups?status=pending", keywords: ["CJ 접수", "대기"] },
          { label: "검수 작업", to: "/admin/pickups?tab=inspection", keywords: ["입고", "등급", "가격 책정"] },
          { label: "박스 규격 설정", to: "/admin/pickups", keywords: ["박스", "규격", "CJ"] },
        ],
      },
      {
        key: "register",
        label: "상품 등록",
        to: "/admin/register",
        icon: "plus",
        keywords: ["등록", "신규 교재", "재고 추가", "촬영"],
        tabs: [
          { key: "register", label: "상품 등록", to: "/admin/register" },
          {
            key: "photo-intake",
            label: "상세 사진 촬영",
            to: "/admin/photo-intake",
            keywords: ["스캐너", "스캔", "상세 사진", "내지"],
          },
          {
            key: "studio",
            label: "AI 표지 변환",
            to: "/admin/studio",
            keywords: ["사진 스튜디오", "표지", "AI", "배경 정리"],
          },
        ],
      },
      {
        key: "products",
        label: "상품·재고",
        to: "/admin/products",
        icon: "book",
        keywords: ["상품", "재고", "교재", "가격 수정", "숨김", "품절", "일련번호", "보관 위치"],
        tabs: [
          { key: "products", label: "상품 재고", to: "/admin/products" },
          {
            key: "inventory-insights",
            label: "재고 분석",
            to: "/admin/inventory-insights",
            keywords: ["오래된 재고", "장기 재고", "판매 속도", "소진"],
          },
          {
            key: "ilseong-app",
            label: "일성월심 앱",
            to: "/admin/ilseong-app",
            keywords: ["앱 패키지", "코드 발급", "일성월심"],
          },
        ],
        shortcuts: [
          { label: "재고 엑셀 내려받기", to: "/admin/products", keywords: ["전수조사", "엑셀", "재고 목록"] },
          { label: "상세 사진 없는 상품", to: "/admin/products?issue=missing_detail_photo", keywords: ["사진 없음"] },
          { label: "보관 위치 없는 상품", to: "/admin/products?issue=missing_location", keywords: ["위치 미지정"] },
        ],
      },
      {
        key: "orders",
        label: "주문·배송",
        to: "/admin/orders",
        icon: "cart",
        keywords: ["주문", "배송", "출고", "발송", "구매자"],
        shortcuts: [
          { label: "입금 확인 대기", to: "/admin/orders?status=pending", keywords: ["입금", "무통장", "계좌이체"] },
          {
            label: "출고 대기 · 송장 출력",
            to: "/admin/orders?view=fulfillment",
            keywords: ["송장", "운송장", "스마트 운송장", "피킹", "포장", "발송 처리"],
          },
          { label: "환불·반품 신청", to: "/admin/orders?view=refunds", keywords: ["환불", "반품", "취소", "부분환불"] },
          { label: "회수 진행 중인 주문", to: "/admin/orders?view=returns", keywords: ["회수", "반송"] },
          { label: "재고 보류 주문", to: "/admin/orders?view=restock", keywords: ["보류 교재", "재판매"] },
          { label: "판매내역 엑셀 내려받기", to: "/admin/orders", keywords: ["엑셀", "판매 내역", "매출 자료"] },
          { label: "CSV로 송장 한꺼번에 입력", to: "/admin/orders", keywords: ["일괄 송장", "CSV"] },
        ],
      },
      {
        key: "settlements",
        label: "정산",
        to: "/admin/settlements",
        icon: "coin",
        keywords: ["정산", "지급", "송금", "셀러 정산", "미지급"],
        tabs: [
          { key: "settlements", label: "정산 지급", to: "/admin/settlements" },
          {
            key: "settlement-exceptions",
            label: "지급 후 환불",
            to: "/admin/settlement-exceptions",
            keywords: ["기지급 환불", "확인 필요", "지급 완료 후 환불"],
          },
        ],
        shortcuts: [
          { label: "이체 목록 엑셀 내려받기", to: "/admin/settlements", keywords: ["이체", "계좌", "엑셀"] },
          { label: "전일학원 정산", to: "/admin/settlements", keywords: ["전일", "모의고사", "원장님"] },
        ],
      },
    ],
  },
  {
    key: "customer",
    label: "고객",
    items: [
      {
        key: "cs",
        label: "문의",
        to: "/admin/cs",
        icon: "message",
        keywords: ["문의 작업함", "CS", "고객 응대", "상담"],
      },
      {
        key: "members",
        label: "회원",
        to: "/admin/members",
        icon: "user",
        keywords: ["회원", "고객 정보", "차단", "포인트", "CS 메모"],
        tabs: [
          { key: "members", label: "회원 목록", to: "/admin/members" },
          {
            key: "withdrawal-reasons",
            label: "탈퇴 사유",
            to: "/admin/withdrawal-reasons",
            keywords: ["탈퇴", "설문"],
          },
        ],
        shortcuts: [
          { label: "차단한 회원", to: "/admin/members?status=blocked", keywords: ["차단", "어뷰징"] },
        ],
      },
      {
        key: "reviews",
        label: "후기",
        to: "/admin/reviews",
        icon: "star",
        keywords: ["구매 후기", "리뷰", "숨기기"],
      },
      {
        key: "notification-logs",
        label: "알림 내역",
        to: "/admin/notification-logs",
        icon: "bell",
        keywords: ["알림톡", "SMS", "문자", "발송 로그", "발송 이력"],
        shortcuts: [
          { label: "실패한 알림 다시 보내기", to: "/admin/notification-logs?status=failed", keywords: ["재발송", "실패"] },
        ],
      },
    ],
  },
  {
    key: "marketing",
    label: "마케팅",
    items: [
      {
        key: "home-editor",
        label: "홈 화면 편집",
        to: "/admin/home-editor",
        icon: "layout",
        keywords: ["홈", "메인 화면", "미리보기"],
        tabs: [
          { key: "home-editor", label: "미리보기", to: "/admin/home-editor" },
          { key: "themes", label: "테마관", to: "/admin/themes", keywords: ["테마", "관", "시대관", "강대관"] },
          { key: "recommendations", label: "추천 교재", to: "/admin/recommendations", keywords: ["추천순", "큐레이션"] },
          { key: "promotions", label: "배너·팝업", to: "/admin/promotions", keywords: ["배너", "팝업", "프로모션"] },
        ],
        shortcuts: [
          { label: "홈 배너 교재 설정", to: "/admin/recommendations?tab=hero", keywords: ["히어로", "상단 배너"] },
        ],
      },
      {
        key: "coupons",
        label: "쿠폰·행사",
        to: "/admin/coupons",
        icon: "ticket",
        keywords: ["쿠폰", "할인", "쿠폰 발급", "쿠폰 코드"],
        tabs: [
          { key: "coupons", label: "쿠폰", to: "/admin/coupons" },
          {
            key: "event-subscriptions",
            label: "행사 신청자",
            to: "/admin/event-subscriptions",
            keywords: ["이벤트 알림 신청", "행사 신청", "명단", "CSV"],
          },
        ],
      },
      {
        key: "meta-ads",
        label: "메타 광고",
        to: "/admin/meta-ads",
        icon: "megaphone",
        keywords: ["Meta", "인스타그램", "페이스북", "캠페인", "광고세트", "소재", "광고비"],
      },
      {
        key: "content",
        label: "공지·자료",
        to: "/admin/notices",
        icon: "file",
        keywords: ["게시", "콘텐츠"],
        tabs: [
          { key: "notices", label: "공지사항", to: "/admin/notices", keywords: ["공지"] },
          { key: "faqs", label: "FAQ", to: "/admin/faqs", keywords: ["자주 묻는 질문", "도움말"] },
          {
            key: "study-materials",
            label: "수능 자료실",
            to: "/admin/study-materials",
            keywords: ["2028 수능 자료", "PDF", "자료 업로드"],
          },
        ],
      },
    ],
  },
  {
    key: "insight",
    label: "분석",
    items: [
      {
        key: "performance",
        label: "성과",
        to: "/admin/performance",
        icon: "trending",
        keywords: ["매출", "유입", "전환율", "방문자", "ROAS", "성과 대시보드"],
        tabs: [
          { key: "performance", label: "매출·유입·광고", to: "/admin/performance" },
          { key: "analytics", label: "운영 분석", to: "/admin/analytics", keywords: ["인기 상품", "상위 셀러", "주문 추이"] },
        ],
        shortcuts: [
          { label: "성과 엑셀 내려받기", to: "/admin/performance", keywords: ["엑셀", "리포트"] },
          { label: "광고용 추적 링크 만들기", to: "/admin/performance", keywords: ["UTM", "캠페인 링크", "URL 생성"] },
        ],
      },
      {
        key: "work-history",
        label: "작업 이력",
        to: "/admin/work-history",
        icon: "clock",
        keywords: ["변경 이력", "대량 작업 결과", "누가 바꿨는지", "로그"],
      },
    ],
  },
];

// 페이지가 넘기는 activeModule 값 중 메뉴 key와 다른 옛 이름들
// (integrations = 메타 광고 화면에서만 들어가는 '연동 업무 안내' 화면)
const MODULE_ALIASES = { inspection: "pickups", integrations: "meta-ads" };

// 메뉴에 직접 걸려 있지 않은 하위 화면(상세 등) → 속한 메뉴
const PATH_PREFIXES = [
  ["/admin/shipments", "pickups"],
  ["/admin/inspections", "pickups"],
  ["/admin/manual-settlements", "settlements"],
  ["/admin/catalog", "products"],
];

const allItems = ADMIN_MENU.flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })));

function pathOf(to) {
  return to.split("?")[0];
}

/**
 * 현재 주소(또는 페이지가 넘긴 모듈 키)가 어느 메뉴·탭에 속하는지 찾는다.
 * @returns {{ item: object, tab: object|null, isMenuRoute: boolean }}
 *   isMenuRoute — 메뉴/탭에 직접 걸린 화면이면 true, 상세처럼 한 단계 들어간 화면이면 false
 */
export function resolveAdminLocation({ pathname, explicitModule } = {}) {
  const path = (pathname || "").replace(/\/+$/, "") || "/admin";

  for (const item of allItems) {
    const tab = item.tabs?.find((candidate) => pathOf(candidate.to) === path);
    if (tab) return { item, tab, isMenuRoute: true };
    if (pathOf(item.to) === path) return { item, tab: null, isMenuRoute: true };
  }

  const prefix = PATH_PREFIXES.find(([start]) => path.startsWith(start));
  const moduleKey = prefix ? prefix[1] : MODULE_ALIASES[explicitModule] || explicitModule;
  if (moduleKey) {
    for (const item of allItems) {
      if (item.key === moduleKey) return { item, tab: null, isMenuRoute: false };
      const tab = item.tabs?.find((candidate) => candidate.key === moduleKey);
      if (tab) return { item, tab, isMenuRoute: false };
    }
  }

  return { item: allItems[0], tab: null, isMenuRoute: false };
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[\s·.,/()\-_]+/g, "");
}

const CHOSUNG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

// "주문·배송" → "ㅈㅁㅂㅅ". 한글 음절만 초성으로 바꾸고 나머지는 그대로 둔다.
export function toChosung(text) {
  return [...normalize(text)]
    .map((char) => {
      const code = char.charCodeAt(0) - 0xac00;
      return code >= 0 && code <= 11171 ? CHOSUNG[Math.floor(code / 588)] : char;
    })
    .join("");
}

/** 통합 검색에 올릴 항목(메뉴·탭·바로가기)을 한 줄 목록으로 편다. */
export function buildAdminCommands(menu = ADMIN_MENU) {
  const commands = [];
  const push = (entry, item, group, kind) => {
    const trail = [group.label, kind === "menu" ? null : item.label].filter(Boolean).join(" › ");
    commands.push({
      id: `${kind}:${entry.to}:${entry.label}`,
      kind,
      label: entry.label,
      trail,
      to: entry.to,
      icon: item.icon,
      haystack: normalize([entry.label, ...(entry.keywords || []), kind === "menu" ? "" : item.label].join(" ")),
      labelKey: normalize(entry.label),
      chosung: toChosung(entry.label),
    });
  };
  for (const group of menu) {
    for (const item of group.items) {
      push({ ...item, label: item.label, keywords: [...(item.keywords || []), item.title || ""] }, item, group, "menu");
      for (const tab of item.tabs || []) {
        if (tab.to !== item.to) push(tab, item, group, "tab");
      }
      for (const shortcut of item.shortcuts || []) push(shortcut, item, group, "shortcut");
    }
  }
  return commands;
}

/**
 * 메뉴·기능 이름 검색. 띄어쓰기로 나눈 낱말이 모두 들어 있어야 하고,
 * 초성만 입력하면(예: "ㅈㅁ") 이름의 초성과 비교한다.
 */
export function searchAdminCommands(query, commands = buildAdminCommands()) {
  const tokens = String(query || "").trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return [];
  const joined = tokens.join("");
  const chosungOnly = /^[ㄱ-ㅎ]+$/.test(joined);

  const scored = [];
  for (const command of commands) {
    let score = 0;
    if (chosungOnly) {
      if (command.chosung.startsWith(joined)) score = 60;
      else if (command.chosung.includes(joined)) score = 30;
    } else if (tokens.every((token) => command.haystack.includes(token))) {
      if (command.labelKey === joined) score = 100;
      else if (command.labelKey.startsWith(joined)) score = 80;
      else if (command.labelKey.includes(joined)) score = 60;
      else score = 40;
    }
    if (!score) continue;
    // 같은 점수면 메뉴 > 탭 > 바로가기 순
    score += command.kind === "menu" ? 3 : command.kind === "tab" ? 2 : 1;
    scored.push({ command, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.command);
}

const ENTITY_TARGETS = {
  orders: { label: "주문", to: "/admin/orders", icon: "cart", hint: "주문번호·구매자·수령인·책 제목" },
  members: { label: "회원", to: "/admin/members", icon: "user", hint: "이름·이메일·연락처" },
  pickups: { label: "수거 신청", to: "/admin/pickups", icon: "box", hint: "요청번호·판매자·연락처·운송장" },
  products: { label: "상품", to: "/admin/products", icon: "book", hint: "상품명·강사·옵션·일련번호" },
  cs: { label: "문의", to: "/admin/cs", icon: "message", hint: "제목·고객·연락처·담당자" },
  notifications: { label: "알림 내역", to: "/admin/notification-logs", icon: "bell", hint: "이름·전화번호" },
};

/**
 * 입력한 낱말로 각 목록 화면을 바로 검색하는 링크를 만든다.
 * 주문번호·요청번호·전화번호처럼 형태가 뚜렷하면 해당 화면을 맨 위로 올린다.
 */
export function buildEntitySearches(query) {
  const text = String(query || "").trim();
  // 두 글자 미만이거나 초성만 입력한 경우(메뉴 찾기)는 데이터 검색을 제안하지 않는다.
  if (text.length < 2 || /^[ㄱ-ㅎ\s]+$/.test(text)) return [];
  let order = ["orders", "members", "products", "pickups", "cs"];
  if (/^ord[-\s]?\d/i.test(text)) order = ["orders", "cs"];
  else if (/^pu[-\s]?\d/i.test(text)) order = ["pickups", "cs"];
  else if (/^[\d\-\s]{4,}$/.test(text)) order = ["members", "orders", "pickups", "notifications", "products"];
  else if (text.includes("@")) order = ["members"];
  return order.map((key) => {
    const target = ENTITY_TARGETS[key];
    return {
      id: `entity:${key}`,
      kind: "entity",
      label: `${target.label}에서 “${text}” 찾기`,
      trail: target.hint,
      to: `${target.to}?q=${encodeURIComponent(text)}`,
      icon: target.icon,
    };
  });
}
