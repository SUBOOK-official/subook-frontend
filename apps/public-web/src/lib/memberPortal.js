import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";
import {
  DEMO_MEMBER_PROFILE,
  confirmPortalOrder,
  mergePortalDemoState,
} from "./publicMypageDemo";
import {
  mapOrderToDisplayOrder,
  mapPickupRequestToShipment,
} from "./publicMypageUtils";

const MEMBER_PORTAL_STORAGE_PREFIX = "subook.public.member-portal.v2";
const SHIPPING_ADDRESSES_TABLE = "member_shipping_addresses";
const SETTLEMENT_ACCOUNTS_TABLE = "member_settlement_accounts";
const RECENT_SHIPMENTS_LIMIT = 6;

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeNullableText(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue || null;
}

function createLocalId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createFallbackProfile(user) {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata ?? {};
  const fallbackName =
    typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : user.email?.split("@")[0] ?? "";
  const fallbackNickname =
    typeof metadata.nickname === "string" && metadata.nickname.trim()
      ? metadata.nickname.trim()
      : fallbackName;
  const fallbackPhone =
    typeof metadata.phone === "string" && metadata.phone.trim() ? metadata.phone.trim() : "";

  return {
    user_id: user.id,
    email: user.email ?? "",
    name: fallbackName,
    nickname: fallbackNickname,
    phone: fallbackPhone,
    marketing_opt_in: Boolean(metadata.marketing_opt_in),
    created_at: user.created_at ?? DEMO_MEMBER_PROFILE.created_at,
  };
}

function createDisplayName(profile) {
  return (
    normalizeText(profile?.nickname) ||
    normalizeText(profile?.name) ||
    normalizeText(profile?.email).split("@")[0] ||
    "회원"
  );
}

function createEmptyDashboardSummary(profile) {
  const profileSnapshot = profile ?? {};

  return {
    user_id: profileSnapshot.user_id ?? null,
    email: profileSnapshot.email ?? "",
    name: profileSnapshot.name ?? "",
    nickname: profileSnapshot.nickname ?? "",
    display_name: createDisplayName(profileSnapshot),
    phone: profileSnapshot.phone ?? "",
    marketing_opt_in: Boolean(profileSnapshot.marketing_opt_in),
    shipping_address_count: 0,
    default_shipping_address_id: null,
    settlement_account_count: 0,
    default_settlement_account_id: null,
    shipment_count: 0,
    recent_shipment_count: 0,
    total_book_count: 0,
    on_sale_book_count: 0,
    settled_book_count: 0,
    estimated_on_sale_value: 0,
    estimated_settled_value: 0,
    latest_shipment_created_at: null,
    latest_shipment_pickup_date: null,
    latest_shipment_status: null,
    purchase_in_progress_count: 0,
    current_month_settlement_total: 0,
    total_settlement_amount: 0,
  };
}

function getStorageKey(userId) {
  return `${MEMBER_PORTAL_STORAGE_PREFIX}:${userId}`;
}

function readStoredPortalState(userId) {
  if (typeof window === "undefined" || !userId) {
    return {
      profile: null,
      shippingAddresses: [],
      settlementAccounts: [],
      shipments: [],
      orders: [],
      settlementSummary: null,
      completedSettlements: [],
      scheduledSettlements: [],
      dashboardSummary: null,
    };
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(userId));
    if (!rawValue) {
      return {
        profile: null,
        shippingAddresses: [],
        settlementAccounts: [],
        shipments: [],
        orders: [],
        settlementSummary: null,
        completedSettlements: [],
        scheduledSettlements: [],
        dashboardSummary: null,
      };
    }

    const parsedValue = JSON.parse(rawValue);

    return {
      profile: parsedValue.profile ?? null,
      shippingAddresses: Array.isArray(parsedValue.shippingAddresses)
        ? parsedValue.shippingAddresses
        : [],
      settlementAccounts: Array.isArray(parsedValue.settlementAccounts)
        ? parsedValue.settlementAccounts
        : [],
      shipments: Array.isArray(parsedValue.shipments) ? parsedValue.shipments : [],
      orders: Array.isArray(parsedValue.orders) ? parsedValue.orders : [],
      settlementSummary: parsedValue.settlementSummary ?? null,
      completedSettlements: Array.isArray(parsedValue.completedSettlements)
        ? parsedValue.completedSettlements
        : [],
      scheduledSettlements: Array.isArray(parsedValue.scheduledSettlements)
        ? parsedValue.scheduledSettlements
        : [],
      dashboardSummary: parsedValue.dashboardSummary ?? null,
    };
  } catch {
    return {
      profile: null,
      shippingAddresses: [],
      settlementAccounts: [],
      shipments: [],
      orders: [],
      settlementSummary: null,
      completedSettlements: [],
      scheduledSettlements: [],
      dashboardSummary: null,
    };
  }
}

