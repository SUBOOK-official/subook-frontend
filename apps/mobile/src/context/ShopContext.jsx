import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  addBooksToCart,
  fetchCartItems,
  fetchWishlistIds,
  removeCartItems,
  setWishlisted,
} from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import { normalizeMobileCartItem } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "./AuthContext.jsx";

const ShopContext = createContext(null);

// 장바구니·찜(회원 전용, 웹과 같은 테이블·RPC)
export function ShopProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [cart, setCart] = useState({ items: [], loading: false, error: null });
  const [wishlistIds, setWishlistIds] = useState(() => new Set());
  const pendingWishes = useRef(new Set());

  const refreshCart = useCallback(async () => {
    if (!supabase || !userId) {
      setCart({ items: [], loading: false, error: null });
      return [];
    }
    setCart((current) => ({ ...current, loading: true, error: null }));
    try {
      const items = (await fetchCartItems(supabase)).map(normalizeMobileCartItem).filter(Boolean);
      setCart({ items, loading: false, error: null });
      return items;
    } catch {
      setCart((current) => ({ ...current, loading: false, error: "장바구니를 불러오지 못했어요." }));
      return null;
    }
  }, [userId]);

  const refreshWishlist = useCallback(async () => {
    if (!supabase || !userId) {
      setWishlistIds(new Set());
      return;
    }
    try {
      setWishlistIds(new Set(await fetchWishlistIds(supabase, userId)));
    } catch {
      // 찜 표시는 다음 새로고침 때 다시 맞춘다.
    }
  }, [userId]);

  useEffect(() => {
    void refreshCart();
    void refreshWishlist();
  }, [refreshCart, refreshWishlist]);

  const toggleWishlist = useCallback(async (productId) => {
    const id = String(productId);
    if (!supabase || !userId || pendingWishes.current.has(id)) return null;
    pendingWishes.current.add(id);
    const nextActive = !wishlistIds.has(id);
    const apply = (active) => setWishlistIds((current) => {
      const next = new Set(current);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
    apply(nextActive);
    try {
      await setWishlisted(supabase, userId, id, nextActive);
      return nextActive;
    } catch (error) {
      apply(!nextActive);
      throw error;
    } finally {
      pendingWishes.current.delete(id);
    }
  }, [userId, wishlistIds]);

  const addToCart = useCallback(async (books) => {
    if (!supabase || !userId) throw new Error("로그인하고 담아 주세요.");
    try {
      await addBooksToCart(supabase, books);
    } finally {
      await refreshCart();
    }
  }, [userId, refreshCart]);

  const removeFromCart = useCallback(async (cartItemIds) => {
    if (!supabase || !userId) return;
    try {
      await removeCartItems(supabase, cartItemIds);
    } finally {
      await refreshCart();
    }
  }, [userId, refreshCart]);

  const value = useMemo(() => ({
    cartItems: cart.items,
    cartCount: cart.items.length,
    cartLoading: cart.loading,
    cartError: cart.error,
    refreshCart,
    addToCart,
    removeFromCart,
    wishlistIds,
    toggleWishlist,
    refreshWishlist,
  }), [cart, refreshCart, addToCart, removeFromCart, wishlistIds, toggleWishlist, refreshWishlist]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("ShopProvider가 필요합니다.");
  return value;
}
