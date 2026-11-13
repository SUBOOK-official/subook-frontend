import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { normalizeMobileProduct } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { fetchWishlistProducts } from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import { ProductGrid } from "../components/ProductGrid.jsx";
import { Feedback, ScreenHeader } from "../components/ui.jsx";
import { LOGIN_SCREEN, useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { supabase } from "../lib/supabase.js";
import { colors } from "../theme.js";

export default function WishlistScreen({ navigation }) {
  const { isSignedIn } = useAuth();
  const { wishlistIds, refreshWishlist } = useShop();
  const [state, setState] = useState({ products: [], loading: true, error: null });

  const load = useCallback(async () => {
    if (!supabase || !isSignedIn) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const rows = await fetchWishlistProducts(supabase);
      setState({ products: rows.map(normalizeMobileProduct).filter(Boolean), loading: false, error: null });
    } catch {
      setState((current) => ({ ...current, loading: false, error: "찜한 교재를 불러오지 못했어요." }));
    }
  }, [isSignedIn]);

  useFocusEffect(useCallback(() => {
    void load();
    void refreshWishlist();
  }, [load, refreshWishlist]));

  const header = <ScreenHeader title="찜" large />;
  if (!isSignedIn) {
    return <View style={styles.screen}>
      {header}
      <Feedback icon="heart" title="로그인하고 찜한 교재를 모아 보세요" actionLabel="로그인" onAction={() => navigation.navigate(LOGIN_SCREEN)} />
    </View>;
  }

  // 방금 찜을 푼 교재는 목록에서 바로 뺀다.
  const products = state.products.filter((product) => wishlistIds.has(product.id));
  return <View style={styles.screen}>
    {header}
    <ProductGrid products={products} loading={state.loading} error={state.error} onRetry={load}
      onRefresh={load} refreshing={state.loading && products.length > 0}
      contentStyle={styles.content} emptyTitle="찜한 교재가 없어요" emptyMessage="마음에 드는 교재의 하트를 눌러 보세요." />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingTop: 16 },
});
