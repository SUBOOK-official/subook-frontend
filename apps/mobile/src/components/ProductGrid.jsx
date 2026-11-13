import { useCallback } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors, space } from "../theme.js";
import { ProductCard } from "./ProductCard.jsx";
import { Feedback, Skeleton } from "./ui.jsx";

const GAP = 12;

// 화면 너비에 따라 열 수를 정한다(폰 2열, 폴더블·작은 태블릿 3열, 큰 태블릿 4열).
export function useGridLayout() {
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const itemWidth = Math.floor((width - space.page * 2 - GAP * (columns - 1)) / columns);
  return { columns, itemWidth };
}

function GridSkeleton({ itemWidth, columns }) {
  return <View style={styles.skeletonRow}>
    {Array.from({ length: columns * 2 }, (_, key) => <View key={key} style={{ width: itemWidth, gap: 8 }}>
      <Skeleton style={{ width: itemWidth, height: itemWidth }} />
      <Skeleton style={{ width: itemWidth * 0.8, height: 14 }} />
      <Skeleton style={{ width: itemWidth * 0.5, height: 14 }} />
    </View>)}
  </View>;
}

// 2열 교재 목록(무한 스크롤). 머리말(ListHeaderComponent)에 화면별 구역을 넣는다.
export function ProductGrid({ products, loading, error, onEndReached, onRetry, onRefresh, refreshing = false, ListHeaderComponent, emptyTitle = "찾는 교재가 없어요", emptyMessage, contentStyle }) {
  const navigation = useNavigation();
  const { columns, itemWidth } = useGridLayout();
  const openProduct = useCallback((product) => navigation.push("Product", { productId: product.id, title: product.title }), [navigation]);
  const renderItem = useCallback(({ item }) => <ProductCard product={item} width={itemWidth} onPress={openProduct} />, [itemWidth, openProduct]);

  const footer = loading && products.length > 0
    ? <ActivityIndicator style={styles.footer} color={colors.primary} />
    : error && products.length > 0 ? <Feedback icon="wifi-off" message={error} onAction={onRetry} /> : <View style={styles.footer} />;

  const empty = loading ? <GridSkeleton itemWidth={itemWidth} columns={columns} />
    : error ? <Feedback icon="wifi-off" title="교재를 불러오지 못했어요" message={error} onAction={onRetry} />
      : <Feedback icon="search" title={emptyTitle} message={emptyMessage} />;

  return <FlatList
    data={products}
    keyExtractor={(item) => item.id}
    // 열 수가 바뀌면(화면 회전·폴더블 펼침) 목록을 새로 만든다.
    key={columns}
    numColumns={columns}
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
