import { createPublicCatalogClient } from "../../../../packages/shared-supabase/src/publicCatalogClient.js";

export const catalogClient = createPublicCatalogClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  publicKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
