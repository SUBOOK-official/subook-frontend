import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

const SHIPPING_FEE = 3500;
const FREE_SHIPPING_THRESHOLD = 30000;

const LOCAL_CART_STORAGE_KEY = "subook.public.local-cart.v1";
const LOCAL_CART_ID_PREFIX = "local-";

function calculateShippingFee(subtotal) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

function toBigintParam(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function isLocalCartId(id) {
  if (id === null || id === undefined) return false;
  return String(id).startsWith(LOCAL_CART_ID_PREFIX);
}

function isLocalBookId(bookId) {
  // 숫자로 캐스팅 불가 → mock / 데모 데이터로 간주
  return toBigintParam(bookId) === null;
}

// ── localStorage 데모 카트 헬퍼 ─────────────────────────────
function readLocalCart() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalCart(items) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(LOCAL_CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / private mode failures
  }
}

function generateLocalCartItemId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${LOCAL_CART_ID_PREFIX}${Date.now()}-${random}`;
}

function addToLocalCart({ bookId, productId, quantity, productMeta = {} }) {
  const items = readLocalCart();
  const existingIndex = items.findIndex((entry) => String(entry.book_id) === String(bookId));
  const safeQuantity = Math.min(99, Math.max(1, Number(quantity) || 1));

  if (existingIndex >= 0) {
    const next = { ...items[existingIndex] };
    next.quantity = Math.min(99, (next.quantity ?? 1) + safeQuantity);
    items[existingIndex] = next;
    writeLocalCart(items);
    return { data: { cart_item_id: next.id, demo: true }, error: null };
  }

  const newItem = {
    id: generateLocalCartItemId(),
    book_id: bookId,
    product_id: productId ?? null,
    title: productMeta.title ?? "데모 교재",
    subject: productMeta.subject ?? null,
    brand: productMeta.brand ?? null,
    option_label: productMeta.optionLabel ?? null,
    condition_grade: productMeta.conditionGrade ?? null,
    cover_image_url: productMeta.coverImageUrl ?? null,
    price: typeof productMeta.price === "number" ? productMeta.price : null,
    quantity: safeQuantity,
    is_sold_out: false,
    is_demo: true,
    created_at: new Date().toISOString(),
  };

  items.push(newItem);
  writeLocalCart(items);
  return { data: { cart_item_id: newItem.id, demo: true }, error: null };
}

function updateLocalCartItem(cartItemId, quantity) {
  const items = readLocalCart();
  const index = items.findIndex((entry) => entry.id === cartItemId);
  if (index < 0) return { error: null };
  const safeQuantity = Math.min(99, Math.max(1, Number(quantity) || 1));
  items[index] = { ...items[index], quantity: safeQuantity };
  writeLocalCart(items);
  return { error: null };
}

function deleteLocalCartItem(cartItemId) {
  const items = readLocalCart();
  const next = items.filter((entry) => entry.id !== cartItemId);
  writeLocalCart(next);
  return { error: null };
}

function deleteLocalCartItems(cartItemIds) {
  const idSet = new Set(cartItemIds.map(String));
  const items = readLocalCart();
  const next = items.filter((entry) => !idSet.has(String(entry.id)));
  writeLocalCart(next);
  return { error: null };
}

// ── 공개 API ────────────────────────────────────────────────
async function addToCart({ bookId, productId = null, quantity = 1, productMeta = null }) {
  // mock / 데모 데이터: localStorage 카트로 fallback
  if (isLocalBookId(bookId)) {
    return addToLocalCart({ bookId, productId, quantity, productMeta });
  }

  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const numericBookId = toBigintParam(bookId);
  if (numericBookId === null) {
    return {
      data: null,
      error: new Error("교재 정보가 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."),
    };
  }

  const { data, error } = await supabase.rpc("add_to_cart", {
    p_book_id: numericBookId,
    p_product_id: toBigintParam(productId),
    p_quantity: Number.isFinite(Number(quantity)) ? Math.trunc(Number(quantity)) : 1,
  });

  if (error) {
    if (typeof window !== "undefined" && window.console) {
      window.console.warn("[addToCart] supabase rpc error", error);
    }
    return { data: null, error };
  }

  return { data, error: null };
}

async function getCartItems() {
  const localItems = readLocalCart();

  if (!isSupabaseConfigured || !supabase) {
    return { items: localItems, error: null };
  }

  const { data, error } = await supabase.rpc("get_cart_items");

  if (error) {
    // RPC 실패 시에도 localStorage 데모 카트는 유지
    return { items: localItems, error };
  }

  const remoteItems = Array.isArray(data) ? data : [];
  return { items: [...remoteItems, ...localItems], error: null };
}

async function updateCartItemQuantity(cartItemId, quantity) {
  if (isLocalCartId(cartItemId)) {
    return updateLocalCartItem(cartItemId, quantity);
  }

  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { error } = await supabase
    .from("cart_items")
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("id", cartItemId);

  return { error: error ?? null };
}

async function deleteCartItem(cartItemId) {
  if (isLocalCartId(cartItemId)) {
    return deleteLocalCartItem(cartItemId);
  }

  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", cartItemId);

  return { error: error ?? null };
}

async function deleteCartItems(cartItemIds) {
  const localIds = cartItemIds.filter(isLocalCartId);
  const remoteIds = cartItemIds.filter((id) => !isLocalCartId(id));

  if (localIds.length > 0) {
    deleteLocalCartItems(localIds);
  }

  if (remoteIds.length === 0) {
    return { error: null };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .in("id", remoteIds);

  return { error: error ?? null };
}

async function createOrder({
  bookIds,
  quantities,
  shippingRecipientName,
  shippingRecipientPhone,
  shippingPostalCode,
  shippingAddressLine1,
  shippingAddressLine2,
  shippingMemo,
  paymentMethod = "bank_transfer",
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { data, error } = await supabase.rpc("create_order", {
    p_book_ids: bookIds,
    p_quantities: quantities,
    p_shipping_recipient_name: shippingRecipientName,
    p_shipping_recipient_phone: shippingRecipientPhone,
    p_shipping_postal_code: shippingPostalCode,
    p_shipping_address_line1: shippingAddressLine1,
    p_shipping_address_line2: shippingAddressLine2 || null,
    p_shipping_memo: shippingMemo || null,
    p_payment_method: paymentMethod,
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}

export {
  FREE_SHIPPING_THRESHOLD,
  LOCAL_CART_ID_PREFIX,
  SHIPPING_FEE,
  addToCart,
  calculateShippingFee,
  createOrder,
  deleteCartItem,
  deleteCartItems,
  getCartItems,
  isLocalBookId,
  isLocalCartId,
  updateCartItemQuantity,
};
