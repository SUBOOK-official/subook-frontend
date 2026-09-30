import { requestCuratedContent, requireCuratedClient, saveCuratedContent } from "./curatedContentClient.js";

const tableFor = (placement) => placement === "hero" ? "product_hero_banners" : "product_recommendations";

export async function listRecommendations(client, publishedOnly = true, placement = "recommended") {
  requireCuratedClient(client);
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await requestCuratedContent((signal) => {
      let query = client.from(tableFor(placement)).select("product_id,sort_order,headline,is_enabled,updated_at").order("sort_order").order("product_id");
      if (publishedOnly) query = query.eq("is_enabled", true);
      return query.range(offset, offset + 499).abortSignal(signal);
    });
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export function saveRecommendation(client, row, placement = "recommended") {
  const { product_id, headline, sort_order, is_enabled, updated_at } = row;
  return saveCuratedContent(client, tableFor(placement), "product_id", {
    product_id, headline: headline.trim(), sort_order: Number(sort_order), is_enabled,
  }, updated_at);
}

// 여러 교재를 한 요청으로 저장해 일부만 등록되는 상황을 피한다.
export function addRecommendations(client, rows, placement = "recommended") {
  requireCuratedClient(client);
  return requestCuratedContent((signal) => client.from(tableFor(placement)).insert(rows).select().abortSignal(signal), { attempts: 1 });
}
