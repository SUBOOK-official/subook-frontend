const defaultSellerLookupOrigin = "https://seller.subook.kr";

export function getSellerLookupOrigin() {
  return String(import.meta.env.VITE_SELLER_LOOKUP_ORIGIN || defaultSellerLookupOrigin).replace(
    /\/$/,
    "",
  );
}
