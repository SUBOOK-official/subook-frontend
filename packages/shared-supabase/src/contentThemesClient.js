export async function listContentThemes(client, publishedOnly = true) {
  if (!client) return [];
  let query = client.from("content_themes").select("id,title,image_url,product_ids,is_enabled,sort_order").order("sort_order").order("id");
  if (publishedOnly) query = query.eq("is_enabled", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
