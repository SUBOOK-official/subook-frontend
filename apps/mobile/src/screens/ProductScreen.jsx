import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Share, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { getProductWebUrl, normalizeMobileProduct, toCheckoutItems } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../../../../packages/shared-domain/src/shipping.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";
import { fetchProductSummary, isSubscribedRestock, setRestockSubscription } from "../../../../packages/shared-supabase/src/mobileAppClient.js";
import {
  allocateSelectedBooks,
  buildOrderItemsFromBooks,
  getLineTotalForGroup,
  groupOptionsByVariant,
  sumAllocatedBookPrices,
} from "../../../public-web/src/lib/productOptionGroups.js";
import { findFeaturedProductEntry, getFeaturedDetailKey, isLowStockCount, isPreReleaseProduct, resolveFeaturedCoverUrl } from "../../../public-web/src/lib/publicFeaturedProducts.js";
import { FeaturedDetailImages, hasFeaturedDetailImages } from "../components/FeaturedDetailImages.jsx";
import { ReviewsSection } from "../components/ReviewsSection.jsx";
import { WishButton } from "../components/ProductCard.jsx";
import { BookCover, Button, Divider, Feedback, IconButton, Price, Txt } from "../components/ui.jsx";
import { LOGIN_WEB_ROUTE, useAuth, useRequireLogin } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { catalogClient } from "../lib/catalog.js";
import { errorFeedback, successFeedback, tapFeedback } from "../lib/haptics.js";
import { goToTab, openSiteLink } from "../lib/siteLinks.js";
import { supabase } from "../lib/supabase.js";
import { colors, radius, shadow, space } from "../theme.js";
import { showDialog, showToast } from "../components/Dialog.jsx";

function optionLabel(group, product) {
  if (group.key === "") return product.title;
  return /^\d+$/.test(group.label) ? `옵션 ${group.label}` : group.label;
}

