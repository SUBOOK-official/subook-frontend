import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

const SUBJECTS = ["국어", "수학", "영어", "과학", "사회", "한국사", "기타"];
const BRANDS = ["시대인재", "강남대성", "대성마이맥", "이투스", "EBS", "기타"];
const BOOK_TYPES = ["기출", "모의고사", "N제", "EBS", "주간지", "내신", "기타"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const BANK_LIST = [
  "신한은행", "국민은행", "우리은행", "하나은행", "농협은행",
  "기업은행", "SC제일은행", "씨티은행", "카카오뱅크", "토스뱅크",
  "케이뱅크", "대구은행", "부산은행", "경남은행", "광주은행",
  "전북은행", "제주은행", "수협은행", "신협", "새마을금고",
  "우체국", "산림조합",
];

function createLocalItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyManualItem() {
  return {
    localId: createLocalItemId(),
    book_id: null,
    title: "",
    subject: "",
    brand: "",
    book_type: "",
    published_year: CURRENT_YEAR,
    instructor_name: "",
    original_price: null,
    condition_memo: "",
    is_manual_entry: true,
  };
}

function createItemFromProduct(product) {
  return {
    localId: createLocalItemId(),
    book_id: product.id,
    title: [product.title, product.option].filter(Boolean).join(" "),
    subject: product.subject ?? "",
    brand: product.brand ?? "",
    book_type: product.book_type ?? "",
    published_year: product.published_year ?? CURRENT_YEAR,
    instructor_name: product.instructor_name ?? "",
    original_price: product.original_price ?? null,
    condition_memo: "",
    is_manual_entry: false,
  };
}

async function searchBooksForPickup(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return { results: [], error: null };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { results: [], error: null };
  }

  const { data, error } = await supabase.rpc("search_books_for_pickup", {
    p_search: searchTerm.trim(),
    p_limit: 10,
  });

  if (error) {
    return { results: [], error };
  }

  return { results: Array.isArray(data) ? data : [], error: null };
}

async function submitPickupRequest({
  pickupAddress,
  settlementAccount,
  items,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: new Error("서비스에 연결할 수 없습니다."),
    };
  }

  const itemsPayload = items.map((item) => ({
    book_id: item.book_id ? String(item.book_id) : null,
    title: item.title,
    subject: item.subject || null,
    brand: item.brand || null,
    book_type: item.book_type || null,
    published_year: item.published_year ? Number(item.published_year) : null,
    instructor_name: item.instructor_name || null,
    original_price: item.original_price ? Number(item.original_price) : null,
    condition_memo: item.condition_memo || null,
    is_manual_entry: Boolean(item.is_manual_entry),
  }));

  const { data, error } = await supabase.rpc("submit_pickup_request", {
    p_pickup_recipient_name: pickupAddress.recipient_name,
    p_pickup_recipient_phone: pickupAddress.recipient_phone,
    p_pickup_postal_code: pickupAddress.postal_code,
    p_pickup_address_line1: pickupAddress.address_line1,
    p_pickup_address_line2: pickupAddress.address_line2 || null,
    p_pickup_memo: pickupAddress.memo || null,
    p_settlement_bank_name: settlementAccount.bank_name,
    p_settlement_account_number: settlementAccount.account_number,
    p_settlement_account_holder: settlementAccount.account_holder,
    p_settlement_account_id: settlementAccount.account_id ?? settlementAccount.id ?? null,
    p_items: itemsPayload,
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}

export {
  BANK_LIST,
  BOOK_TYPES,
  BRANDS,
  CURRENT_YEAR,
  SUBJECTS,
  YEARS,
  createEmptyManualItem,
  createItemFromProduct,
  createLocalItemId,
  searchBooksForPickup,
  submitPickupRequest,
};
