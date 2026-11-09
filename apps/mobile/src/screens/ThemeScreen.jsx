import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ProductGrid } from "../components/ProductGrid.jsx";
import { ScreenHeader, Txt } from "../components/ui.jsx";
import { loadThemePage } from "../lib/catalog.js";
import { goToTab } from "../lib/siteLinks.js";
import { colors, space } from "../theme.js";

export default function ThemeScreen({ route, navigation }) {
  const themeId = String(route.params?.themeId ?? "");
  const [state, setState] = useState({ theme: null, products: [], total: 0, loading: true, error: null });
  const busy = useRef(false);

  const load = useCallback(async (reset) => {
    if (busy.current) return;
    busy.current = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const offset = reset ? 0 : state.products.length;
      const page = await loadThemePage(themeId, offset);
      setState((current) => {
        const products = reset ? page.products : [...new Map([...current.products, ...page.products].map((item) => [item.id, item])).values()];
        return { theme: page.theme ?? current.theme, products, total: page.total, loading: false, error: null };
      });
    } catch {
      setState((current) => ({ ...current, loading: false, error: "교재를 불러오지 못했어요." }));
    } finally {
      busy.current = false;
    }
  }, [themeId, state.products.length]);

  useEffect(() => {
    void load(true);
    // 테마가 바뀔 때만 처음부터 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId]);

  const title = state.theme?.title || route.params?.title || "테마";
  const description = typeof state.theme?.description === "string" ? state.theme.description.trim() : "";

  return <View style={styles.screen}>
    <ScreenHeader title={title} onBack={() => (navigation.canGoBack() ? navigation.goBack() : goToTab(navigation, "Home"))} />
    <ProductGrid products={state.products} loading={state.loading} error={state.error}
      onRetry={() => load(state.products.length === 0)} onRefresh={() => load(true)} refreshing={state.loading && state.products.length > 0}
      onEndReached={() => state.products.length < state.total && load(false)}
      ListHeaderComponent={<View style={styles.intro}>
        {description ? <Txt style={styles.description}>{description}</Txt> : null}
        {state.total > 0 ? <Txt style={styles.count}>{state.total.toLocaleString("ko-KR")}권</Txt> : null}
      </View>}
      emptyTitle="아직 준비 중인 테마예요" />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  intro: { paddingHorizontal: space.page, paddingTop: 16, paddingBottom: 14, gap: 8 },
  description: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  count: { fontSize: 13, color: colors.textSecondary },
});