function writeStoredPortalState(userId, nextState) {
  if (typeof window === "undefined" || !userId) {
    return;
  }

  const currentState = readStoredPortalState(userId);
  const payload = {
    ...currentState,
    ...nextState,
  };

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
}

function sortDefaultFirst(items) {
  return [...items].sort((left, right) => {
    if (Boolean(left.is_default) !== Boolean(right.is_default)) {
      return left.is_default ? -1 : 1;
    }

    const leftTime = left.updated_at ?? left.created_at ?? "";
    const rightTime = right.updated_at ?? right.created_at ?? "";
    return rightTime.localeCompare(leftTime);
  });
}

function buildStoredAddress(address) {
  return {
    id: address.id ?? createLocalId("address"),
    user_id: address.user_id ?? null,
    label: normalizeText(address.label),
    recipient_name: normalizeText(address.recipient_name),
    recipient_phone: normalizeText(address.recipient_phone),
    postal_code: normalizeText(address.postal_code),
    address_line1: normalizeText(address.address_line1),
    address_line2: normalizeNullableText(address.address_line2),
    delivery_memo: normalizeNullableText(address.delivery_memo),
    is_default: Boolean(address.is_default),
    created_at: address.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildStoredAccount(account) {
  return {
    id: account.id ?? createLocalId("account"),
    user_id: account.user_id ?? null,
    bank_name: normalizeText(account.bank_name),
    account_number: normalizeText(account.account_number),
    account_holder: normalizeText(account.account_holder),
    is_default: Boolean(account.is_default),
    is_verified: Boolean(account.is_verified),
    verified_at: account.verified_at ?? null,
    created_at: account.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function fetchCollectionRows(tableName, userId) {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return {
      rows: [],
      source: "local",
      error: null,
    };
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return {
      rows: [],
      source: "fallback",
      error,
    };
  }

  return {
    rows: Array.isArray(data) ? data : [],
    source: "supabase",
    error: null,
  };
}

async function fetchDashboardSummary(profile) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      summary: createEmptyDashboardSummary(profile),
      source: "local",
      error: null,
    };
  }

  const { data, error } = await supabase.rpc("get_member_dashboard_summary");

  if (error) {
    return {
      summary: createEmptyDashboardSummary(profile),
      source: "fallback",
      error,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    summary: row ? { ...createEmptyDashboardSummary(profile), ...row } : createEmptyDashboardSummary(profile),
    source: row ? "supabase" : "empty",
    error: null,
  };
}

async function fetchRecentShipments() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      recentShipments: [],
      source: "local",
      error: null,
    };
  }

  const { data, error } = await supabase.rpc("get_member_recent_shipments", {
    p_limit: RECENT_SHIPMENTS_LIMIT,
  });

  if (error) {
    return {
      recentShipments: [],
      source: "fallback",
      error,
    };
  }

  return {
    recentShipments: Array.isArray(data) ? data : [],
    source: "supabase",
    error: null,
  };
}

