import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, logoSource, radius } from "../theme.js";
import { getDetailImageUrl, getThumbnailImageUrl } from "../../../public-web/src/lib/storageImage.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";

// 모든 글자는 LINE Seed KR. 굵기는 글꼴 파일로 고른다(Android 합성 굵기 방지).
export function Txt({ style, bold = false, children, ...props }) {
  const flat = StyleSheet.flatten(style) || {};
  const isBold = bold || ["600", "700", "800", "900", "bold"].includes(String(flat.fontWeight));
  return <Text {...props} style={[styles.text, flat, { fontFamily: isBold ? fonts.bold : fonts.regular, fontWeight: "normal" }]}>{children}</Text>;
}

export function Button({ children, onPress, variant = "primary", icon, disabled = false, loading = false, size = "lg", style, accessibilityLabel }) {
  const secondary = variant === "secondary";
  const ghost = variant === "ghost";
  const tint = secondary || ghost ? colors.primary : colors.surface;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, size === "md" && styles.buttonMd, secondary && styles.secondaryButton, ghost && styles.ghostButton,
      pressed && !secondary && !ghost && { backgroundColor: colors.primaryPressed }, pressed && (secondary || ghost) && { backgroundColor: colors.secondary },
      (disabled || loading) && styles.dimmed, style]}>
    {loading ? <ActivityIndicator color={tint} /> : <>
      {icon && <Feather name={icon} size={18} color={tint} />}
      <Txt bold style={[styles.buttonLabel, size === "md" && styles.buttonLabelMd, { color: tint }]}>{children}</Txt>
    </>}
  </Pressable>;
}

export function IconButton({ name, onPress, label, color = colors.text, size = 22, badge = 0, style, filled = false }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress}
    style={({ pressed }) => [styles.iconButton, filled && styles.iconButtonFilled, pressed && { opacity: 0.55 }, style]}>
    <Feather name={name} size={size} color={color} />
    {badge > 0 && <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
      <Txt bold style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Txt>
    </View>}
  </Pressable>;
}

export function discountRate(product) {
  return product.originalPrice > 0 && product.price !== null && product.originalPrice > product.price
    ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
}

export function Price({ product, size = "md", showOriginal = false }) {
  const rate = discountRate(product);
  const large = size === "lg";
  return <View>
    <View style={styles.priceRow}>
      {rate > 0 && <Txt bold style={[styles.discount, large && styles.priceLarge]}>{rate}%</Txt>}
      <Txt bold style={[styles.price, large && styles.priceLarge, size === "sm" && styles.priceSmall]}>{product.price === null ? "가격 확인" : formatCurrency(product.price)}</Txt>
    </View>
    {showOriginal && rate > 0 && <Txt style={styles.original}>{formatCurrency(product.originalPrice)}</Txt>}
  </View>;
}

export function BookCover({ uri, title, large = false, style, contentFit = "contain", dim = false }) {
  const [failed, setFailed] = useState(false);
  const source = uri && !failed ? (large ? getDetailImageUrl(uri) : getThumbnailImageUrl(uri)) : null;
  return <View style={[styles.cover, style]}>
    {source
      ? <Image source={source} style={[styles.coverImage, dim && styles.dimImage]} contentFit={contentFit} transition={150}
        recyclingKey={source} accessibilityLabel={title ? `${title} 표지` : "교재 표지"} onError={() => setFailed(true)} />
      : <Image source={logoSource} style={styles.fallbackLogo} contentFit="contain" accessibilityLabel="수북" />}
  </View>;
}

export function SectionHeader({ title, actionLabel, onAction, style }) {
  return <View style={[styles.sectionHeader, style]}>
    <Txt bold style={styles.sectionTitle} accessibilityRole="header">{title}</Txt>
    {onAction && <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={styles.sectionAction}>
      <Txt style={styles.sectionActionLabel}>{actionLabel ?? "전체보기"}</Txt>
      <Feather name="chevron-right" size={16} color={colors.muted} />
    </Pressable>}
  </View>;
}

export function Chip({ label, selected, onPress }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && { backgroundColor: colors.card }]}>
    <Txt bold={selected} style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Txt>
  </Pressable>;
}

