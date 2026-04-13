import { buildMemberDashboardSummarySnapshot } from "./publicMypageUtils.js";

const DEMO_CREATED_AT = "2024-03-01T09:00:00+09:00";

export const DEMO_MEMBER_USER = {
  id: "demo-member",
  email: "example@email.com",
  created_at: DEMO_CREATED_AT,
  user_metadata: {
    name: "홍길동",
    nickname: "수능킹",
    phone: "010-1234-5678",
    marketing_opt_in: true,
  },
};

export const DEMO_MEMBER_PROFILE = {
  user_id: DEMO_MEMBER_USER.id,
  email: DEMO_MEMBER_USER.email,
  name: "홍길동",
  nickname: "수능킹",
  phone: "010-1234-5678",
  marketing_opt_in: true,
  created_at: DEMO_CREATED_AT,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProfile(profile = {}) {
  return {
    ...DEMO_MEMBER_PROFILE,
    ...profile,
    user_id: profile.user_id ?? DEMO_MEMBER_PROFILE.user_id,
    email: profile.email ?? DEMO_MEMBER_PROFILE.email,
    created_at: profile.created_at ?? DEMO_MEMBER_PROFILE.created_at,
  };
}

export function createDemoPortalSeed(profileOverride = {}) {
  const profile = normalizeProfile(profileOverride);

  const seed = {
    profile,
    shipments: [
      {
        id: "pickup-demo-0312",
        reference: "PU-2024-0312",
        createdAt: "2024-03-12T10:30:00+09:00",
        bookCount: 3,
        status: "collecting",
        compact: false,
        trackingCompany: "CJ대한통운",
        trackingNumber: "123-456-789",
        items: [
          {
            id: "pickup-demo-0312-book-1",
            title: "시대인재 수학 N제",
            gradeLabel: "A+",
            price: 8000,
            statusLabel: "판매중",
            tone: "success",
          },
          {
            id: "pickup-demo-0312-book-2",
            title: "강남대성 국어 모의고사",
            gradeLabel: "-",
            price: null,
            statusLabel: "검수중",
            tone: "warning",
          },
          {
            id: "pickup-demo-0312-book-3",
            title: "EBS 수능완성 영어",
            rejectionReason: "필기 과다",
            statusLabel: "폐기",
            tone: "danger",
          },
        ],
      },
      {
        id: "pickup-demo-0305",
        reference: "PU-2024-0305",
        createdAt: "2024-03-05T14:00:00+09:00",
        bookCount: 5,
        status: "settled",
        compact: true,
        summaryLabel: "교재 5권 · 정산완료",
        items: [
          {
            id: "pickup-demo-0305-book-1",
            title: "강남대성 미적분 모의고사",
            gradeLabel: "S",
            price: 12000,
            statusLabel: "정산완료",
            tone: "neutral",
          },
          {
            id: "pickup-demo-0305-book-2",
            title: "이투스 과학 기출",
            gradeLabel: "A",
            price: 8000,
            statusLabel: "정산완료",
            tone: "neutral",
          },
        ],
      },
    ],
    orders: [
      {
        id: "order-demo-0315",
        reference: "ORD-2024-0315",
        createdAt: "2024-03-15T11:20:00+09:00",
        status: "delivered",
        trackingCompany: "CJ대한통운",
        trackingNumber: "789-012-345",
        items: [
          {
            id: "order-demo-0315-book-1",
            productId: "product-demo-math-nje",
            title: "시대인재 수학 N제",
            gradeLabel: "A+",
            quantity: 1,
            price: 8000,
          },
          {
            id: "order-demo-0315-book-2",
            productId: "product-demo-korean-mock",
            title: "강남대성 국어 모의고사",
            gradeLabel: "S",
            quantity: 1,
            price: 12000,
          },
        ],
        shippingFee: 3500,
        totalAmount: 23500,
        canConfirm: true,
        canReturn: true,
        canReview: false,
        autoConfirmDaysRemaining: 3,
      },
      {
        id: "order-demo-0310",
        reference: "ORD-2024-0310",
        createdAt: "2024-03-10T09:00:00+09:00",
        status: "confirmed",
        trackingCompany: "CJ대한통운",
        trackingNumber: "555-101-222",
        items: [
          {
            id: "order-demo-0310-book-1",
            productId: "product-demo-science-past",
            title: "이투스 과학 기출",
            gradeLabel: "A",
            quantity: 1,
            price: 4000,
          },
        ],
        shippingFee: 0,
        totalAmount: 4000,
        canConfirm: false,
        canReturn: false,
        canReview: true,
        autoConfirmDaysRemaining: null,
      },
    ],
    settlementSummary: {
      currentMonthAmount: 45000,
      totalAmount: 230000,
      expectedAmount: 45000,
    },
    completedSettlements: [
      {
        id: "settlement-completed-0318",
        date: "2024-03-18T10:00:00+09:00",
        amount: 13800,
        pickupReference: "PU-0312",
        bookCount: 2,
        grossSales: 24000,
        feeAmount: 10200,
        bankLabel: "신한",
        maskedAccount: "****1234",
      },
      {
        id: "settlement-completed-0312",
        date: "2024-03-12T10:00:00+09:00",
        amount: 4800,
        pickupReference: "PU-0305",
        bookCount: 1,
        grossSales: 8000,
        feeAmount: 3200,
        bankLabel: "신한",
        maskedAccount: "****1234",
      },
    ],
    scheduledSettlements: [
      {
        id: "settlement-scheduled-0322",
        date: "2024-03-22T10:00:00+09:00",
        amount: 6600,
        statusLabel: "정산대기",
        tone: "warning",
      },
    ],
    shippingAddresses: [
      {
        id: "demo-address-home",
        user_id: profile.user_id,
        label: "집",
        recipient_name: profile.name,
        recipient_phone: profile.phone,
        postal_code: "06292",
        address_line1: "서울 강남구 대치동 123-45",
        address_line2: "101동 1201호",
        is_default: true,
        created_at: "2024-03-01T09:10:00+09:00",
        updated_at: "2024-03-01T09:10:00+09:00",
      },
      {
        id: "demo-address-academy",
        user_id: profile.user_id,
        label: "학원",
        recipient_name: profile.name,
        recipient_phone: profile.phone,
        postal_code: "06236",
        address_line1: "서울 강남구 역삼동 67-8",
        address_line2: "2층",
        is_default: false,
        created_at: "2024-03-02T09:10:00+09:00",
        updated_at: "2024-03-02T09:10:00+09:00",
      },
    ],
    settlementAccounts: [
      {
        id: "demo-account-default",
        user_id: profile.user_id,
        bank_name: "신한은행",
        account_number: "110-123-456789",
        account_holder: profile.name,
        is_default: true,
        created_at: "2024-03-01T09:20:00+09:00",
        updated_at: "2024-03-01T09:20:00+09:00",
      },
      {
        id: "demo-account-sub",
        user_id: profile.user_id,
        bank_name: "카카오뱅크",
        account_number: "3333-12-1234567",
        account_holder: profile.name,
        is_default: false,
        created_at: "2024-03-05T09:20:00+09:00",
        updated_at: "2024-03-05T09:20:00+09:00",
      },
    ],
  };

  return {
    ...seed,
    dashboardSummary: buildMemberDashboardSummarySnapshot({
      baseSummary: {
        total_book_count: 8,
        on_sale_book_count: 3,
        settled_book_count: 2,
        estimated_on_sale_value: 45000,
      },
      completedSettlements: seed.completedSettlements,
      orders: seed.orders,
      profile: seed.profile,
      scheduledSettlements: seed.scheduledSettlements,
      settlementAccounts: seed.settlementAccounts,
      settlementSummary: seed.settlementSummary,
      shipments: seed.shipments,
      shippingAddresses: seed.shippingAddresses,
    }),
  };
}

function getMergedCollection(storedValue, seedValue) {
  return Array.isArray(storedValue) && storedValue.length ? clone(storedValue) : clone(seedValue);
}

export function mergePortalDemoState(storedState = {}, profileOverride = {}) {
  const seed = createDemoPortalSeed(profileOverride);

  const mergedState = {
    profile: normalizeProfile(storedState.profile ?? seed.profile),
    shipments: getMergedCollection(storedState.shipments, seed.shipments),
    orders: getMergedCollection(storedState.orders, seed.orders),
    settlementSummary: {
      ...seed.settlementSummary,
      ...(storedState.settlementSummary ?? {}),
    },
    completedSettlements: getMergedCollection(
      storedState.completedSettlements,
      seed.completedSettlements,
    ),
    scheduledSettlements: getMergedCollection(
      storedState.scheduledSettlements,
      seed.scheduledSettlements,
    ),
    shippingAddresses: getMergedCollection(storedState.shippingAddresses, seed.shippingAddresses),
    settlementAccounts: getMergedCollection(storedState.settlementAccounts, seed.settlementAccounts),
    dashboardSummary: {
      ...seed.dashboardSummary,
      ...(storedState.dashboardSummary ?? {}),
    },
  };

  mergedState.dashboardSummary = {
    ...buildMemberDashboardSummarySnapshot({
      baseSummary: mergedState.dashboardSummary,
      completedSettlements: mergedState.completedSettlements,
      orders: mergedState.orders,
      profile: mergedState.profile,
      scheduledSettlements: mergedState.scheduledSettlements,
      settlementAccounts: mergedState.settlementAccounts,
      settlementSummary: mergedState.settlementSummary,
      shipments: mergedState.shipments,
      shippingAddresses: mergedState.shippingAddresses,
    }),
  };

  return mergedState;
}

export function confirmPortalOrder(orders = [], orderId) {
  let changed = false;

  const nextOrders = orders.map((order) => {
    if (order.id !== orderId || order.status === "confirmed") {
      return order;
    }

    changed = true;

    return {
      ...order,
      status: "confirmed",
      canConfirm: false,
      canReturn: false,
      canReview: true,
      autoConfirmDaysRemaining: null,
      confirmedAt: new Date().toISOString(),
    };
  });

  return {
    changed,
    orders: nextOrders,
  };
}
