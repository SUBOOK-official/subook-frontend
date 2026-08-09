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
  items = [],
  policyAgreed = false,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      data: null,
      error: new Error("서비스에 연결할 수 없습니다."),
    };
  }

  // 정산계좌 형식 검증 (저장된 계좌(account_id) 사용 시는 RPC에서 검증되므로 skip)
  const hasSavedAccount = Boolean(settlementAccount?.account_id ?? settlementAccount?.id);
  if (!hasSavedAccount) {
    const accountNumberRaw = String(settlementAccount?.account_number ?? "").trim();
    if (!/^[0-9-]+$/.test(accountNumberRaw)) {
      return { data: null, error: new Error("계좌번호는 숫자와 '-'만 입력할 수 있습니다.") };
    }
    const digitsOnly = accountNumberRaw.replace(/\D/g, "");
    if (digitsOnly.length < 6) {
      return { data: null, error: new Error("계좌번호가 너무 짧습니다. 다시 확인해 주세요.") };
    }
    if (digitsOnly.length > 20) {
      return { data: null, error: new Error("계좌번호가 너무 깁니다. 다시 확인해 주세요.") };
    }
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

  const expectedBookCount = Number.parseInt(pickupAddress.expected_book_count, 10);
  const boxCount = Number.parseInt(pickupAddress.box_count, 10);

  // P0-2: 저장된 계좌(account_id)가 있을 때는 account_number를 절대 전송하지 않는다.
  // (마스킹된 문자열이 새 계좌번호로 잘못 저장되는 사고 방지)
  const resolvedAccountId = settlementAccount.account_id ?? settlementAccount.id ?? null;
  const resolvedAccountNumber = resolvedAccountId
    ? null
    : (settlementAccount.account_number || null);
  const resolvedBankName = resolvedAccountId ? null : settlementAccount.bank_name;
  const resolvedAccountHolder = resolvedAccountId ? null : settlementAccount.account_holder;

  const { data, error } = await supabase.rpc("submit_pickup_request", {
    p_pickup_recipient_name: pickupAddress.recipient_name,
    p_pickup_recipient_phone: pickupAddress.recipient_phone,
    p_pickup_postal_code: pickupAddress.postal_code,
    p_pickup_address_line1: pickupAddress.address_line1,
    p_pickup_address_line2: pickupAddress.address_line2 || null,
    p_pickup_memo: pickupAddress.memo || null,
    p_settlement_bank_name: resolvedBankName,
    p_settlement_account_number: resolvedAccountNumber,
    p_settlement_account_holder: resolvedAccountHolder,
    p_settlement_account_id: resolvedAccountId,
    p_items: itemsPayload,
    p_pickup_email: pickupAddress.email || null,
    p_pickup_entrance_password: pickupAddress.entrance_password || null,
    p_desired_pickup_date: pickupAddress.desired_pickup_date || null,
    p_expected_book_count: Number.isFinite(expectedBookCount) ? expectedBookCount : null,
    p_box_count: Number.isFinite(boxCount) ? boxCount : null,
    p_policy_agreed: Boolean(policyAgreed),
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}

// ─── 연락처 휴대폰 인증(OTP) — 허위/시험 수거신청 방어 (2026-08-10) ───
// 발송은 서버리스 /api/auth/send-phone-otp(솔라피 알림톡 우선·레이트리밋),
// 검증은 verify_phone_otp RPC → member_profiles.verified_phone 기록.
// submit_pickup_request가 연락처 번호와 verified_phone을 대조해 서버에서도 강제한다.

async function fetchVerifiedPhone(userId) {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return { verifiedPhone: "", error: null };
  }

  const { data, error } = await supabase
    .from("member_profiles")
    .select("verified_phone, phone_verified_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { verifiedPhone: "", error };
  }

  return {
    verifiedPhone: data?.phone_verified_at ? String(data?.verified_phone ?? "") : "",
    error: null,
  };
}

async function sendPhoneOtp(phone) {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    return { success: false, error: new Error("로그인이 필요합니다.") };
  }

  try {
    const response = await fetch("/api/auth/send-phone-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: String(phone || "").replace(/\D/g, "") }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      return {
        success: false,
        error: new Error(result?.error || "인증번호 발송에 실패했습니다."),
      };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: new Error("인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요."),
    };
  }
}

async function verifyPhoneOtp(code) {
  if (!isSupabaseConfigured || !supabase) {
    return { verifiedPhone: "", error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { data, error } = await supabase.rpc("verify_phone_otp", {
    p_code: String(code || "").trim(),
  });

  if (error) {
    return { verifiedPhone: "", error };
  }

  // RPC가 실제 인증된 번호를 돌려준다 — 발송 후 입력 번호를 바꾼 경우 대비.
  return { verifiedPhone: String(data?.phone ?? "").replace(/\D/g, ""), error: null };
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
  fetchVerifiedPhone,
  searchBooksForPickup,
  sendPhoneOtp,
  submitPickupRequest,
  verifyPhoneOtp,
};
