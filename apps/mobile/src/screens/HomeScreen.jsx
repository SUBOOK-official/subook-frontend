import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import { MOBILE_STORE_SUBJECTS } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { getDetailImageUrl, getThumbnailImageUrl } from "../../../public-web/src/lib/storageImage.js";
import { useIsFocused } from "@react-navigation/native";
import { FortuneCookie } from "../components/FortuneCookie.jsx";
import { HomePopup } from "../components/HomePopup.jsx";
import { ProductCard } from "../components/ProductCard.jsx";
import { ProductGrid } from "../components/ProductGrid.jsx";
import { Chip, IconButton, SectionHeader, Skeleton, Txt } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { loadHomeSections, loadMemberRail } from "../lib/catalog.js";
import { goToTab, openSiteLink } from "../lib/siteLinks.js";
import { useCatalog } from "../lib/useCatalog.js";
import { colors, logoSource, radius, space } from "../theme.js";

const AUTO_ADVANCE_MS = 5000;

function HomeHeader({ navigation }) {
  const insets = useSafeAreaInsets();
  const { cartCount } = useShop();
  return <View style={[styles.header, { paddingTop: insets.top }]}>
    <Image source={logoSource} style={styles.logo} contentFit="contain" accessibilityLabel="수북" />
    <View style={styles.headerActions}>
      <IconButton name="search" label="교재 검색" onPress={() => goToTab(navigation, "Search", { focus: Date.now() })} />
      <IconButton name="bell" label="알림" onPress={() => navigation.navigate("Web", { path: "/notifications", title: "알림" })} />
      <IconButton name="shopping-bag" label={`장바구니${cartCount ? ` ${cartCount}개` : ""}`} badge={cartCount} onPress={() => navigation.navigate("Cart")} />
    </View>
  </View>;
}

function HeroSlide({ slide, width, onPress }) {
  const isBook = slide.kind === "book";
  const source = slide.imageUrl ? (isBook ? getDetailImageUrl(slide.imageUrl) : slide.imageUrl) : null;
  return <Pressable accessibilityRole={slide.href || isBook ? "button" : "image"} accessibilityLabel={isBook ? `${slide.summary}, ${slide.title}` : slide.title}
    onPress={() => onPress(slide)} style={{ width, height: width }}>
    {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit={isBook ? "cover" : "contain"} transition={200} />
      : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />}
    {isBook ? <>
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.42)", "rgba(0,0,0,0.78)"]} locations={[0, 0.45, 1]} style={styles.heroShade} />
      <View style={styles.heroCopy}>
        <Txt bold numberOfLines={2} style={styles.heroSummary}>{slide.summary}</Txt>
        <Txt numberOfLines={1} style={styles.heroTitle}>{slide.title}</Txt>
        <Txt style={styles.heroPrice}>{slide.priceLabel}</Txt>
      </View>
    </> : null}
  </Pressable>;
}

// 배너 한 장의 크기. 폰은 화면 너비 정사각형, 넓은 화면은 한 줄에 여러 장이 보이게 줄인다.
function useHeroSize() {
  const { width } = useWindowDimensions();
  return width >= 600 ? Math.round(Math.min(width / 2, 420)) : width;
}

function HeroCarousel({ slides, loading, navigation }) {
  const width = useHeroSize();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length;
        listRef.current?.scrollToOffset({ offset: next * width, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length, width]);

  const onPress = useCallback((slide) => {
    if (slide.kind === "book") navigation.push("Product", { productId: slide.productId, title: slide.title });
    else if (slide.href) openSiteLink(navigation, slide.href, slide.title);
  }, [navigation]);

  if (loading) return <Skeleton style={{ width: "100%", height: width, borderRadius: 0 }} />;
  if (slides.length === 0) return null;
  return <View>
    <FlatList ref={listRef} data={slides} keyExtractor={(item) => item.id} horizontal showsHorizontalScrollIndicator={false}
      snapToInterval={width} decelerationRate="fast"
      renderItem={({ item }) => <HeroSlide slide={item} width={width} onPress={onPress} />}
      getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
      onScrollBeginDrag={() => setPaused(true)}
      onMomentumScrollEnd={(event) => {
        setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        setPaused(false);
      }} />
    <View style={styles.counter} accessibilityLabel={`${slides.length}개 중 ${index + 1}번째 배너`}>
      <Txt style={styles.counterText}>{index + 1} / {slides.length}</Txt>
    </View>
  </View>;
}