async function fetchPickupRequests() {
  if (!isSupabaseConfigured || !supabase) {
    return { pickupRequests: [], source: "local", error: null };
  }

  const { data, error } = await supabase.rpc("get_my_pickup_requests", {
    p_limit: 20,
    p_offset: 0,
  });

  if (error) {
    if (shouldUseLocalSchemaFallback(error)) {
      return { pickupRequests: [], source: "local", error: null };
    }
    return { pickupRequests: [], source: "fallback", error };
  }

  return {
    pickupRequests: Array.isArray(data) ? data : [],
    source: "supabase",
    error: null,
  };
}

async function fetchOrders() {
  if (!isSupabaseConfigured || !supabase) {
    return { orders: [], source: "local", error: null };
  }

  const { data, error } = await supabase.rpc("get_my_orders", {
    p_limit: 20,
    p_offset: 0,
  });

  if (error) {
    if (shouldUseLocalSchemaFallback(error)) {
      return { orders: [], source: "local", error: null };
    }
    return { orders: [], source: "fallback", error };
  }

  return {
    orders: Array.isArray(data) ? data : [],
    source: "supabase",
    error: null,
  };
}

async function fetchSettlements() {
  if (!isSupabaseConfigured || !supabase) {
    return { rows: [], summary: null, source: "local", error: null };
  }

  const { data, error } = await supabase.rpc("get_my_settlements", {
    p_limit: 50,
    p_offset: 0,
  });

  if (error) {
    if (shouldUseLocalSchemaFallback(error)) {
      return { rows: [], summary: null, source: "local", error: null };
    }
    return { rows: [], summary: null, source: "fallback", error };
  }

  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    summary: data?.summary ?? null,
    source: "supabase",
    error: null,
  };
}

function maskSettlementAccount(row) {
  const digits = String(row?.account_number ?? "").replace(/[^0-9]/g, "");
  const last4 = row?.account_last4 || digits.slice(-4);

  if (!last4) {
    return "계좌 미등록";
  }

  return `${"*".repeat(Math.max(0, digits.length - 4))}${last4}`;
}

function mapSettlementSummary(summary) {
  if (!summary) {
    return {
      currentMonthAmount: 0,
      totalAmount: 0,
      expectedAmount: 0,
    };
  }

  return {
    currentMonthAmount: Number(summary.current_month_amount ?? 0),
    totalAmount: Number(summary.total_amount ?? 0),
    expectedAmount: Number(summary.expected_amount ?? 0),
  };
}

function mapSettlementRow(row) {
  const statusLabelMap = {
    pending: "정산대기",
    approved: "승인완료",
    completed: "정산완료",
  };
  const toneMap = {
    pending: "warning",
    approved: "info",
    completed: "success",
  };

  return {
    id: row.id,
    date: row.completed_at ?? row.scheduled_date ?? row.created_at,
    amount: Number(row.net_amount ?? 0),
    pickupReference: row.pickup_reference ?? row.order_number ?? "-",
    orderReference: row.order_number ?? "",
    bookTitle: row.book_title ?? "교재",
    bookCount: Number(row.book_count ?? 1),
    grossSales: Number(row.sale_amount ?? 0),
    feeAmount: Number(row.fee_amount ?? 0),
    bankLabel: row.bank_name || "계좌 미등록",
    maskedAccount: maskSettlementAccount(row),
    status: row.status,
    statusLabel: statusLabelMap[row.status] ?? row.status,
    tone: toneMap[row.status] ?? "neutral",
  };
}

function persistLocalCollection(userId, storageKey, nextItems) {
  writeStoredPortalState(userId, {
    [storageKey]: sortDefaultFirst(nextItems),
  });
}

function upsertLocalCollectionItem(userId, storageKey, nextItem, shouldMakeDefault) {
  const storedState = readStoredPortalState(userId);
  const currentItems = Array.isArray(storedState[storageKey]) ? storedState[storageKey] : [];
  const itemsWithoutCurrent = currentItems.filter((item) => item.id !== nextItem.id);
  const normalizedItems = shouldMakeDefault
    ? itemsWithoutCurrent.map((item) => ({ ...item, is_default: false }))
    : itemsWithoutCurrent;

  normalizedItems.push({
    ...nextItem,
    is_default: shouldMakeDefault ? true : Boolean(nextItem.is_default),
  });

  persistLocalCollection(userId, storageKey, normalizedItems);
}