export function Feedback({ loading, icon = "book-open", title, message, actionLabel, onAction }) {
  return <View style={styles.feedback}>
    {loading ? <ActivityIndicator color={colors.primary} size="large" accessibilityLabel="불러오는 중" />
      : <View style={styles.feedbackIcon}><Feather name={icon} size={26} color={colors.primary} /></View>}
    {!loading && title && <Txt bold style={styles.feedbackTitle}>{title}</Txt>}
    {!loading && message && <Txt style={styles.feedbackMessage}>{message}</Txt>}
    {!loading && onAction && <Button variant="secondary" size="md" onPress={onAction} style={styles.feedbackButton}>{actionLabel ?? "다시 시도"}</Button>}
  </View>;
}

// 불러오는 동안 자리 표시(은은하게 깜빡임)
export function Skeleton({ style }) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, { opacity }, style]} />;
}

// 화면 머리(뒤로·제목·오른쪽 동작). 안전 영역을 직접 계산한다.
export function ScreenHeader({ title, onBack, backIcon = "chevron-left", backLabel = "뒤로", right, large = false }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.screenHeader, { paddingTop: insets.top }]}>
    {onBack ? <View style={styles.screenHeaderSide}>
      <IconButton name={backIcon} label={backLabel} onPress={onBack} size={24} />
    </View> : null}
    <Txt bold numberOfLines={1} accessibilityRole="header" style={[styles.screenHeaderTitle, large && styles.screenHeaderLarge, !onBack && styles.screenHeaderLeft]}>{title}</Txt>
    <View style={[styles.screenHeaderSide, styles.screenHeaderRight]}>{right}</View>
  </View>;
}

export function Divider({ thick = false }) {
  return <View style={thick ? styles.thickDivider : styles.divider} />;
}

const styles = StyleSheet.create({
  text: { color: colors.text },
  button: { minHeight: 52, paddingHorizontal: 20, borderRadius: radius.lg, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonMd: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.md },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghostButton: { backgroundColor: "transparent" },
  buttonLabel: { fontSize: 16 },
  buttonLabelMd: { fontSize: 14 },
  dimmed: { opacity: 0.45 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  iconButtonFilled: { backgroundColor: "rgba(255,255,255,0.94)", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  badge: { position: "absolute", top: 2, right: 0, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surface },
  badgeText: { color: colors.surface, fontSize: 10, lineHeight: 13 },
  priceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 5 },
  price: { fontSize: 16, color: colors.text },
  priceSmall: { fontSize: 15 },
  discount: { fontSize: 16, color: colors.accent },
  priceLarge: { fontSize: 24, letterSpacing: -0.4 },
  original: { marginTop: 4, color: colors.muted, fontSize: 13, textDecorationLine: "line-through" },
  cover: { backgroundColor: colors.card, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  coverImage: { width: "100%", height: "100%" },
  dimImage: { opacity: 0.35 },
  fallbackLogo: { width: "56%", height: 30, opacity: 0.3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 19, letterSpacing: -0.4, color: colors.text },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionActionLabel: { fontSize: 13, color: colors.muted },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.textSecondary },
  chipTextSelected: { color: colors.surface },
  feedback: { paddingHorizontal: 32, paddingVertical: 56, alignItems: "center", gap: 12 },
  feedbackIcon: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  feedbackTitle: { fontSize: 17, textAlign: "center" },
  feedbackMessage: { fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: "center" },
  feedbackButton: { marginTop: 8, minWidth: 140 },
  skeleton: { backgroundColor: colors.card, borderRadius: radius.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  screenHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  screenHeaderSide: { minWidth: 48, height: 52, flexDirection: "row", alignItems: "center" },
  screenHeaderRight: { justifyContent: "flex-end" },
  screenHeaderTitle: { flex: 1, fontSize: 17, textAlign: "center" },
  screenHeaderLarge: { fontSize: 20, letterSpacing: -0.4 },
  screenHeaderLeft: { textAlign: "left", paddingLeft: 12 },
  thickDivider: { height: 8, backgroundColor: colors.divider },
});
