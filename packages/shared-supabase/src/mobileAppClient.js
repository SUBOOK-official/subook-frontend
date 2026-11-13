import { createClient } from "@supabase/supabase-js";
import { isPublicSupabaseKey } from "./publicCatalogClient.js";

// 수북 앱(iOS·Android) 전용 Supabase 클라이언트와 회원 데이터 읽기·쓰기.
// 웹과 같은 공개 키·RPC·RLS를 쓴다. 새 권한이나 서버 키를 쓰지 않는다.

export function createMobileSupabaseClient({ url, publicKey, storage, fetchImpl = globalThis.fetch }) {
  let origin;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    origin = parsed.origin;
  } catch {
    return null;
  }
  if (!isPublicSupabaseKey(publicKey)) return null;
  return createClient(origin, publicKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      // 앱은 주소창이 없다. 로그인 결과는 앱 안 웹 화면이 넘겨 주거나, 소셜 로그인 복귀 주소에서 직접 읽는다.
      detectSessionInUrl: false,
      // 소셜 로그인은 인증 코드를 받아 앱에서 세션으로 바꾼다(복귀 주소에 토큰을 싣지 않는다).
      flowType: "pkce",
    },
    global: { fetch: fetchImpl },
  });
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

function toId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

// ── 장바구니 (웹 cart.js와 같은 RPC·테이블) ─────────────────────────
export async function fetchCartItems(client) {
  const rows = unwrap(await client.rpc("get_cart_items"));
  return Array.isArray(rows) ? rows : [];
}

// 권당 1권: 같은 회차 2권은 서로 다른 book_id 2개로 담는다(웹과 동일).
export async function addBooksToCart(client, books) {
  for (const book of books) {
    const bookId = toId(book.bookId);
    if (!bookId) throw new Error("교재 정보가 올바르지 않아요. 다시 시도해 주세요.");
    unwrap(await client.rpc("add_to_cart", { p_book_id: bookId, p_product_id: toId(book.productId), p_quantity: 1 }));
  }
}

export async function removeCartItems(client, cartItemIds) {
  const ids = cartItemIds.map(toId).filter(Boolean);
  if (ids.length === 0) return;
  unwrap(await client.from("cart_items").delete().in("id", ids));
}

// ── 찜 (wishlist_items, 본인 행만 RLS 허용) ──────────────────────────
export async function fetchWishlistIds(client, userId) {
  const rows = unwrap(await client.from("wishlist_items").select("product_id").eq("user_id", userId).limit(500));
  return (rows ?? []).map((row) => String(row.product_id));
}

export async function setWishlisted(client, userId, productId, active) {
  const id = toId(productId);
  if (!id || !userId) throw new Error("교재 정보가 올바르지 않아요.");
  const query = active
    ? client.from("wishlist_items").upsert({ user_id: userId, product_id: id }, { onConflict: "user_id,product_id", ignoreDuplicates: true })
    : client.from("wishlist_items").delete().eq("user_id", userId).eq("product_id", id);
  unwrap(await query);
}

export async function fetchWishlistProducts(client) {
  const rows = unwrap(await client.rpc("get_my_wishlist_products", { p_limit: 100, p_offset: 0 }));
  return Array.isArray(rows) ? rows : [];
}

// ── 상품 소개(AI 요약) ──────────────────────────────────────────────
export async function fetchProductSummary(client, productId) {
  const id = toId(productId);
  if (!id) return "";
  const data = unwrap(await client.from("products").select("ai_summary").eq("id", id).maybeSingle());
  return typeof data?.ai_summary === "string" ? data.ai_summary : "";
}

// ── 재입고 알림 (웹 상품 상세와 같은 RPC) ─────────────────────────────
export async function isSubscribedRestock(client, productId) {
  const id = toId(productId);
  if (!id) return false;
  return Boolean(unwrap(await client.rpc("is_subscribed_restock", { p_product_id: id })));
}

export async function setRestockSubscription(client, productId, active) {
  const id = toId(productId);
  if (!id) throw new Error("교재 정보가 올바르지 않아요.");
  unwrap(await client.rpc(active ? "subscribe_restock" : "unsubscribe_restock", { p_product_id: id }));
}

// ── 통합 구매 후기 (웹 상품 상세와 같은 RPC) ─────────────────────────
// productId를 주면 같은 교재가 포함된 주문의 후기가 위로 온다.
export async function fetchPublicReviewsPage(client, { productId = null, limit, offset }) {
  return unwrap(await client.rpc("get_public_reviews", { p_product_id: toId(productId), p_limit: limit, p_offset: offset }));
}

// ── 맞춤 추천용 신호 (웹 홈 MemberRecommendations와 같은 조회) ──────────
export async function fetchMyRecentOrders(client) {
  const rows = unwrap(await client.rpc("get_my_orders", { p_limit: 20, p_offset: 0 }));
  return Array.isArray(rows) ? rows : [];
}

export async function fetchProductSignals(client, productIds) {
  const ids = productIds.map(toId).filter(Boolean);
  if (ids.length === 0) return [];
  return unwrap(await client.from("products").select("id,subject,book_type").in("id", ids)) ?? [];
}

// ── 소셜 로그인 (기기 브라우저 창에서 인증 → 앱 주소로 복귀, PKCE) ─────────
// redirectTo(예: subook://auth-callback)는 Supabase 로그인 설정의 Redirect URLs에 등록돼 있어야 한다.
export async function getOAuthSignInUrl(client, provider, redirectTo) {
  const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  if (!data?.url) throw new Error("로그인 주소를 받지 못했어요.");
  return data.url;
}

function readParams(text) {
  const params = {};
  for (const part of String(text ?? "").split("&")) {
    if (!part) continue;
    const index = part.indexOf("=");
    const key = index === -1 ? part : part.slice(0, index);
    try {
      params[decodeURIComponent(key)] = index === -1 ? "" : decodeURIComponent(part.slice(index + 1).replace(/\+/g, " "));
    } catch {
      // 해석할 수 없는 값은 건너뛴다.
    }
  }
  return params;
}

// 복귀 주소(subook://auth-callback?code=...)에서 인증 코드나 오류를 꺼낸다.
export function parseOAuthCallback(callbackUrl) {
  const text = String(callbackUrl ?? "");
  const hashIndex = text.indexOf("#");
  const beforeHash = hashIndex === -1 ? text : text.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  const params = {
    ...readParams(hashIndex === -1 ? "" : text.slice(hashIndex + 1)),
    ...readParams(queryIndex === -1 ? "" : beforeHash.slice(queryIndex + 1)),
  };
  return { code: params.code || null, error: params.error_description || params.error || null };
}

export async function completeOAuthSignIn(client, callbackUrl) {
  const { code, error: callbackError } = parseOAuthCallback(callbackUrl);
  if (callbackError) throw new Error(callbackError);
  if (!code) throw new Error("로그인 정보를 받지 못했어요.");
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}
