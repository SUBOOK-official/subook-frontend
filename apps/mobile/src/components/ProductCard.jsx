import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRequireLogin } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { tapFeedback } from "../lib/haptics.js";
import { colors, radius } from "../theme.js";
import { BookCover, Price, Txt } from "./ui.jsx";
import { showDialog } from "./Dialog.jsx";

// 찜 버튼(회원 전용). 비회원은 로그인 안내를 띄운다.
export function WishButton({ productId, size = 22, style, inactiveColor = colors.muted }) {
  const navigation = useNavigation();
  const requireLogin = useRequireLogin(navigation);
  const { wishlistIds, toggleWishlist } = useShop();
  const active = wishlistIds.has(String(productId));
  const onPress = useCallback(async () => {
    if (!requireLogin("로그인하고 마음에 드는 교재를 찜해 보세요.")) return;
    tapFeedback();
    try {
      await toggleWishlist(productId);
    } catch {
      showDialog("찜하지 못했어요", "잠시 후 다시 시도해 주세요.");
    }
  }, [productId, requireLogin, toggleWishlist]);
  return <Pressable accessibilityRole="button" accessibilityLabel={active ? "찜 취소" : "찜하기"} accessibilityState={{ selected: active }}
    hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.wish, pressed && { opacity: 0.6 }, style]}>
    <Ionicons name={active ? "heart" : "heart-outline"} size={size} color={active ? colors.accent : inactiveColor} />
  </Pressable>;
}

// 교재 카드(29CM 목록형: 표지·할인율·판매가 중심, 등급·테두리 없음)
function ProductCardBase({ product, width, rank, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${product.title}${product.isSoldOut ? ", 품절" : ""}`}
    onPress={() => onPress(product)} style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
    <View>
      <BookCover uri={product.coverUrl} title={product.title} style={{ width, height: width }} dim={product.isSoldOut} />
      {rank ? <View style={styles.rank}><Txt bold style={styles.rankText}>{rank}</Txt></View> : null}
      {product.isSoldOut ? <View style={styles.soldOut}><Txt bold style={styles.soldOutText}>품절</Txt></View> : null}
      <WishButton productId={product.id} size={21} style={styles.coverWish} />
    </View>
    <View style={styles.info}>
      {product.brand ? <Txt numberOfLines={1} style={styles.brand}>{product.brand}</Txt> : null}
      <Txt numberOfLines={2} style={styles.title}>{product.title}</Txt>
      <View style={styles.price}><Price product={product} size="sm" /></View>
    </View>
  </Pressable>;
}

export const ProductCard = memo(ProductCardBase);

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  wish: { alignItems: "center", justifyContent: "center" },
  coverWish: { position: "absolute", right: 6, bottom: 6, width: 32, height: 32 },
  rank: { position: "absolute", top: 0, left: 0, minWidth: 24, height: 24, paddingHorizontal: 6, borderTopLeftRadius: radius.md, borderBottomRightRadius: radius.sm, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  rankText: { color: colors.surface, fontSize: 12, lineHeight: 16 },
  soldOut: { position: "absolute", left: 8, bottom: 10, paddingHorizontal: 8, height: 22, borderRadius: radius.xs, backgroundColor: "rgba(35,35,35,0.78)", justifyContent: "center" },
  soldOutText: { color: colors.surface, fontSize: 11, lineHeight: 15 },
  info: { paddingTop: 10, paddingRight: 2, gap: 3 },
  brand: { fontSize: 12, color: colors.muted },
  title: { fontSize: 14, lineHeight: 20, color: colors.text },
  price: { marginTop: 3 },
});
