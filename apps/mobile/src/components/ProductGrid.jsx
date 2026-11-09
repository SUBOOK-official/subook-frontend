import { useCallback } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors, space } from "../theme.js";
import { ProductCard } from "./ProductCard.jsx";
import { Feedback, Skeleton } from "./ui.jsx";

const GAP = 12;

export function useGridItemWidth() {
  const { width } = useWindowDimensions();
  // 큰 화면(태블릿·웹 미리보기)에서도 카드가 지나치게 커지지 않게 한다.
  const contentWidth = Math.min(width, 560);
  return Math.floor((contentWidth - space.page * 2 - GAP) / 2);
}

function GridSkeleton({ itemWidth }) {
  return <View style={styles.skeletonRow}>
    {[0, 1, 2, 3].map((key) => <View key={key} style={{ width: itemWidth, gap: 8 }}>
      <Skeleton style={{ width: itemWidth, height: itemWidth }} />
      <Skeleton style={{ width: itemWidth * 0.8, height: 14 }} />
      <Skeleton style={{ width: itemWidth * 0.5, height: 14 }} />
    </View>)}
  </View>;
}

// 2열 교재 목록(무한 스크롤). 머리말(ListHeaderComponent)에 화면별 구역을 넣는다.
export function ProductGrid({ products, loading, error, onEndReached, onRetry, onRefresh, refreshing = false, ListHeaderComponent, emptyTitle = "찾는 교재가 없어요", emptyMessage, contentStyle }) {
  const navigation = useNavigation();
  const itemWidth = useGridItemWidth();
  const openProduct = useCallback((product) => navigation.push("Product", { productId: product.id, title: product.title }), [navigation]);
  const renderItem = useCallback(({ item }) => <ProductCard product={item} width={itemWidth} onPress={openProduct} />, [itemWidth, openProduct]);

  const footer = loading && products.length > 0
    ? <ActivityIndicator style={styles.footer} color={colors.primary} />
    : error && products.length > 0 ? <Feedback icon="wifi-off" message={error} onAction={onRetry} /> : <View style={styles.footer} />;

  const empty = loading ? <GridSkeleton itemWidth={itemWidth} />
    : error ? <Feedback icon="wifi-off" title="교재를 불러오지 못했어요" message={error} onAction={onRetry} />
      : <Feedback icon="search" title={emptyTitle} message={emptyMessage} />;

  return <FlatList
    data={products}
    keyExtractor={(item) => item.id}
    numColumns={2}
    renderItem={renderItem}
    columnWrapperStyle={styles.row}
    contentContainerStyle={[styles.content, contentStyle]}
    ListHeaderComponent={ListHeaderComponent}
    ListEmptyComponent={empty}
    ListFooterComponent={footer}
    onEndReached={onEndReached}
    onEndReachedThreshold={0.6}
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode="on-drag"
    initialNumToRender={8}
    windowSize={9}
    removeClippedSubviews
  />;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  row: { paddingHorizontal: space.page, gap: GAP, marginBottom: 24 },
  footer: { paddingVertical: 24 },
  skeletonRow: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingHorizontal: space.page, rowGap: 24 },
});
