export const STORE_MOCK_MODE_QUERY_KEY = "mockStore";
export const STORE_MOCK_MODE_STORAGE_KEY = "subook.public.store.mock-mode";

const DEFAULT_ORIGINAL_PRICE = 32000;
const DEFAULT_INSPECTION_DATE = "2026-03-01T09:00:00.000+09:00";

const subjectPalette = {
  전체: ["#1b3a5c", "#3b82f6"],
  국어: ["#8b1e3f", "#f97316"],
  수학: ["#163d7a", "#2563eb"],
  영어: ["#14532d", "#10b981"],
  과학: ["#4c1d95", "#8b5cf6"],
  사회: ["#92400e", "#f59e0b"],
  한국사: ["#7c2d12", "#fb7185"],
  기타: ["#334155", "#94a3b8"],
};

const MOCK_PRODUCT_FIXTURES = [
  {
    id: "mock-book-01",
    title: "2026 시대인재 서바이벌 수학 모의고사 시즌1",
    subject: "수학",
    brand: "시대인재",
    bookType: "모의고사",
    publishedYear: 2026,
    instructorName: "현우진",
    salesCount: 58,
    viewCount: 1430,
    favoriteCount: 231,
    createdAt: "2026-04-07T09:10:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 18200,
        originalPrice: 32000,
        availableCount: 5,
        writingPercentage: 5,
        hasDamage: false,
        inspectionNotes: "표지 모서리만 아주 약하게 닳았고 내부 사용감이 거의 없어요.",
        inspectedAt: "2026-04-05T15:00:00.000+09:00",
      },
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 15900,
        originalPrice: 32000,
        availableCount: 2,
        writingPercentage: 14,
        hasDamage: false,
        inspectionNotes: "몇 페이지에 형광펜 표시가 있지만 문제 풀이에는 지장이 없습니다.",
        inspectedAt: "2026-04-04T11:00:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-02",
    title: "2026 대성마이맥 드릴 미적분 N제",
    subject: "수학",
    brand: "대성마이맥",
    bookType: "N제",
    publishedYear: 2026,
    instructorName: "김범준",
    salesCount: 37,
    viewCount: 1250,
    favoriteCount: 194,
    createdAt: "2026-04-02T08:30:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 16800,
        originalPrice: 29000,
        availableCount: 4,
        writingPercentage: 7,
        hasDamage: false,
        inspectionNotes: "연습 흔적 없이 깨끗하고 스프링도 탄탄합니다.",
        inspectedAt: "2026-04-01T12:10:00.000+09:00",
      },
      {
        suffix: "a",
        conditionGrade: "A",
        price: 12900,
        originalPrice: 29000,
        availableCount: 1,
        writingPercentage: 28,
        hasDamage: false,
        inspectionNotes: "중요 문제에 체크가 조금 있어도 전체 상태는 양호합니다.",
        inspectedAt: "2026-03-31T18:30:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-03",
    title: "2025 강남대성 국어 기출의 본질 독서편",
    subject: "국어",
    brand: "강남대성",
    bookType: "기출",
    publishedYear: 2025,
    instructorName: "김동욱",
    salesCount: 24,
    viewCount: 910,
    favoriteCount: 112,
    createdAt: "2026-03-29T13:00:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 14200,
        originalPrice: 26000,
        availableCount: 3,
        writingPercentage: 4,
        hasDamage: false,
        inspectionNotes: "교재 외관과 내지가 모두 깨끗해서 선물용으로도 무난해요.",
        inspectedAt: "2026-03-28T16:40:00.000+09:00",
      },
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 11800,
        originalPrice: 26000,
        availableCount: 2,
        writingPercentage: 18,
        hasDamage: false,
        inspectionNotes: "독서 지문 몇 곳에 밑줄이 있으나 해설은 깔끔합니다.",
        inspectedAt: "2026-03-27T10:20:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-04",
    title: "2026 EBS 수능완성 영어 실전편",
    subject: "영어",
    brand: "EBS",
    bookType: "EBS",
    publishedYear: 2026,
    instructorName: "조정식",
    salesCount: 64,
    viewCount: 1660,
    favoriteCount: 287,
    createdAt: "2026-04-06T10:15:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 9800,
        originalPrice: 16000,
        availableCount: 8,
        writingPercentage: 2,
        hasDamage: false,
        inspectionNotes: "새책급으로 메모와 접힘이 거의 없습니다.",
        inspectedAt: "2026-04-05T09:20:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-05",
    title: "2026 시대인재 생명과학1 킬러 N제",
    subject: "과학",
    brand: "시대인재",
    bookType: "N제",
    publishedYear: 2026,
    instructorName: "윤도영",
    salesCount: 49,
    viewCount: 1510,
    favoriteCount: 203,
    createdAt: "2026-04-04T14:20:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 17600,
        originalPrice: 31000,
        availableCount: 3,
        writingPercentage: 6,
        hasDamage: false,
        inspectionNotes: "분권 커버 포함, 풀이 흔적 거의 없음.",
        inspectedAt: "2026-04-03T13:15:00.000+09:00",
      },
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 15100,
        originalPrice: 31000,
        availableCount: 2,
        writingPercentage: 15,
        hasDamage: false,
        inspectionNotes: "정리 메모가 일부 있어도 상태 좋습니다.",
        inspectedAt: "2026-04-02T17:30:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-06",
    title: "2025 이투스 지구과학1 실전 모의고사",
    subject: "과학",
    brand: "이투스",
    bookType: "모의고사",
    publishedYear: 2025,
    instructorName: "오지훈",
    salesCount: 16,
    viewCount: 690,
    favoriteCount: 78,
    createdAt: "2026-03-25T11:40:00.000+09:00",
    options: [
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 11200,
        originalPrice: 24000,
        availableCount: 4,
        writingPercentage: 16,
        hasDamage: false,
        inspectionNotes: "한두 회차에 체크 표시가 있으나 전반적으로 깔끔합니다.",
        inspectedAt: "2026-03-23T13:40:00.000+09:00",
      },
      {
        suffix: "a",
        conditionGrade: "A",
        price: 9300,
        originalPrice: 24000,
        availableCount: 1,
        writingPercentage: 31,
        hasDamage: true,
        inspectionNotes: "표지 접힘과 밑줄이 조금 있지만 사용은 충분히 가능합니다.",
        inspectedAt: "2026-03-22T15:10:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-07",
    title: "2024 EBS 사회문화 기출 콤팩트",
    subject: "사회",
    brand: "EBS",
    bookType: "기출",
    publishedYear: 2024,
    instructorName: "이다지",
    salesCount: 9,
    viewCount: 410,
    favoriteCount: 42,
    createdAt: "2026-03-14T09:50:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 7400,
        originalPrice: 18000,
        availableCount: 3,
        writingPercentage: 5,
        hasDamage: false,
        inspectionNotes: "작은 이름표 스티커 외에는 거의 새 교재 수준입니다.",
        inspectedAt: "2026-03-12T10:05:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-08",
    title: "2026 대성마이맥 문학 주간지 파이널",
    subject: "국어",
    brand: "대성마이맥",
    bookType: "주간지",
    publishedYear: 2026,
    instructorName: "전형태",
    salesCount: 28,
    viewCount: 1010,
    favoriteCount: 118,
    createdAt: "2026-04-03T16:25:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 12100,
        originalPrice: 21000,
        availableCount: 5,
        writingPercentage: 3,
        hasDamage: false,
        inspectionNotes: "회차별 분철 상태 양호, 낙서 없음.",
        inspectedAt: "2026-04-02T10:10:00.000+09:00",
      },
      {
        suffix: "a",
        conditionGrade: "A",
        price: 8700,
        originalPrice: 21000,
        availableCount: 2,
        writingPercentage: 34,
        hasDamage: false,
        inspectionNotes: "일부 회차에 메모가 있어도 공부용으로 무리 없습니다.",
        inspectedAt: "2026-04-01T09:00:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-09",
    title: "2025 강남대성 영어 내신 빈칸 클리닉",
    subject: "영어",
    brand: "강남대성",
    bookType: "내신",
    publishedYear: 2025,
    instructorName: "김기훈",
    salesCount: 11,
    viewCount: 520,
    favoriteCount: 66,
    createdAt: "2026-03-20T08:10:00.000+09:00",
    options: [
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 9900,
        originalPrice: 22000,
        availableCount: 3,
        writingPercentage: 21,
        hasDamage: false,
        inspectionNotes: "문장 구조 표시가 일부 있으나 깔끔한 편이에요.",
        inspectedAt: "2026-03-18T11:50:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-10",
    title: "2024 EBS 수학 기출 수특 변형",
    subject: "수학",
    brand: "EBS",
    bookType: "기출",
    publishedYear: 2024,
    instructorName: "심주석",
    salesCount: 13,
    viewCount: 470,
    favoriteCount: 49,
    createdAt: "2026-03-12T13:35:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 7800,
        originalPrice: 17000,
        availableCount: 6,
        writingPercentage: 4,
        hasDamage: false,
        inspectionNotes: "가볍게 사용된 흔적만 있고 전반적으로 깨끗합니다.",
        inspectedAt: "2026-03-11T16:15:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-11",
    title: "2026 시대인재 물리학1 서킷 모의고사",
    subject: "과학",
    brand: "시대인재",
    bookType: "모의고사",
    publishedYear: 2026,
    instructorName: "배기범",
    salesCount: 41,
    viewCount: 1290,
    favoriteCount: 149,
    createdAt: "2026-04-01T10:00:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 17100,
        originalPrice: 30000,
        availableCount: 2,
        writingPercentage: 5,
        hasDamage: false,
        inspectionNotes: "겉면만 약간 사용감 있고 내부는 매우 양호합니다.",
        inspectedAt: "2026-03-31T14:25:00.000+09:00",
      },
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 14600,
        originalPrice: 30000,
        availableCount: 1,
        writingPercentage: 19,
        hasDamage: false,
        inspectionNotes: "풀이 전략 메모가 조금 남아 있습니다.",
        inspectedAt: "2026-03-30T12:00:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-12",
    title: "2026 이투스 생활과윤리 논점 압축 N제",
    subject: "사회",
    brand: "이투스",
    bookType: "N제",
    publishedYear: 2026,
    instructorName: "이지영",
    salesCount: 22,
    viewCount: 870,
    favoriteCount: 91,
    createdAt: "2026-03-30T17:05:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 13300,
        originalPrice: 25000,
        availableCount: 4,
        writingPercentage: 6,
        hasDamage: false,
        inspectionNotes: "모서리 손상 없고 본문 상태가 매우 좋습니다.",
        inspectedAt: "2026-03-29T15:20:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-13",
    title: "2026 시대인재 국어 파이널 실전 모의",
    subject: "국어",
    brand: "시대인재",
    bookType: "모의고사",
    publishedYear: 2026,
    instructorName: "김민정",
    salesCount: 33,
    viewCount: 1190,
    favoriteCount: 144,
    createdAt: "2026-04-05T07:50:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 14900,
        originalPrice: 27000,
        availableCount: 5,
        writingPercentage: 2,
        hasDamage: false,
        inspectionNotes: "커버 비닐 포함, 상태 매우 우수합니다.",
        inspectedAt: "2026-04-04T13:00:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-14",
    title: "2025 대성마이맥 영어 기출 알고리즘",
    subject: "영어",
    brand: "대성마이맥",
    bookType: "기출",
    publishedYear: 2025,
    instructorName: "이명학",
    salesCount: 27,
    viewCount: 980,
    favoriteCount: 104,
    createdAt: "2026-03-27T09:25:00.000+09:00",
    options: [
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 11600,
        originalPrice: 24000,
        availableCount: 2,
        writingPercentage: 17,
        hasDamage: false,
        inspectionNotes: "핵심 구문 표시가 있어 복습용으로 좋습니다.",
        inspectedAt: "2026-03-25T18:20:00.000+09:00",
      },
      {
        suffix: "a",
        conditionGrade: "A",
        price: 8900,
        originalPrice: 24000,
        availableCount: 1,
        writingPercentage: 37,
        hasDamage: true,
        inspectionNotes: "표지 접힘이 있으나 제본은 튼튼합니다.",
        inspectedAt: "2026-03-24T11:00:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-15",
    title: "2026 EBS 한국사 개념완성 압축노트",
    subject: "한국사",
    brand: "EBS",
    bookType: "EBS",
    publishedYear: 2026,
    instructorName: "이다지",
    salesCount: 31,
    viewCount: 1100,
    favoriteCount: 158,
    createdAt: "2026-04-05T12:30:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 9100,
        originalPrice: 18000,
        availableCount: 7,
        writingPercentage: 3,
        hasDamage: false,
        inspectionNotes: "개념 암기 포스트잇만 살짝 붙어 있었고 상태 좋습니다.",
        inspectedAt: "2026-04-03T10:40:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-16",
    title: "2024 이투스 통합과학 내신 프로젝트",
    subject: "기타",
    brand: "이투스",
    bookType: "내신",
    publishedYear: 2024,
    instructorName: "박선",
    salesCount: 6,
    viewCount: 260,
    favoriteCount: 23,
    createdAt: "2026-03-10T14:10:00.000+09:00",
    options: [
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 7200,
        originalPrice: 19000,
        availableCount: 2,
        writingPercentage: 24,
        hasDamage: false,
        inspectionNotes: "실험 파트 메모 일부만 남아 있습니다.",
        inspectedAt: "2026-03-08T09:45:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-17",
    title: "2026 EBS 국어 독서 수능특강 연계",
    subject: "국어",
    brand: "EBS",
    bookType: "EBS",
    publishedYear: 2026,
    instructorName: "강민철",
    salesCount: 44,
    viewCount: 1360,
    favoriteCount: 205,
    createdAt: "2026-04-07T07:40:00.000+09:00",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 8900,
        originalPrice: 17000,
        availableCount: 6,
        writingPercentage: 1,
        hasDamage: false,
        inspectionNotes: "거의 새책 상태라 바로 학습용으로 쓰기 좋아요.",
        inspectedAt: "2026-04-06T09:30:00.000+09:00",
      },
    ],
  },
  {
    id: "mock-book-18",
    title: "2025 강남대성 수학 실전 모의 파이널",
    subject: "수학",
    brand: "강남대성",
    bookType: "모의고사",
    publishedYear: 2025,
    instructorName: "정병훈",
    salesCount: 18,
    viewCount: 840,
    favoriteCount: 75,
    createdAt: "2026-03-18T12:05:00.000+09:00",
    status: "sold_out",
    options: [
      {
        suffix: "s",
        conditionGrade: "S",
        price: 13800,
        originalPrice: 26000,
        availableCount: 0,
        writingPercentage: 8,
        hasDamage: false,
        inspectionNotes: "상태는 매우 좋지만 현재 재고가 모두 소진되었습니다.",
        inspectedAt: "2026-03-17T10:25:00.000+09:00",
      },
      {
        suffix: "aplus",
        conditionGrade: "A_PLUS",
        price: 11400,
        originalPrice: 26000,
        availableCount: 0,
        writingPercentage: 16,
        hasDamage: false,
        inspectionNotes: "재고 소진 상태입니다.",
        inspectedAt: "2026-03-16T09:00:00.000+09:00",
      },
    ],
  },
];

function normalizeMockBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMockNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function escapeSvgText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createMockArtwork({
  title,
  subtitle,
  accentStart,
  accentEnd,
  badge,
  footer,
}) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accentStart}" />
          <stop offset="100%" stop-color="${accentEnd}" />
        </linearGradient>
      </defs>
      <rect width="480" height="640" rx="36" fill="url(#bg)" />
      <rect x="28" y="28" width="424" height="584" rx="28" fill="rgba(255,255,255,0.12)" />
      <rect x="40" y="44" width="104" height="34" rx="17" fill="rgba(255,255,255,0.88)" />
      <text x="92" y="66" font-size="18" font-family="Pretendard, Arial, sans-serif" font-weight="700" text-anchor="middle" fill="${accentStart}">${escapeSvgText(badge)}</text>
      <text x="40" y="166" font-size="42" font-family="Pretendard, Arial, sans-serif" font-weight="800" fill="#ffffff">${escapeSvgText(title)}</text>
      <text x="40" y="224" font-size="23" font-family="Pretendard, Arial, sans-serif" font-weight="600" fill="rgba(255,255,255,0.88)">${escapeSvgText(subtitle)}</text>
      <rect x="40" y="420" width="400" height="128" rx="24" fill="rgba(15,23,42,0.18)" />
      <text x="40" y="468" font-size="18" font-family="Pretendard, Arial, sans-serif" font-weight="700" fill="#ffffff">${escapeSvgText(footer)}</text>
      <text x="40" y="520" font-size="28" font-family="Inter, Arial, sans-serif" font-weight="800" fill="rgba(255,255,255,0.92)">SUBOOK MOCK</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getSubjectPalette(subject) {
  return subjectPalette[subject] ?? subjectPalette.기타;
}