function setLocalDefaultCollectionItem(userId, storageKey, itemId) {
  const storedState = readStoredPortalState(userId);
  const currentItems = Array.isArray(storedState[storageKey]) ? storedState[storageKey] : [];

  persistLocalCollection(
    userId,
    storageKey,
    currentItems.map((item) => ({
      ...item,
      is_default: item.id === itemId,
    })),
  );
}

function deleteLocalCollectionItem(userId, storageKey, itemId) {
  const storedState = readStoredPortalState(userId);
  const currentItems = Array.isArray(storedState[storageKey]) ? storedState[storageKey] : [];

  persistLocalCollection(
    userId,
    storageKey,
    currentItems.filter((item) => item.id !== itemId),
  );
}

function hasPersistedId(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getErrorCode(error) {
  return typeof error?.code === "string" ? error.code.toUpperCase() : "";
}

function getErrorMessage(error) {
  return typeof error?.message === "string" ? error.message.toLowerCase() : "";
}

function shouldUseLocalSchemaFallback(error) {
  const errorCode = getErrorCode(error);
  const errorMessage = getErrorMessage(error);

  return (
    errorCode === "PGRST202" ||
    errorCode === "PGRST205" ||
    errorMessage.includes("schema cache") ||
    errorMessage.includes("could not find the table") ||
    errorMessage.includes("could not find the function")
  );
}

async function setDefaultCollectionItem({ userId, itemId, storageKey, rpcName, tableName }) {
  if (!userId) {
    return {
      error: new Error("사용자 정보를 확인할 수 없습니다."),
      source: "fallback",
    };
  }

  if (!isSupabaseConfigured || !supabase || !hasPersistedId(itemId)) {
    setLocalDefaultCollectionItem(userId, storageKey, itemId);
    return {
      error: null,
      source: "local",
    };
  }

  const rpcArguments =
    storageKey === "shippingAddresses"
      ? { p_address_id: itemId }
      : { p_account_id: itemId };
  const { error: rpcError } = await supabase.rpc(rpcName, rpcArguments);

  if (!rpcError) {
    return {
      error: null,
      source: "supabase",
    };
  }

  const { error: resetError } = await supabase
    .from(tableName)
    .update({ is_default: false })
    .eq("user_id", userId);

  if (resetError) {
    setLocalDefaultCollectionItem(userId, storageKey, itemId);
    if (shouldUseLocalSchemaFallback(rpcError) || shouldUseLocalSchemaFallback(resetError)) {
      return {
        error: null,
        source: "local",
      };
    }
    return {
      error: rpcError,
      source: "fallback",
    };
  }

  const { error: setError } = await supabase
    .from(tableName)
    .update({ is_default: true })
    .eq("user_id", userId)
    .eq("id", itemId);

  if (setError) {
    setLocalDefaultCollectionItem(userId, storageKey, itemId);
    if (shouldUseLocalSchemaFallback(rpcError) || shouldUseLocalSchemaFallback(setError)) {
      return {
        error: null,
        source: "local",
      };
    }
    return {
      error: setError,
      source: "fallback",
    };
  }

  return {
    error: null,
    source: "supabase",
  };
}

async function saveMemberProfile({ user, values }) {
  if (!user) {
    return {
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
      source: "fallback",
    };
  }

  const nextProfile = {
    user_id: user.id,
    email: user.email ?? "",
    name: normalizeText(values.name),
    nickname: normalizeText(values.nickname),
    phone: normalizeText(values.phone),
    marketing_opt_in: Boolean(values.marketing_opt_in),
    created_at: user.created_at ?? null,
  };

  if (!nextProfile.name) {
    return {
      error: new Error("이름을 입력해 주세요."),
      source: "validation",
    };
  }

  if (!nextProfile.nickname) {
    nextProfile.nickname = nextProfile.name;
  }

  writeStoredPortalState(user.id, { profile: nextProfile });

  if (!isSupabaseConfigured || !supabase) {
    return {
      error: null,
      source: "local",
    };
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      name: nextProfile.name,
      nickname: nextProfile.nickname,
      phone: nextProfile.phone,
      marketing_opt_in: nextProfile.marketing_opt_in,
    },
  });

  const { error: profileError } = await supabase
    .from("member_profiles")
    .update({
      name: nextProfile.name,
      nickname: nextProfile.nickname,
      phone: nextProfile.phone || null,
      marketing_opt_in: nextProfile.marketing_opt_in,
    })
    .eq("user_id", user.id);

  if (!authError && shouldUseLocalSchemaFallback(profileError)) {
    return {
      error: null,
      source: "local",
    };
  }

  return {
    error: authError ?? profileError ?? null,
    source: authError || profileError ? "fallback" : "supabase",
  };
}

