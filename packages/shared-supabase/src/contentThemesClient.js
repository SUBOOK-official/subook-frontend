import { requestCuratedContent, requireCuratedClient, saveCuratedContent } from "./curatedContentClient.js";

export async function listContentThemes(client, publishedOnly = true) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => {
    let query = client.from("content_themes").select(publishedOnly
      ? "id,title,image_url,sort_order"
      : "id,title,image_url,product_ids,is_enabled,sort_order,updated_at").order("sort_order").order("id");
    if (publishedOnly) query = query.eq("is_enabled", true);
    return query.abortSignal(signal);
  });
}

export function saveContentTheme(client, row) {
  const { id, title, image_url, product_ids, is_enabled, sort_order, updated_at } = row;
  return saveCuratedContent(client, "content_themes", "id", {
    id, title: title.trim(), image_url, product_ids: [...new Set(product_ids)],
    is_enabled, sort_order: Number(sort_order),
  }, updated_at);
}