// **강조**만 굵게, 나머지는 일반 글자(웹 AI 요약과 같은 규칙)
function Emphasis({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return <Txt style={styles.summaryText}>
    {parts.map((part, index) => (/^\*\*[^*]+\*\*$/.test(part)
      ? <Txt key={index} bold style={styles.summaryText}>{part.slice(2, -2)}</Txt>
      : part.replace(/[#`>]/g, "")))}
  </Txt>;
}

function Gallery({ images, title, dim }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = images.length ? images : [null];
  return <View>
    <FlatList data={list} keyExtractor={(item, itemIndex) => `${itemIndex}-${item}`} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
      renderItem={({ item }) => <BookCover uri={item} title={title} large dim={dim} style={{ width, height: Math.min(width, 520), borderRadius: 0 }} />}
      onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))} />
    {list.length > 1 && <View style={styles.counter}><Txt style={styles.counterText}>{index + 1} / {list.length}</Txt></View>}
  </View>;
}

function SelectedRow({ group, label, quantity, removable, stockLabel, onChange, onRemove }) {
  const atMax = quantity >= group.availableCount;
  return <View style={styles.selected}>
    <View style={styles.selectedHead}>
      <Txt numberOfLines={2} style={styles.selectedLabel}>{label}{stockLabel ? <Txt style={styles.stock}>  {stockLabel}</Txt> : null}</Txt>
      {removable && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 선택 취소`} hitSlop={10} onPress={onRemove}>
        <Feather name="x" size={16} color={colors.muted} />
      </Pressable>}
    </View>
    <View style={styles.selectedControls}>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} 수량 줄이기`} disabled={quantity <= 1} hitSlop={6}
          onPress={() => onChange(-1)} style={[styles.stepperButton, quantity <= 1 && styles.disabled]}>
          <Feather name="minus" size={14} color={colors.text} />
        </Pressable>
        <Txt bold style={styles.stepperValue} accessibilityLabel={`${quantity}권`}>{quantity}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} 수량 늘리기`} disabled={atMax} hitSlop={6}
          onPress={() => onChange(1)} style={[styles.stepperButton, atMax && styles.disabled]}>
          <Feather name="plus" size={14} color={colors.text} />
        </Pressable>
      </View>
      <Txt bold style={styles.lineTotal}>{formatCurrency(getLineTotalForGroup(group, quantity))}</Txt>
    </View>
  </View>;
}

export default function ProductScreen({ route, navigation }) {
  const productId = String(route.params?.productId ?? "");
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const requireLogin = useRequireLogin(navigation);
  const { addToCart, cartCount } = useShop();
  const [state, setState] = useState({ product: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState("");
  const [selections, setSelections] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [restockOn, setRestockOn] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    (async () => {
      try {
        if (!catalogClient) throw new Error("교재 서비스 연결을 준비하고 있어요.");
        const rows = await catalogClient.detail(productId, controller.signal);
        const product = normalizeMobileProduct(rows[0]);
        if (!product) throw new Error("판매가 끝났거나 찾을 수 없는 교재예요.");
        setState({ product, loading: false, error: null });
        navigation.setOptions({ title: product.title });
      } catch (error) {
        if (!controller.signal.aborted) setState({ product: null, loading: false, error: error.message });
      }
    })();
    if (supabase) void fetchProductSummary(supabase, productId).then(setSummary).catch(() => {});
    return () => controller.abort();
  }, [productId, revision, navigation]);

  const product = state.product;
  const groups = useMemo(() => groupOptionsByVariant(product?.optionBooks ?? []), [product]);
  const featured = useMemo(() => (product ? findFeaturedProductEntry(product) : null), [product]);
  const preRelease = product ? isPreReleaseProduct(product) : false;
  const hasStock = groups.some((group) => !group.soldOut);
  const canPurchase = Boolean(product) && hasStock && !preRelease;
  const isSingle = groups.length === 1;

  // 회차가 하나뿐이면 바로 담을 수 있게 미리 고른다. 사라진 회차는 선택에서 뺀다.
  useEffect(() => {
    setSelections((current) => {
      const kept = current
        .map((selection) => {
          const group = groups.find((item) => item.key === selection.key);
          return group && !group.soldOut ? { ...selection, quantity: Math.min(selection.quantity, group.availableCount) } : null;
        })
        .filter(Boolean);
      if (kept.length === 0 && groups.length === 1 && !groups[0].soldOut) return [{ key: groups[0].key, quantity: 1 }];
      return kept;
    });
  }, [groups]);

  useEffect(() => {
    if (!supabase || !isSignedIn || !product || hasStock || preRelease) return;
    void isSubscribedRestock(supabase, product.id).then(setRestockOn).catch(() => {});
  }, [isSignedIn, product, hasStock, preRelease]);

  const books = useMemo(() => allocateSelectedBooks(groups, selections), [groups, selections]);
  const subtotal = sumAllocatedBookPrices(books);

  const selectGroup = (group) => {
    if (group.soldOut) return;
    tapFeedback();
    setSelections((current) => {
      const existing = current.find((item) => item.key === group.key);
      if (existing) return current.map((item) => (item.key === group.key ? { ...item, quantity: Math.min(item.quantity + 1, group.availableCount) } : item));
      return [...current, { key: group.key, quantity: 1 }];
    });
    setMenuOpen(false);
  };

  const changeQuantity = (key, delta) => {
    const group = groups.find((item) => item.key === key);
    if (!group) return;
    setSelections((current) => current.map((item) => (item.key === key
      ? { ...item, quantity: Math.max(1, Math.min(item.quantity + delta, group.availableCount)) } : item)));
  };

  const needSelection = () => {
    if (books.length > 0) return false;
    setMenuOpen(true);
    return true;
  };

  const handleAddToCart = async () => {
    if (needSelection() || !requireLogin("로그인하고 장바구니에 담아 보세요.")) return;
    setBusy("cart");
    try {
      await addToCart(books.map((book) => ({ bookId: book.id, productId: product.id })));
      successFeedback();
      showDialog("장바구니에 담았어요", undefined, [
        { text: "계속 둘러보기", style: "cancel" },
        { text: "장바구니 보기", onPress: () => navigation.navigate("Cart", undefined, { pop: true }) },
      ]);
    } catch (error) {
      errorFeedback();
      showDialog("담지 못했어요", error?.message || "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const handleBuyNow = () => {
    if (needSelection()) return;
    const items = toCheckoutItems(buildOrderItemsFromBooks({ productId: product.id, title: product.title, coverImageUrl: product.coverUrl, originalPrice: product.originalPrice }, books));
    const checkout = (guestMode) => navigation.navigate("Web", { path: "/app/checkout", title: "주문하기", checkout: { items, guestMode } });
    if (isSignedIn) {
      checkout(false);
      return;
    }
    showDialog("어떻게 구매할까요?", "회원은 쿠폰·포인트를 쓸 수 있어요.", [
      { text: "취소", style: "cancel" },
      { text: "비회원 구매", onPress: () => checkout(true) },
      { text: "로그인", onPress: () => navigation.navigate("Web", { ...LOGIN_WEB_ROUTE, path: "/app/login?next=/app/checkout", checkout: { items, guestMode: false } }) },
    ]);
  };

  const handleRestock = async () => {
    if (!requireLogin("로그인하고 재입고 알림을 받아 보세요.")) return;
    setBusy("restock");
    try {
      await setRestockSubscription(supabase, product.id, !restockOn);
      setRestockOn(!restockOn);
      successFeedback();
      showToast(restockOn ? "재입고 알림을 해제했어요." : "재입고되면 알림을 보내드릴게요.");
    } catch {
      errorFeedback();
      showDialog("처리하지 못했어요", "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const share = useCallback(() => {
    if (!product) return;
    const url = getProductWebUrl(product.id);
    void Share.share({ message: `${product.title}\n${url}`, url, title: product.title }).catch(() => {});
  }, [product]);

  const topBar = <View style={[styles.topBar, { top: insets.top + 4 }]} pointerEvents="box-none">
    <IconButton name="chevron-left" label="뒤로" filled onPress={() => (navigation.canGoBack() ? navigation.goBack() : goToTab(navigation, "Home"))} />
    <View style={styles.topActions}>
      {product && <IconButton name="share" label="공유하기" filled size={20} onPress={share} />}
      <IconButton name="shopping-bag" label="장바구니" filled size={20} badge={cartCount} onPress={() => navigation.navigate("Cart", undefined, { pop: true })} />
    </View>
  </View>;

  if (!product) {
    return <View style={[styles.screen, { paddingTop: insets.top + 56 }]}>
      {topBar}
      <Feedback loading={state.loading} icon="alert-circle" title="교재를 열지 못했어요" message={state.error}
        onAction={() => setRevision((value) => value + 1)} />
    </View>;
  }

  const coverUrl = resolveFeaturedCoverUrl(product, product.coverUrl);
  // 콜라보 상품은 AI 요약 대신 전용 상세 이미지를 보여 준다(웹과 같은 규칙).
  const featuredDetailKey = featured ? getFeaturedDetailKey(featured) : null;
  const showFeaturedDetail = hasFeaturedDetailImages(featuredDetailKey);
  const images = [coverUrl, ...product.detailImages].filter(Boolean);
  const meta = [product.instructor, product.year ? `${product.year}` : "", product.bookType].filter(Boolean).join(" · ");
  const paragraphs = summary.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const stockLabel = (group) => (featured?.hideStockCount === true
    ? (isLowStockCount(group.availableCount) ? "품절임박" : "")
    : `${group.availableCount}개 남음`);
  const shippingFee = books.length > 0 && subtotal >= FREE_SHIPPING_THRESHOLD ? "무료" : formatCurrency(SHIPPING_FEE);
  const showDropdown = canPurchase && !isSingle;

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Gallery images={images} title={product.title} dim={!hasStock && !preRelease} />
      <View style={styles.info}>
        <Txt style={styles.brand}>{[product.brand, product.subject].filter(Boolean).join(" · ")}</Txt>
        <Txt bold style={styles.title} accessibilityRole="header">{product.title}</Txt>
        {meta ? <Txt style={styles.meta}>{meta}</Txt> : null}
        <View style={styles.priceBlock}>
          {preRelease ? <Txt bold style={styles.upcoming}>판매 시작 전이에요</Txt> : <Price product={product} size="lg" showOriginal />}
          {!hasStock && !preRelease && <Txt bold style={styles.soldOut}>품절</Txt>}
        </View>
      </View>
      {!preRelease && <View style={styles.shipping}>
        <Feather name="truck" size={16} color={colors.textSecondary} />
        <Txt style={styles.shippingText}>배송비 {formatCurrency(SHIPPING_FEE)} · {formatCurrency(FREE_SHIPPING_THRESHOLD)} 이상 구매 시 무료 배송</Txt>
      </View>}
      <Divider thick />
      {showFeaturedDetail && <FeaturedDetailImages detailKey={featuredDetailKey} title={product.title} />}
      {!showFeaturedDetail && paragraphs.length > 0 && <View style={styles.section}>
        <View style={styles.summaryHeader}>
          <Feather name="zap" size={16} color={colors.primary} />
          <Txt bold style={styles.sectionTitle}>AI 요약</Txt>
        </View>
        {paragraphs.map((paragraph, index) => <Emphasis key={index} text={paragraph} />)}
        <Txt style={styles.caption}>AI가 검색 결과를 바탕으로 생성한 소개예요. 실제 구성과 다를 수 있어요.</Txt>
      </View>}
      <View style={styles.section}>
        <Txt bold style={styles.sectionTitle}>배송 안내</Txt>
        {["택배사: CJ대한통운", "결제 확인 후 영업일 기준 1~2일 이내 출고",
          `배송비: 국내 일반 지역 ${formatCurrency(SHIPPING_FEE)} (${formatCurrency(FREE_SHIPPING_THRESHOLD)} 이상 구매 시 무료 배송)`,
          "제주·도서 산간 지역 추가 5,000원"].map((line) => <Txt key={line} style={styles.bullet}>{line}</Txt>)}
        <Pressable accessibilityRole="link" onPress={() => navigation.navigate("Web", { path: "/refund", title: "교환·반품 정책" })} style={styles.policyLink}>
          <Txt style={styles.policyText}>교환·반품 정책 보기</Txt>
          <Feather name="chevron-right" size={14} color={colors.muted} />
        </Pressable>
      </View>
      <ReviewsSection productId={product.id} />
    </ScrollView>
    {topBar}

    {menuOpen && showDropdown && <Pressable accessibilityLabel="옵션 목록 닫기" style={styles.backdrop} onPress={() => setMenuOpen(false)} />}

    <View onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)} style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {showDropdown && <View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen((open) => !open)} style={styles.dropdown}>
          <Txt style={styles.dropdownLabel}>옵션을 선택해 주세요</Txt>
          <Feather name={menuOpen ? "chevron-down" : "chevron-up"} size={18} color={colors.textSecondary} />
        </Pressable>
      </View>}
      {canPurchase && selections.length > 0 && <ScrollView style={styles.selectedList} nestedScrollEnabled>
        {selections.map((selection) => {
          const group = groups.find((item) => item.key === selection.key);
          if (!group) return null;
          return <SelectedRow key={selection.key || "__default__"} group={group} label={optionLabel(group, product)} quantity={selection.quantity}
            removable={!isSingle} stockLabel={stockLabel(group)}
            onChange={(delta) => changeQuantity(selection.key, delta)}
            onRemove={() => setSelections((current) => current.filter((item) => item.key !== selection.key))} />;
        })}
      </ScrollView>}
      {canPurchase && books.length > 0 && <View style={styles.totalRow}>
        <Txt style={styles.totalLabel}>{books.length}권 · 배송비 {shippingFee}</Txt>
        <Txt bold style={styles.totalValue}>{formatCurrency(subtotal)}</Txt>
      </View>}
      <View style={styles.actions}>
        <View style={styles.wishBox}><WishButton productId={product.id} size={24} inactiveColor={colors.text} /></View>
        {canPurchase ? <>
          <Button variant="secondary" style={styles.action} loading={busy === "cart"} disabled={Boolean(busy)} onPress={handleAddToCart}>장바구니</Button>
          <Button style={styles.action} disabled={Boolean(busy)} onPress={handleBuyNow}>구매하기</Button>
        </> : preRelease ? <Button style={styles.action} disabled={!featured?.eventPath}
          onPress={() => openSiteLink(navigation, featured.eventPath, product.title)}>{featured?.eventPath ? "출시 알림 신청하기" : "판매 준비 중"}</Button>
          : <Button style={styles.action} icon="bell" variant={restockOn ? "secondary" : "primary"} loading={busy === "restock"} onPress={handleRestock}>
            {restockOn ? "재입고 알림 해제" : "재입고 알림 받기"}
          </Button>}
      </View>
    </View>
    {/* Android는 부모 영역 밖 터치를 받지 않아 목록을 화면 최상위에 둔다. */}
    {menuOpen && showDropdown && <View style={[styles.menu, { bottom: bottomHeight + 8 }]}>
      <ScrollView style={styles.menuScroll} nestedScrollEnabled>
        {groups.map((group) => <Pressable key={group.key || "__default__"} accessibilityRole="button" disabled={group.soldOut}
          accessibilityState={{ disabled: group.soldOut }} onPress={() => selectGroup(group)}
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.secondary }]}>
          <Txt numberOfLines={2} style={[styles.menuLabel, group.soldOut && styles.menuSoldOut]}>{optionLabel(group, product)}</Txt>
          <Txt style={[styles.menuPrice, group.soldOut && styles.menuSoldOut]}>{group.soldOut ? "품절" : formatCurrency(group.unitPrice)}</Txt>
        </Pressable>)}
      </ScrollView>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  topBar: { position: "absolute", left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  topActions: { flexDirection: "row", gap: 8 },
  counter: { position: "absolute", right: 16, bottom: 16, paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center" },
  counterText: { color: colors.surface, fontSize: 12, lineHeight: 16 },
  info: { paddingHorizontal: space.page, paddingTop: 20, gap: 6 },
  brand: { fontSize: 13, color: colors.muted },
  title: { fontSize: 20, lineHeight: 28, letterSpacing: -0.4 },
  meta: { fontSize: 13, color: colors.textSecondary },
  priceBlock: { marginTop: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  upcoming: { fontSize: 18, color: colors.primary },
  soldOut: { fontSize: 14, color: colors.danger, marginBottom: 4 },
  shipping: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: space.page, marginTop: 18, marginBottom: 20, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.card },
  shippingText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  section: { paddingHorizontal: space.page, paddingTop: 24, gap: 8 },
  sectionTitle: { fontSize: 17 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  summaryText: { fontSize: 15, lineHeight: 24, color: colors.text },
  caption: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 4 },
  bullet: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  policyLink: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 8, alignSelf: "flex-start" },
  policyText: { fontSize: 13, color: colors.muted, textDecorationLine: "underline" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  bottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 10, gap: 10, ...shadow.md },
  dropdown: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  dropdownLabel: { fontSize: 15, color: colors.textSecondary },
  menu: { position: "absolute", left: 16, right: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden", ...shadow.md, zIndex: 2 },
  menuScroll: { maxHeight: 280 },
  menuItem: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  menuLabel: { flex: 1, fontSize: 14, lineHeight: 20 },
  menuPrice: { fontSize: 14, color: colors.text },
  menuSoldOut: { color: colors.muted },
  selectedList: { maxHeight: 200 },
  selected: { padding: 12, borderRadius: radius.md, backgroundColor: colors.card, marginBottom: 8, gap: 10 },
  selectedHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  selectedLabel: { flex: 1, fontSize: 14, lineHeight: 20 },
  stock: { fontSize: 12, color: colors.muted },
  selectedControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface },
  stepperButton: { width: 32, height: 30, alignItems: "center", justifyContent: "center" },
  stepperValue: { minWidth: 28, textAlign: "center", fontSize: 14 },
  disabled: { opacity: 0.35 },
  lineTotal: { fontSize: 15 },
  totalRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 19, letterSpacing: -0.3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  wishBox: { width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  action: { flex: 1 },
});