async function checkMemberNicknameAvailability({ user, nickname }) {
  const normalizedNickname = normalizeText(nickname);

  if (!normalizedNickname) {
    return {
      isAvailable: false,
      error: new Error("닉네임을 입력해 주세요."),
      source: "validation",
      verified: false,
    };
  }

  if (!user) {
    return {
      isAvailable: false,
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
      source: "fallback",
      verified: false,
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      isAvailable: true,
      error: null,
      source: "local",
      verified: false,
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("check_member_nickname_availability", {
    p_nickname: normalizedNickname,
  });

  if (!rpcError) {
    const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (typeof rpcRow?.is_available === "boolean") {
      return {
        isAvailable: rpcRow.is_available,
        error: null,
        source: "supabase",
        verified: true,
      };
    }
  }

  const { data: profileRows, error: profileError } = await supabase
    .from("member_profiles")
    .select("user_id")
    .eq("nickname", normalizedNickname)
    .neq("user_id", user.id)
    .limit(1);

  if (!profileError) {
    return {
      isAvailable: !Array.isArray(profileRows) || profileRows.length === 0,
      error: null,
      source: "supabase",
      verified: true,
    };
  }

  if (shouldUseLocalSchemaFallback(rpcError) || shouldUseLocalSchemaFallback(profileError)) {
    return {
      isAvailable: true,
      error: null,
      source: "local",
      verified: false,
    };
  }

  return {
    isAvailable: true,
    error: null,
    source: "fallback",
    verified: false,
  };
}

async function saveCollectionItem({
  user,
  storageKey,
  tableName,
  values,
  shouldMakeDefault,
  buildStoredItem,
  rpcName,
}) {
  if (!user) {
    return {
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
      source: "fallback",
    };
  }

  const storedItem = buildStoredItem({
    ...values,
    user_id: user.id,
    is_default: shouldMakeDefault,
  });

  if (!isSupabaseConfigured || !supabase) {
    upsertLocalCollectionItem(user.id, storageKey, storedItem, shouldMakeDefault);
    return {
      error: null,
      source: "local",
    };
  }

  const payload = {
    user_id: user.id,
    ...values,
  };
  if (!hasPersistedId(values.id)) {
    delete payload.id;
  }

  const query = hasPersistedId(values.id)
    ? supabase.from(tableName).update(payload).eq("user_id", user.id).eq("id", values.id).select("*").maybeSingle()
    : supabase.from(tableName).insert(payload).select("*").maybeSingle();

  const { data, error } = await query;

  if (error || !data) {
    upsertLocalCollectionItem(user.id, storageKey, storedItem, shouldMakeDefault);
    if (shouldUseLocalSchemaFallback(error)) {
      return {
        error: null,
        source: "local",
      };
    }
    return {
      error: error ?? new Error("항목을 저장하지 못했습니다."),
      source: "fallback",
    };
  }

  if (shouldMakeDefault) {
    const defaultResult = await setDefaultCollectionItem({
      userId: user.id,
      itemId: data.id,
      storageKey,
      rpcName,
      tableName,
    });

    if (defaultResult.error) {
      return defaultResult;
    }
  }

  return {
    error: null,
    source: "supabase",
  };
}

async function deleteCollectionItem({ user, storageKey, tableName, itemId }) {
  if (!user) {
    return {
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
      source: "fallback",
    };
  }

  if (!isSupabaseConfigured || !supabase || !hasPersistedId(itemId)) {
    deleteLocalCollectionItem(user.id, storageKey, itemId);
    return {
      error: null,
      source: "local",
    };
  }

  const { error } = await supabase.from(tableName).delete().eq("user_id", user.id).eq("id", itemId);

  if (error) {
    deleteLocalCollectionItem(user.id, storageKey, itemId);
    if (shouldUseLocalSchemaFallback(error)) {
      return {
        error: null,
        source: "local",
      };
    }
    return {
      error,
      source: "fallback",
    };
  }

  return {
    error: null,
    source: "supabase",
  };
}

async function loadMemberPortalSnapshot({ user, profile, demoMode = false }) {
  const storedState = readStoredPortalState(user?.id);
  const fallbackProfile = profile ?? storedState.profile ?? createFallbackProfile(user);

  if (!user) {
    return {
      profile: fallbackProfile,
      dashboardSummary: createEmptyDashboardSummary(fallbackProfile),
      recentShipments: [],
      shipments: [],
      orders: [],
      settlementSummary: null,
      completedSettlements: [],
      scheduledSettlements: [],
      shippingAddresses: [],
      settlementAccounts: [],
      sources: {
        profile: "fallback",
        summary: "empty",
        recentShipments: "empty",
        orders: "empty",
        settlements: "empty",
        shippingAddresses: "empty",
        settlementAccounts: "empty",
      },
    };
  }

  if (demoMode) {
    const demoState = mergePortalDemoState(storedState, fallbackProfile);

    writeStoredPortalState(user.id, {
      profile: demoState.profile,
      shipments: demoState.shipments,
      orders: demoState.orders,
      settlementSummary: demoState.settlementSummary,
      completedSettlements: demoState.completedSettlements,
      scheduledSettlements: demoState.scheduledSettlements,
      shippingAddresses: demoState.shippingAddresses,
      settlementAccounts: demoState.settlementAccounts,
      dashboardSummary: demoState.dashboardSummary,
    });

    return {
      profile: demoState.profile,
      dashboardSummary: demoState.dashboardSummary,
      recentShipments: demoState.shipments,
      shipments: demoState.shipments,
      orders: demoState.orders,
      settlementSummary: demoState.settlementSummary,
      completedSettlements: demoState.completedSettlements,
      scheduledSettlements: demoState.scheduledSettlements,
      shippingAddresses: demoState.shippingAddresses,
      settlementAccounts: demoState.settlementAccounts,
      sources: {
        profile: "demo",
        summary: "demo",
        recentShipments: "demo",
        orders: "demo",
        settlements: "demo",
        shippingAddresses: "demo",
        settlementAccounts: "demo",
      },
    };
  }

  const [
    dashboardResult,
    recentShipmentsResult,
    shippingAddressesResult,
    settlementAccountsResult,
    pickupRequestsResult,
    ordersResult,
    settlementsResult,
  ] = await Promise.all([
    fetchDashboardSummary(fallbackProfile),
    fetchRecentShipments(),
    fetchCollectionRows(SHIPPING_ADDRESSES_TABLE, user.id),
    fetchCollectionRows(SETTLEMENT_ACCOUNTS_TABLE, user.id),
    fetchPickupRequests(),
    fetchOrders(),
    fetchSettlements(),
  ]);

  const dashboardSummary = dashboardResult.summary;
  const nextProfile = {
    ...fallbackProfile,
    ...dashboardSummary,
  };

  const shippingAddresses =
    shippingAddressesResult.source === "supabase"
      ? sortDefaultFirst(shippingAddressesResult.rows)
      : sortDefaultFirst(storedState.shippingAddresses);
  const settlementAccounts =
    settlementAccountsResult.source === "supabase"
      ? sortDefaultFirst(settlementAccountsResult.rows)
      : sortDefaultFirst(storedState.settlementAccounts);

  // 수거 요청 → SalesTab용 shipment 형태로 변환
  const pickupShipments =
    pickupRequestsResult.source !== "local"
      ? pickupRequestsResult.pickupRequests.map(mapPickupRequestToShipment)
      : [];
  // 기존 shipments(레거시)와 병합, pickup이 있으면 우선 사용
  const shipments = pickupShipments.length > 0
    ? pickupShipments
    : recentShipmentsResult.recentShipments;

  // 주문 → PurchasesTab용 order 형태로 변환
  const orders =
    ordersResult.source !== "local"
      ? ordersResult.orders.map(mapOrderToDisplayOrder)
      : storedState.orders;
  const hasRemoteSettlements = settlementsResult.source === "supabase";
  const remoteSettlements = hasRemoteSettlements
    ? settlementsResult.rows.map(mapSettlementRow)
    : [];
  const settlementSummary = hasRemoteSettlements
    ? mapSettlementSummary(settlementsResult.summary)
    : storedState.settlementSummary;
  const completedSettlements = hasRemoteSettlements
    ? remoteSettlements.filter((settlement) => settlement.status === "completed")
    : storedState.completedSettlements;
  const scheduledSettlements = hasRemoteSettlements
    ? remoteSettlements.filter((settlement) => settlement.status !== "completed")
    : storedState.scheduledSettlements;

  writeStoredPortalState(user.id, {
    profile: nextProfile,
    shipments,
    orders,
    settlementSummary,
    completedSettlements,
    scheduledSettlements,
    shippingAddresses,
    settlementAccounts,
    dashboardSummary,
  });

  return {
    profile: nextProfile,
    dashboardSummary,
    recentShipments: shipments,
    shipments,
    orders,
    settlementSummary,
    completedSettlements,
    scheduledSettlements,
    shippingAddresses,
    settlementAccounts,
    sources: {
      profile: dashboardResult.source === "supabase" ? "supabase" : "fallback",
      summary: dashboardResult.source,
      recentShipments: pickupRequestsResult.source !== "local" ? pickupRequestsResult.source : recentShipmentsResult.source,
      orders: ordersResult.source !== "local" ? ordersResult.source : (storedState.orders.length ? "local" : "empty"),
      settlements: hasRemoteSettlements
        ? "supabase"
        : (storedState.settlementSummary ? "local" : "empty"),
      shippingAddresses: shippingAddressesResult.source,
      settlementAccounts: settlementAccountsResult.source,
    },
  };
}

async function confirmMemberPurchase({ user, orderId, demoMode = false }) {
  if (!user) {
    return {
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
      source: "fallback",
    };
  }

  // RPC를 통한 구매확정 (서버사이드 검증)
  if (isSupabaseConfigured && supabase && !demoMode && typeof orderId === "number") {
    const { error } = await supabase.rpc("confirm_member_purchase", { p_order_id: orderId });

    if (error && !shouldUseLocalSchemaFallback(error)) {
      return { error, source: "fallback" };
    }

    if (!error) {
      return { error: null, source: "supabase" };
    }
  }

  // 로컬 fallback
  const storedState = readStoredPortalState(user.id);
  const baseState = demoMode ? mergePortalDemoState(storedState, storedState.profile ?? DEMO_MEMBER_PROFILE) : storedState;
  const { changed, orders } = confirmPortalOrder(baseState.orders, orderId);

  if (!changed) {
    return {
      error: new Error("구매확정 가능한 주문을 찾지 못했습니다."),
      source: "validation",
    };
  }

  const purchaseInProgressCount = orders.filter((order) =>
    ["paid", "shipping", "delivered"].includes(order.status),
  ).length;

  writeStoredPortalState(user.id, {
    orders,
    dashboardSummary: {
      ...(baseState.dashboardSummary ?? createEmptyDashboardSummary(baseState.profile)),
      purchase_in_progress_count: purchaseInProgressCount,
    },
  });

  return {
    error: null,
    source: "local",
  };
}

async function cancelMemberOrder({ user, orderId, demoMode = false }) {
  if (!user) {
    return {
      error: new Error("로그인된 회원 정보를 찾지 못했습니다."),
      source: "fallback",
    };
  }

  // RPC를 통한 주문 취소 (서버사이드 검증)
  if (isSupabaseConfigured && supabase && !demoMode && typeof orderId === "number") {
    const { error } = await supabase.rpc("cancel_member_order", { p_order_id: orderId });

    if (error && !shouldUseLocalSchemaFallback(error)) {
      return { error, source: "fallback" };
    }

    if (!error) {
      return { error: null, source: "supabase" };
    }
  }

  // 로컬 fallback
  const storedState = readStoredPortalState(user.id);
  const baseState = demoMode ? mergePortalDemoState(storedState, storedState.profile ?? DEMO_MEMBER_PROFILE) : storedState;
  const updatedOrders = (baseState.orders ?? []).map((order) =>
    (order.id === orderId && ["pending", "paid"].includes(order.status))
      ? { ...order, status: "cancelled" }
      : order,
  );

  writeStoredPortalState(user.id, { orders: updatedOrders });

  return { error: null, source: "local" };
}

async function saveMemberShippingAddress({ user, values, shouldMakeDefault }) {
  return saveCollectionItem({
    user,
    storageKey: "shippingAddresses",
    tableName: SHIPPING_ADDRESSES_TABLE,
    shouldMakeDefault,
    rpcName: "set_member_default_shipping_address",
    buildStoredItem: buildStoredAddress,
    values: {
      id: values.id ?? null,
      label: normalizeText(values.label),
      recipient_name: normalizeText(values.recipient_name),
      recipient_phone: normalizeText(values.recipient_phone),
      postal_code: normalizeText(values.postal_code),
      address_line1: normalizeText(values.address_line1),
      address_line2: normalizeNullableText(values.address_line2),
      delivery_memo: normalizeNullableText(values.delivery_memo),
    },
  });
}

async function deleteMemberShippingAddress({ user, addressId }) {
  return deleteCollectionItem({
    user,
    storageKey: "shippingAddresses",
    tableName: SHIPPING_ADDRESSES_TABLE,
    itemId: addressId,
  });
}

async function setDefaultMemberShippingAddress({ user, addressId }) {
  return setDefaultCollectionItem({
    userId: user?.id,
    itemId: addressId,
    storageKey: "shippingAddresses",
    rpcName: "set_member_default_shipping_address",
    tableName: SHIPPING_ADDRESSES_TABLE,
  });
}

async function saveMemberSettlementAccount({ user, values, shouldMakeDefault }) {
  return saveCollectionItem({
    user,
    storageKey: "settlementAccounts",
    tableName: SETTLEMENT_ACCOUNTS_TABLE,
    shouldMakeDefault,
    rpcName: "set_member_default_settlement_account",
    buildStoredItem: buildStoredAccount,
    values: {
      id: values.id ?? null,
      bank_name: normalizeText(values.bank_name),
      account_number: normalizeText(values.account_number),
      account_holder: normalizeText(values.account_holder),
    },
  });
}

async function deleteMemberSettlementAccount({ user, accountId }) {
  return deleteCollectionItem({
    user,
    storageKey: "settlementAccounts",
    tableName: SETTLEMENT_ACCOUNTS_TABLE,
    itemId: accountId,
  });
}

async function setDefaultMemberSettlementAccount({ user, accountId }) {
  return setDefaultCollectionItem({
    userId: user?.id,
    itemId: accountId,
    storageKey: "settlementAccounts",
    rpcName: "set_member_default_settlement_account",
    tableName: SETTLEMENT_ACCOUNTS_TABLE,
  });
}

export {
  checkMemberNicknameAvailability,
  confirmMemberPurchase,
  createDisplayName,
  createEmptyDashboardSummary,
  createFallbackProfile,
  deleteMemberSettlementAccount,
  deleteMemberShippingAddress,
  cancelMemberOrder,
  loadMemberPortalSnapshot,
  saveMemberProfile,
  saveMemberSettlementAccount,
  saveMemberShippingAddress,
  setDefaultMemberSettlementAccount,
  setDefaultMemberShippingAddress,
};
