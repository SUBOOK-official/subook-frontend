import { supabase } from "@shared-supabase/adminSupabaseClient";
import { callIlseongSalesApi } from "./ilseongAdmin";

// 「일성월심 앱」 › 학습지의 3·4단계가 수북 DB에 하는 일: 사이트에서 팔 상품을 만들고, 사이트에 보이게 하거나 숨긴다.
// 수북 상품은 학습지의 상품 코드를 달고 있다. 결제가 확인되면 그 학습지의 교재가 구매한 회원의 앱에 등록된다.

function fail(error, fallback) {
  throw new Error(error?.message || fallback);
}

/** 사이트에서 팔 상품과 재고를 만들고 이 학습지에 잇는다(숨긴 채로 만든다. 사이트에 보이게 하는 일은 4단계에서 한다). */
export async function createStoreProduct({ appProductCode, form, coverUrl }) {
  const { data, error } = await supabase.rpc("admin_create_ilseong_store_product", {
    p_payload: {
      title: form.title.trim(),
      app_product_code: appProductCode,
      subject: form.subject,
      brand: form.brand,
      book_type: form.bookType,
      original_price: form.originalPrice,
      discount_type: form.discountType,
      discount_value: form.discountType === "none" ? null : form.discountValue,
      quantity: form.quantity,
      cover_image_url: coverUrl,
      listed: false,
    },
  });
  if (error) fail(error, "상품을 만들지 못했어요.");
  return data;
}

/** 상품 번호로 수북 상품을 찾는다(이미 만들어 둔 상품을 이을 때). 없으면 null. */
export async function findStoreProduct(productId) {
  const { data, error } = await supabase.from("products").select("id, title, is_listed").eq("id", productId).maybeSingle();
  if (error) fail(error, "상품을 찾지 못했어요.");
  return data ?? null;
}

export async function linkStoreProduct(productId, appProductCode) {
  const { error } = await supabase.rpc("admin_set_ilseong_app_product", {
    p_product_id: productId,
    p_is_app_package: true,
    p_app_product_code: appProductCode,
  });
  if (error) fail(error, "잇지 못했어요.");
}

export async function unlinkStoreProduct(productId) {
  const { error } = await supabase.rpc("admin_set_ilseong_app_product", { p_product_id: productId, p_is_app_package: false });
  if (error) fail(error, "떼지 못했어요.");
}

/**
 * 수북 상품 하나의 가격·표지·재고. 재고는 한 세트가 한 줄(books)이다.
 * @returns {{ price: number|null, originalPrice: number|null, cover: string|null, onSale: number, visible: number }}
 *          onSale = 팔 수 있는 재고, visible = 그 가운데 사이트에 보이는 것
 */
export async function readStoreStock(productId) {
  const [one, onSale, visible] = await Promise.all([
    supabase.from("books").select("price, original_price, cover_image_url").eq("product_id", productId).order("id", { ascending: false }).limit(1),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("status", "on_sale"),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("status", "on_sale").eq("is_public", true),
  ]);
  const error = one.error || onSale.error || visible.error;
  if (error) fail(error, "상품 정보를 읽지 못했어요.");
  const row = one.data?.[0] ?? {};
  return {
    price: row.price ?? null,
    originalPrice: row.original_price ?? null,
    cover: row.cover_image_url || null,
    onSale: onSale.count ?? 0,
    visible: visible.count ?? 0,
  };
}

/** 구매한 사람에게 보내는 안내 알림톡이 카카오 승인을 받았는지: "APPROVED" | "INSPECTING" | "PENDING" | "REJECTED" | "UNKNOWN". */
export async function readGuideTemplateStatus() {
  const result = await callIlseongSalesApi({ payload: { action: "guide_template" } });
  return result?.guideTemplateStatus ?? "UNKNOWN";
}

/**
 * 판매 시작: 앱 교재 판매가 꺼져 있으면 켜고, 이 학습지의 상품을 사이트에 보이게 한다.
 * 판매를 켜는 것은 서버가 앱 서버 연결과 안내 알림톡을 확인한 뒤에만 된다.
 */
export async function startSelling({ productIds, salesEnabled }) {
  if (!salesEnabled) await callIlseongSalesApi({ payload: { action: "save_settings", salesEnabled: true } });
  const { error } = await supabase.rpc("admin_bulk_set_products_visibility", { p_product_ids: productIds, p_is_public: true });
  if (error) fail(error, "사이트에 보이게 하지 못했어요.");
}

/** 판매 중지: 이 학습지의 상품만 사이트에서 숨긴다. 이미 결제된 주문은 그대로 처리된다. */
export async function stopSelling({ productIds }) {
  const { error } = await supabase.rpc("admin_bulk_set_products_visibility", { p_product_ids: productIds, p_is_public: false });
  if (error) fail(error, "숨기지 못했어요.");
}

/** 환불했을 때 앱 교재를 어떻게 할지와 앱 받는 곳 주소. 판매 스위치는 건드리지 않는다. */
export async function saveSalesSettings({ refundPolicy, appDownloadUrl }) {
  return callIlseongSalesApi({ payload: { action: "save_settings", refundPolicy, appDownloadUrl: appDownloadUrl.trim() || null } });
}

/** 모든 학습지의 판매를 한꺼번에 멈춘다(이 앱의 상품이 모두 사이트에서 숨겨진다). */
export async function stopAllSelling() {
  return callIlseongSalesApi({ payload: { action: "save_settings", salesEnabled: false } });
}
