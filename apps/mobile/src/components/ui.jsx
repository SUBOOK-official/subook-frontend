import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { colors, logoSource } from "../theme.js";
import { getThumbnailImageUrl, getDetailImageUrl } from "../../../public-web/src/lib/storageImage.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";

export function Button({ children, onPress, secondary = false, icon, disabled = false }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, (pressed || disabled) && styles.dimmed]}>
    <Text style={[styles.buttonLabel, secondary && styles.secondaryLabel]}>{children}</Text>
    {icon && <Feather name={icon} size={18} color={secondary ? colors.primary : colors.surface} />}
  </Pressable>;
}

export function BookCover({ product, large = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const url = product.coverUrl && (large ? getDetailImageUrl(product.coverUrl) : getThumbnailImageUrl(product.coverUrl));
  return <View style={[styles.cover, large && styles.largeCover]}>
    {url && failedUrl !== url
      ? <Image source={{ uri: url }} style={styles.coverImage} resizeMode="contain" accessibilityLabel={`${product.title} 표지`} onError={() => setFailedUrl(url)} />
      : <Image source={logoSource} style={styles.fallbackLogo} resizeMode="contain" accessibilityLabel="수북" />}
  </View>;
}

export function Price({ product, large = false }) {
  const discount = product.originalPrice > product.price && product.price !== null
    ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  return <View style={styles.priceRow}>
    {discount > 0 && <Text style={[styles.discount, large && styles.largePrice]}>{discount}%</Text>}
    <Text style={[styles.price, large && styles.largePrice]}>{product.price === null ? "가격 확인" : formatCurrency(product.price)}</Text>
  </View>;
}

export function Feedback({ loading, title, message, onRetry }) {
  return <View style={styles.feedback}>
    {loading ? <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="교재 불러오는 중" />
      : <Feather name="book-open" size={28} color={colors.primary} />}
    <Text style={styles.feedbackTitle}>{loading ? "교재를 불러오고 있어요" : title}</Text>
    {message && <Text style={styles.message}>{message}</Text>}
    {onRetry && <Button secondary onPress={onRetry}>다시 시도</Button>}
  </View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 50, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonLabel: { color: colors.surface, fontSize: 15, fontWeight: "700" },
  secondaryLabel: { color: colors.primary },
  dimmed: { opacity: 0.6 },
  cover: { backgroundColor: colors.background, aspectRatio: 0.88, borderRadius: 12, padding: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  largeCover: { aspectRatio: 1.1, borderRadius: 0, padding: 28 },
  coverImage: { height: "100%", width: "100%" },
  fallbackLogo: { width: "65%", height: 35, opacity: 0.35 },
  priceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 6, rowGap: 2 },
  price: { color: colors.text, fontWeight: "800", fontSize: 16 },
  discount: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  largePrice: { fontSize: 25 },
  feedback: { paddingHorizontal: 24, paddingVertical: 48, alignItems: "center", gap: 16 },
  feedbackTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
  message: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
});
