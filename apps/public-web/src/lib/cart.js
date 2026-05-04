import { isSupabaseConfigured, supabase } from "@shared-supabase/publicSupabaseClient";

const SHIPPING_FEE = 3500;
const FREE_SHIPPING_THRESHOLD = 30000;

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

async function addToCart({ bookId, productId = null, quantity = 1 }) {
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
  if (!isSupabaseConfigured || !supabase) {
    return { items: [], error: null };
  }

  const { data, error } = await supabase.rpc("get_cart_items");

  if (error) {
    return { items: [], error };
  }

  return { items: Array.isArray(data) ? data : [], error: null };
}

async function updateCartItemQuantity(cartItemId, quantity) {
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
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error("서비스에 연결할 수 없습니다.") };
  }

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .in("id", cartItemIds);

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
  SHIPPING_FEE,
  addToCart,
  calculateShippingFee,
  createOrder,
  deleteCartItem,
  deleteCartItems,
  getCartItems,
  updateCartItemQuantity,
};
