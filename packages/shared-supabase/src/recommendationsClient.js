export async function listRecommendations(client, publishedOnly = true) {
  if (!client) return [];
  let query = client.from("product_recommendations").select("product_id,sort_order,headline,is_enabled").order("sort_order").order("product_id");
  if (publishedOnly) query = query.eq("is_enabled", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