function buildMockProductCover(product) {
  const [accentStart, accentEnd] = getSubjectPalette(product.subject);
  return createMockArtwork({
    title: `${product.publishedYear} ${product.subject}`,
    subtitle: product.brand,
    accentStart,
    accentEnd,
    badge: product.bookType,
    footer: product.instructorName || "수능 교재",
  });
}

function buildMockInspectionImage(product, label, index) {
  const [accentStart, accentEnd] = getSubjectPalette(product.subject);
  return createMockArtwork({
    title: `${label} ${index + 1}`,
    subtitle: product.title,
    accentStart,
    accentEnd,
    badge: "검수",
    footer: product.brand,
  });
}

function buildMockOption(product, optionDefinition, optionIndex) {
  const availableCount = normalizeMockNumber(optionDefinition.availableCount, 1);
  const status = optionDefinition.status ?? (availableCount === 0 ? "sold_out" : "selling");
  const baseCover = buildMockProductCover(product);
  const optionCover =
    optionIndex === 0
      ? baseCover
      : buildMockInspectionImage(
          product,
          optionDefinition.conditionGrade === "A_PLUS"
            ? "옵션 A+"
            : optionDefinition.conditionGrade === "A"
              ? "옵션 A"
              : "옵션 S",
          optionIndex,
        );

  return {
    id: `${product.id}-${optionDefinition.suffix ?? optionIndex + 1}`,
    productId: product.id,
    title: product.title,
    option: optionDefinition.optionLabel ?? `${optionDefinition.conditionGrade} 옵션`,
    conditionGrade: optionDefinition.conditionGrade,
    price: optionDefinition.price,
    originalPrice: optionDefinition.originalPrice ?? DEFAULT_ORIGINAL_PRICE,
    coverImageUrl: optionCover,
    inspectionImageUrls:
      optionDefinition.inspectionImageUrls ??
      [buildMockInspectionImage(product, "내부", optionIndex)],
    writingPercentage: optionDefinition.writingPercentage ?? 10,
    hasDamage: normalizeMockBoolean(optionDefinition.hasDamage, false),
    inspectionNotes: optionDefinition.inspectionNotes ?? "테스트용 mock 검수 메모입니다.",
    inspectedAt: optionDefinition.inspectedAt ?? DEFAULT_INSPECTION_DATE,
    status,
    isPublic: true,
    availableCount,
    stockCount: availableCount,
    createdAt: optionDefinition.createdAt ?? product.createdAt,
    updatedAt: optionDefinition.updatedAt ?? product.createdAt,
  };
}

