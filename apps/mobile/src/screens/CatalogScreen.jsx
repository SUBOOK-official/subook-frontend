import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { MOBILE_STORE_SORTS, MOBILE_STORE_SUBJECTS } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { BookCover, Button, Feedback, Price } from "../components/ui.jsx";
import { useCatalog } from "../lib/useCatalog.js";
import { bannerSource, colors, logoSource } from "../theme.js";

export default function CatalogScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("전체");
  const [sort, setSort] = useState("popular");
  const catalog = useCatalog({ search, subject, sort });
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  return <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
    <View style={styles.header}>
      <Image source={logoSource} resizeMode="contain" style={styles.logo} accessibilityLabel="수북" />
      <Text style={styles.tagline}>수험생의 다음 페이지</Text>
    </View>
    <View style={styles.search}>
      <Feather name="search" color={colors.muted} size={20} />
      <TextInput accessibilityLabel="교재 검색" placeholder="교재명, 강사명으로 검색" placeholderTextColor={colors.muted}
        style={styles.input} value={input} onChangeText={setInput} maxLength={100} returnKeyType="search"
        onSubmitEditing={() => setSearch(input.trim())} autoCorrect={false} />
      {input.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={12} onPress={() => { setInput(""); setSearch(""); }}>
        <Feather name="x" color={colors.muted} size={20} />
      </Pressable>}
    </View>
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjects}>
        {MOBILE_STORE_SUBJECTS.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: subject === item }}
          onPress={() => setSubject(item)} style={[styles.subject, subject === item && styles.selectedSubject]}>
          <Text style={[styles.subjectText, subject === item && styles.selectedText]}>{item}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
    <FlatList key={`${search}:${subject}:${sort}`} data={catalog.products} numColumns={2} keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={styles.list} columnWrapperStyle={styles.columns}
      refreshing={catalog.loading && catalog.products.length === 0} onRefresh={catalog.refresh}
      ListHeaderComponent={<>
        {!search && subject === "전체" && <Pressable accessibilityRole="button" accessibilityLabel="수북 교재 판매 안내 보기" onPress={() => navigation.navigate("Sell")}>
          <Image source={bannerSource} style={[styles.banner, { height: (width - 40) / 2.5 }]} resizeMode="contain" accessibilityLabel="대치동 현강 희귀 모의고사부터 S급 기출·내신 교재까지" />
        </Pressable>}
        <View style={styles.catalogHeading}>
          <View><Text style={styles.heading}>{search ? "검색 결과" : subject === "전체" ? "지금, 수북의 교재" : `${subject} 교재`}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.count}>{catalog.loading && !catalog.products.length ? "불러오는 중" : `${catalog.total.toLocaleString("ko-KR")}종의 교재`}</Text></View>
        </View>
        <View style={styles.sorts}>{MOBILE_STORE_SORTS.map((item) => <Pressable key={item.value} accessibilityRole="button"
          accessibilityState={{ selected: sort === item.value }} onPress={() => setSort(item.value)} style={styles.sortButton}>
          <Text style={[styles.sortLabel, sort === item.value && styles.activeSort]}>{item.label}</Text>
        </Pressable>)}</View>
      </>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, 상세 보기`} onPress={() => navigation.navigate("Product", { productId: item.id })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.65 }]}>
        <BookCover product={item} />
        <View style={styles.cardText}>
          <Text style={styles.brand} numberOfLines={1}>{[item.brand, item.year && `${item.year}학년도`].filter(Boolean).join(" · ")}</Text>
          <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
          <Price product={item} />
          <Text style={styles.grade}>{item.isSoldOut ? "품절" : item.grade}</Text>
        </View>
      </Pressable>}
      ListEmptyComponent={<Feedback loading={catalog.loading} title={catalog.error ? "잠시 연결이 어려워요" : "검색된 교재가 없어요"}
        message={catalog.error || (!catalog.loading ? "다른 검색어나 과목으로 찾아보세요." : null)} onRetry={catalog.error ? catalog.retry : null} />}
      ListFooterComponent={catalog.products.length > 0 ? <View style={styles.footer}>
        {catalog.error && <Text style={styles.error}>{catalog.error}</Text>}
        {catalog.error ? <Button secondary onPress={catalog.retry}>다시 시도</Button>
          : catalog.products.length < catalog.total && <Button secondary disabled={catalog.loading} onPress={catalog.loadMore}>
            {catalog.loading ? "불러오는 중…" : "교재 더 보기"}
          </Button>}
        <Text style={styles.footerText}>검수한 교재로, 다음 공부를 시작해요.</Text>
      </View> : null}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 108, height: 26 },
  tagline: { fontSize: 11, color: colors.muted },
  search: { marginHorizontal: 20, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, gap: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" },
  input: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 15, color: colors.text, paddingVertical: 10 },
  subjects: { paddingHorizontal: 20, paddingTop: 12, gap: 20 },
  subject: { paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent", minWidth: 32, alignItems: "center" },
  selectedSubject: { borderBottomColor: colors.primary },
  subjectText: { fontSize: 15, color: colors.muted },
  selectedText: { fontWeight: "800", color: colors.primary },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  columns: { gap: 14 },
  banner: { width: "100%", borderRadius: 12, marginTop: 18 },
  catalogHeading: { paddingTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.6 },
  count: { color: colors.muted, fontSize: 12, marginTop: 8 },
  sorts: { flexDirection: "row", gap: 16, marginBottom: 14, marginTop: 4 },
  sortButton: { paddingVertical: 12 },
  sortLabel: { color: colors.muted, fontSize: 13 },
  activeSort: { color: colors.primary, fontWeight: "800" },
  card: { width: "48%", flex: 1, maxWidth: "50%", marginBottom: 26 },
  cardText: { paddingTop: 12, gap: 7 },
  brand: { fontSize: 11, color: colors.muted },
  title: { fontSize: 14, fontWeight: "600", color: colors.text, lineHeight: 20, minHeight: 40 },
  grade: { color: colors.secondary, fontSize: 11 },
  footer: { gap: 14, paddingVertical: 14 },
  error: { color: colors.danger, lineHeight: 22, textAlign: "center" },
  footerText: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 16 },
});
