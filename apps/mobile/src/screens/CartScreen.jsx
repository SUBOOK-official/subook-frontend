import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Feather from "@expo/vector-icons/Feather";
import { toCheckoutItems } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { calculateShippingFee, FREE_SHIPPING_THRESHOLD } from "../../../../packages/shared-domain/src/shipping.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";
import { BookCover, Button, Feedback, ScreenHeader, Txt } from "../components/ui.jsx";
import { LOGIN_SCREEN, useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { tapFeedback } from "../lib/haptics.js";
import { goToTab } from "../lib/siteLinks.js";
import { colors, radius, space } from "../theme.js";
import { showDialog } from "../components/Dialog.jsx";

function Check({ checked, disabled, onPress, label }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={label}
    disabled={disabled} hitSlop={10} onPress={onPress}>
    <Ionicons name={checked ? "checkmark-circle" : "ellipse-outline"} size={24} color={disabled ? colors.border : checked ? colors.primary : colors.muted} />
  </Pressable>;
}

function CartRow({ item, checked, onToggle, onRemove, onOpen }) {
  return <View style={styles.row}>
    <Check checked={checked} disabled={item.isSoldOut} onPress={onToggle} label={`${item.title} 선택`} />
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.rowBody}>
      <BookCover uri={item.coverUrl} title={item.title} dim={item.isSoldOut} style={styles.cover} />
      <View style={styles.rowInfo}>
        <Txt numberOfLines={2} style={styles.rowTitle}>{item.title}</Txt>
        {item.optionLabel ? <Txt numberOfLines={1} style={styles.rowOption}>{item.optionLabel}</Txt> : null}
        {item.isSoldOut ? <Txt bold style={styles.rowSoldOut}>품절</Txt>
          : <Txt bold style={styles.rowPrice}>{item.price === null ? "가격 확인" : formatCurrency(item.price)}</Txt>}
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title} 삭제`} hitSlop={10} onPress={onRemove} style={styles.remove}>
      <Feather name="x" size={18} color={colors.muted} />
    </Pressable>
  </View>;
}

export default function CartScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { cartItems, cartLoading, cartError, refreshCart, removeFromCart } = useShop();
  const [unchecked, setUnchecked] = useState(() => new Set());

  useFocusEffect(useCallback(() => {
    void refreshCart();
  }, [refreshCart]));

  // 사라진 교재는 선택 해제 목록에서도 뺀다.
  useEffect(() => {
    setUnchecked((current) => new Set([...current].filter((id) => cartItems.some((item) => item.id === id))));
  }, [cartItems]);

  const orderable = cartItems.filter((item) => !item.isSoldOut && item.price !== null);
  const selected = orderable.filter((item) => !unchecked.has(item.id));
  const subtotal = selected.reduce((sum, item) => sum + item.price, 0);
  const shipping = selected.length ? calculateShippingFee(subtotal) : 0;
  const allChecked = orderable.length > 0 && selected.length === orderable.length;
  const remainingForFree = useMemo(() => Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal), [subtotal]);

  const toggle = (id) => {
    tapFeedback();
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = (ids) => {
    if (ids.length === 0) return;
    showDialog(ids.length > 1 ? `${ids.length}권을 뺄까요?` : "장바구니에서 뺄까요?", undefined, [
      { text: "취소", style: "cancel" },
      { text: "빼기", style: "destructive", onPress: () => removeFromCart(ids).catch(() => showDialog("빼지 못했어요", "잠시 후 다시 시도해 주세요.")) },
    ]);
  };

  const checkout = () => {
    const items = toCheckoutItems(selected);
    if (items.length === 0) return;
    navigation.navigate("Web", { path: "/app/checkout", title: "주문하기", checkout: { items, guestMode: false } });
  };

  const header = <ScreenHeader title="장바구니" onBack={() => (navigation.canGoBack() ? navigation.goBack() : goToTab(navigation, "Home"))} />;

  if (!isSignedIn) {
    return <View style={styles.screen}>
      {header}
      <Feedback icon="shopping-bag" title="로그인하고 장바구니를 이용해 보세요" actionLabel="로그인" onAction={() => navigation.navigate(LOGIN_SCREEN)} />
    </View>;
  }

  return <View style={styles.screen}>
    {header}
    <FlatList
      data={cartItems}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={cartLoading && cartItems.length > 0} onRefresh={refreshCart} tintColor={colors.primary} colors={[colors.primary]} />}
      ListHeaderComponent={cartItems.length > 0 ? <View style={styles.toolbar}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allChecked }} onPress={() => setUnchecked(allChecked ? new Set(orderable.map((item) => item.id)) : new Set())} style={styles.toolbarLeft}>
          <Ionicons name={allChecked ? "checkmark-circle" : "ellipse-outline"} size={24} color={allChecked ? colors.primary : colors.muted} />
          <Txt style={styles.toolbarText}>전체 선택 ({selected.length}/{orderable.length})</Txt>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => remove(selected.map((item) => item.id))}>
          <Txt style={styles.toolbarText}>선택 삭제</Txt>
        </Pressable>
      </View> : null}
      renderItem={({ item }) => <CartRow item={item} checked={!item.isSoldOut && !unchecked.has(item.id)}
        onToggle={() => toggle(item.id)} onRemove={() => remove([item.id])}
        onOpen={() => item.productId && navigation.push("Product", { productId: item.productId, title: item.title })} />}
      ListEmptyComponent={cartLoading ? <Feedback loading />
        : cartError ? <Feedback icon="wifi-off" title={cartError} onAction={refreshCart} />
          : <Feedback icon="shopping-bag" title="장바구니가 비어 있어요" actionLabel="교재 둘러보기" onAction={() => goToTab(navigation, "Home")} />}
      ListFooterComponent={selected.length > 0 ? <View style={styles.summary}>
        <View style={styles.summaryRow}><Txt style={styles.summaryLabel}>상품 금액</Txt><Txt style={styles.summaryValue}>{formatCurrency(subtotal)}</Txt></View>
        <View style={styles.summaryRow}><Txt style={styles.summaryLabel}>배송비</Txt><Txt style={styles.summaryValue}>{shipping ? formatCurrency(shipping) : "무료"}</Txt></View>
        {remainingForFree > 0 && <Txt style={styles.freeHint}>{formatCurrency(remainingForFree)} 더 담으면 무료 배송</Txt>}
        <View style={[styles.summaryRow, styles.summaryTotal]}><Txt bold style={styles.totalLabel}>결제 예정 금액</Txt><Txt bold style={styles.totalValue}>{formatCurrency(subtotal + shipping)}</Txt></View>
      </View> : null}
    />
    {cartItems.length > 0 && <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Button disabled={selected.length === 0} onPress={checkout}>
        {selected.length ? `${selected.length}권 주문하기 · ${formatCurrency(subtotal + shipping)}` : "주문할 교재를 골라 주세요"}
      </Button>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.page, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  toolbarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolbarText: { fontSize: 14, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: space.page, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowBody: { flex: 1, flexDirection: "row", gap: 12 },
  cover: { width: 76, height: 76 },
  rowInfo: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 14, lineHeight: 20 },
  rowOption: { fontSize: 13, color: colors.muted },
  rowPrice: { fontSize: 15, marginTop: 4 },
  rowSoldOut: { fontSize: 14, marginTop: 4, color: colors.danger },
  remove: { paddingTop: 2 },
  summary: { margin: space.page, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, gap: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 14 },
  freeHint: { fontSize: 12, color: colors.primary },
  summaryTotal: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  totalLabel: { fontSize: 15 },
  totalValue: { fontSize: 18 },
  bottom: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
});