function ThemeLinks({ themes, navigation }) {
  if (themes.length === 0) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themes}>
    {themes.map((theme) => <Pressable key={theme.id} accessibilityRole="button" accessibilityLabel={theme.title}
      onPress={() => navigation.navigate("Theme", { themeId: theme.id, title: theme.title })}
      style={({ pressed }) => [styles.theme, pressed && { opacity: 0.6 }]}>
      <View style={styles.themeImage}>
        {theme.image_url ? <Image source={getThumbnailImageUrl(theme.image_url)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <Txt numberOfLines={2} style={styles.themeLabel}>{theme.title}</Txt>
    </Pressable>)}
  </ScrollView>;
}

// 로그인 회원에게 맞춤 교재가 있으면 그것을, 아니면 BEST(순위 표시)를 보여 준다.
function BestRail({ products, personalized = false, navigation }) {
  if (products.length === 0) return null;
  const openProduct = (product) => navigation.push("Product", { productId: product.id, title: product.title });
  return <View style={styles.section}>
    <SectionHeader title={personalized ? "나를 위한 맞춤 교재" : "BEST 교재"} onAction={() => goToTab(navigation, "Search", { sort: "popular" })} />
    <FlatList data={products} keyExtractor={(item) => item.id} horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      renderItem={({ item, index }) => <ProductCard product={item} width={136} rank={personalized ? undefined : index + 1} onPress={openProduct} />} />
  </View>;
}

function PickupBanner({ navigation }) {
  return <Pressable accessibilityRole="button" onPress={() => goToTab(navigation, "Sell")}
    style={({ pressed }) => [styles.pickup, pressed && { backgroundColor: colors.card }]}>
    <View style={styles.pickupText}>
      <Txt bold style={styles.pickupTitle}>풀지않은 교재를 쉽게 판매하고 싶으신가요?</Txt>
      <Txt style={styles.pickupMessage}>교재를 집 밖에 꺼내놓기만 하면 수거 검수 판매 정산까지 전부 대행합니다</Txt>
    </View>
    <Feather name="chevron-right" size={20} color={colors.primary} />
  </Pressable>;
}

export default function HomeScreen({ navigation }) {
  const [subject, setSubject] = useState("전체");
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { wishlistIds } = useShop();
  const [home, setHome] = useState({ slides: [], popups: [], themes: [], best: [], loading: true });
  const [memberRail, setMemberRail] = useState(null);
  const userId = user?.id ?? null;
  const wishKey = [...wishlistIds].join(",");
  const [refreshing, setRefreshing] = useState(false);
  const catalog = useCatalog({ search: "", subject, sort: "popular" });

  const loadHome = useCallback(async () => {
    const sections = await loadHomeSections();
    setHome({ ...sections, loading: false });
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  // 로그인 회원 맞춤 교재(최근 구매 → 찜 기준). 신호가 없으면 BEST를 그대로 둔다.
  useEffect(() => {
    let active = true;
    setMemberRail(null);
    if (!userId) return undefined;
    void loadMemberRail(wishKey ? wishKey.split(",") : [])
      .then((result) => {
        if (active && result) setMemberRail({ userId, ...result });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, wishKey]);
  const rail = memberRail?.userId === userId && memberRail.source !== "best" && memberRail.products.length > 0 ? memberRail : null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    catalog.refresh();
    await loadHome();
    setRefreshing(false);
  }, [catalog, loadHome]);

  const header = <View>
    <HeroCarousel slides={home.slides} loading={home.loading} navigation={navigation} />
    <ThemeLinks themes={home.themes} navigation={navigation} />
    <BestRail products={rail?.products ?? home.best} personalized={Boolean(rail)} navigation={navigation} />
    <PickupBanner navigation={navigation} />
    <View style={styles.section}>
      <SectionHeader title="전체 교재" onAction={() => goToTab(navigation, "Search", { subject })} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
        {MOBILE_STORE_SUBJECTS.map((item) => <Chip key={item} label={item} selected={subject === item} onPress={() => setSubject(item)} />)}
      </ScrollView>
    </View>
  </View>;

  return <View style={styles.screen}>
    <HomeHeader navigation={navigation} />
    <HomePopup popups={home.popups} />
    <ProductGrid products={catalog.products} loading={catalog.loading} error={catalog.error}
      onEndReached={catalog.loadMore} onRetry={catalog.retry} onRefresh={onRefresh} refreshing={refreshing}
      ListHeaderComponent={header} emptyMessage="다른 과목을 골라 보세요." />
    <FortuneCookie active={isFocused} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: space.page, paddingRight: 10, backgroundColor: colors.surface },
  logo: { width: 76, height: 24, marginVertical: 14 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  heroShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "65%" },
  heroCopy: { position: "absolute", left: 24, right: 24, bottom: 28, gap: 8 },
  heroSummary: { color: colors.surface, fontSize: 23, lineHeight: 31, letterSpacing: -0.5 },
  heroTitle: { color: "rgba(255,255,255,0.9)", fontSize: 14 },
  heroPrice: { color: colors.surface, fontSize: 14 },
  counter: { position: "absolute", right: 16, bottom: 16, paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center" },
  counterText: { color: colors.surface, fontSize: 12, lineHeight: 16 },
  themes: { paddingHorizontal: space.page - 4, paddingTop: 22, paddingBottom: 6, gap: 6 },
  theme: { width: 74, alignItems: "center", gap: 8 },
  themeImage: { width: 62, height: 62, borderRadius: radius.pill, backgroundColor: colors.card, overflow: "hidden" },
  themeLabel: { fontSize: 12, lineHeight: 16, textAlign: "center", color: colors.textSecondary },
  section: { paddingTop: 32 },
  rail: { paddingHorizontal: space.page, gap: 12 },
  pickup: { marginTop: 32, marginHorizontal: space.page, padding: 20, borderRadius: radius.lg, backgroundColor: colors.secondary, flexDirection: "row", alignItems: "center", gap: 12 },
  pickupText: { flex: 1, gap: 6 },
  pickupTitle: { fontSize: 15, lineHeight: 22, color: colors.primary },
  pickupMessage: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  chips: { paddingHorizontal: space.page, gap: 8, paddingBottom: 18 },
});