function buildMockProductRow(productDefinition) {
  const coverImageUrl = buildMockProductCover(productDefinition);
  const options = productDefinition.options.map((optionDefinition, optionIndex) =>
    buildMockOption(productDefinition, optionDefinition, optionIndex),
  );
  const availableOptionCount = options.filter((option) => option.availableCount > 0).length;
  const status =
    productDefinition.status ??
    (availableOptionCount === 0 ? "sold_out" : "selling");

  return {
    id: productDefinition.id,
    productId: productDefinition.id,
    title: productDefinition.title,
    option: productDefinition.option ?? null,
    subject: productDefinition.subject,
    brand: productDefinition.brand,
    bookType: productDefinition.bookType,
    publishedYear: productDefinition.publishedYear,
    instructorName: productDefinition.instructorName,
    coverImageUrl,
    inspectionImageUrls:
      productDefinition.inspectionImageUrls ??
      [
        buildMockInspectionImage(productDefinition, "검수", 0),
        buildMockInspectionImage(productDefinition, "메모", 1),
      ],
    writingPercentage: productDefinition.writingPercentage ?? options[0]?.writingPercentage ?? 10,
    hasDamage: productDefinition.hasDamage ?? options.some((option) => option.hasDamage),
    inspectionNotes:
      productDefinition.inspectionNotes ??
      options[0]?.inspectionNotes ??
      "테스트용 mock 교재입니다.",
    inspectedAt: productDefinition.inspectedAt ?? options[0]?.inspectedAt ?? DEFAULT_INSPECTION_DATE,
    createdAt: productDefinition.createdAt,
    updatedAt: productDefinition.updatedAt ?? productDefinition.createdAt,
    status,
    isPublic: true,
    salesCount: productDefinition.salesCount,
    viewCount: productDefinition.viewCount,
    favoriteCount: productDefinition.favoriteCount,
    options,
  };
}

const mockStoreProductRows = MOCK_PRODUCT_FIXTURES.map(buildMockProductRow);

function normalizeMockModeParam(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "off", "no"].includes(normalizedValue)) {
    return false;
  }

  return null;
}

function getEnvMockModePreference() {
  const envValue = import.meta.env?.VITE_PUBLIC_STORE_MOCK_MODE;
  return normalizeMockModeParam(envValue);
}

export function readStoreMockModePreference() {
  if (typeof window === "undefined") {
    return getEnvMockModePreference();
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const queryPreference = normalizeMockModeParam(params.get(STORE_MOCK_MODE_QUERY_KEY));
    if (queryPreference !== null) {
      window.localStorage.setItem(STORE_MOCK_MODE_STORAGE_KEY, queryPreference ? "true" : "false");
      return queryPreference;
    }

    const storedPreference = normalizeMockModeParam(
      window.localStorage.getItem(STORE_MOCK_MODE_STORAGE_KEY),
    );
    if (storedPreference !== null) {
      return storedPreference;
    }
  } catch {
    // Ignore browser storage access failures and fall back to env/default behavior.
  }

  return getEnvMockModePreference();
}

export function getMockStoreProductRows() {
  return mockStoreProductRows;
}
