// Node 일괄 변환 전용. 서비스 키를 브라우저 코드에 전달하지 않는다.
import { createClient } from "@supabase/supabase-js";
import { storageRequest, fetchWithStorageTimeout } from "./productImageStorage.js";

export function createImageMaintenanceClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithStorageTimeout },
  });
}

export async function listStoredImages(client, bucket, prefix = "") {
  const files = [];
  const folders = [prefix];
  while (folders.length) {
    const folder = folders.shift();
    for (let offset = 0; ; offset += 1000) {
      const { data } = await storageRequest(() => client.storage.from(bucket).list(folder, {
        limit: 1000, offset, sortBy: { column: "name", order: "asc" },
      }));
      for (const entry of data) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        if (!entry.id && !entry.metadata) folders.push(path);
        else files.push({ path, size: Number(entry.metadata?.size || 0), contentType: entry.metadata?.mimetype });
      }
      if (data.length < 1000) break;
    }
  }
  return files;
}
