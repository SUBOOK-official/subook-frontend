import { requestCuratedContent, requireCuratedClient, saveCuratedContent } from "./curatedContentClient.js";

export async function listRecommendations(client, publishedOnly = true) {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => {
    let query = client.from("product_recommendations").select("product_id,sort_order,headline,is_enabled,updated_at").order("sort_order").order("product_id");
    if (publishedOnly) query = query.eq("is_enabled", true);
    return query.abortSignal(signal);
  });
}

export function saveRecommendation(client, row) {
  const { product_id, headline, sort_order, is_enabled, updated_at } = row;
  return saveCuratedContent(client, "product_recommendations", "product_id", {
    product_id, headline: headline.trim(), sort_order: Number(sort_order), is_enabled,
  }, updated_at);
}
