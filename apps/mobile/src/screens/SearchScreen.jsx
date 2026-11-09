import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { MOBILE_STORE_SORTS, MOBILE_STORE_SUBJECTS } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { ProductGrid } from "../components/ProductGrid.jsx";
import { Chip, Txt } from "../components/ui.jsx";
import { addRecentSearch, clearRecentSearches, readRecentSearches, removeRecentSearch } from "../lib/recentSearches.js";
import { useCatalog } from "../lib/useCatalog.js";
import { colors, fonts, radius, space } from "../theme.js";

function RecentSearches({ items, onSelect, onRemove, onClear }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.recent}>
    <View style={styles.recentHeader}>
      <Txt bold style={styles.recentTitle}>최근 검색어</Txt>
      {items.length > 0 && <Pressable accessibilityRole="button" hitSlop={10} onPress={onClear}>
        <Txt style={styles.recentClear}>전체 삭제</Txt>
      </Pressable>}
    </View>
    {items.length === 0 ? <Txt style={styles.recentEmpty}>최근 검색한 교재가 없어요.</Txt>
      : <View style={styles.recentList}>
        {items.map((item) => <View key={item} style={styles.recentChip}>
          <Pressable accessibilityRole="button" onPress={() => onSelect(item)} style={styles.recentChipLabel}>
            <Txt numberOfLines={1} style={styles.recentChipText}>{item}</Txt>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item} 삭제`} hitSlop={8} onPress={() => onRemove(item)}>
            <Feather name="x" size={14} color={colors.muted} />
          </Pressable>
        </View>)}
      </View>}
  </ScrollView>;
}

export default function SearchScreen({ route }) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);
  const params = route.params ?? {};
  const [input, setInput] = useState(params.query ?? "");
  const [search, setSearch] = useState(params.query ?? "");
  const [subject, setSubject] = useState(MOBILE_STORE_SUBJECTS.includes(params.subject) ? params.subject : "전체");
  const [sort, setSort] = useState(MOBILE_STORE_SORTS.some((item) => item.value === params.sort) ? params.sort : "popular");
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState([]);
  const catalog = useCatalog({ search, subject, sort });

  useEffect(() => {
    void readRecentSearches().then(setRecent);
  }, []);

  // 홈·웹 화면 링크에서 검색어·과목·정렬을 넘겨받는다.
  useEffect(() => {
    if (params.query !== undefined) {
      setInput(params.query);
      setSearch(params.query);
    }
    if (params.subject !== undefined) setSubject(MOBILE_STORE_SUBJECTS.includes(params.subject) ? params.subject : "전체");
    if (params.sort !== undefined && MOBILE_STORE_SORTS.some((item) => item.value === params.sort)) setSort(params.sort);
    if (params.focus) setTimeout(() => inputRef.current?.focus(), 250);
  }, [params.query, params.subject, params.sort, params.focus]);

  const submit = async (keyword = input) => {
    const value = keyword.trim();
    setInput(value);
    setSearch(value);
    inputRef.current?.blur();
    if (value) setRecent(await addRecentSearch(value));
  };

  const showRecent = focused && !input.trim();
  const header = <View style={styles.filters}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
      {MOBILE_STORE_SUBJECTS.map((item) => <Chip key={item} label={item} selected={subject === item} onPress={() => setSubject(item)} />)}
    </ScrollView>
    <View style={styles.resultBar}>
      <Txt style={styles.resultCount}>{catalog.loading && catalog.products.length === 0 ? " " : `${catalog.total.toLocaleString("ko-KR")}권`}</Txt>
      <View style={styles.sorts}>
        {MOBILE_STORE_SORTS.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: sort === item.value }}
          hitSlop={6} onPress={() => setSort(item.value)}>
          <Txt bold={sort === item.value} style={[styles.sort, sort === item.value && styles.sortActive]}>{item.label}</Txt>
        </Pressable>)}
      </View>
    </View>
  </View>;

  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.searchRow}>
      <View style={styles.searchBox}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput ref={inputRef} value={input} onChangeText={setInput} onSubmitEditing={() => submit()}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="교재명, 강사명으로 검색" placeholderTextColor={colors.muted} returnKeyType="search"
          autoCorrect={false} autoCapitalize="none" maxLength={100} accessibilityLabel="교재 검색어"
          style={styles.input} />
        {input ? <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={10}
          onPress={() => { setInput(""); setSearch(""); }}>
          <Feather name="x-circle" size={18} color={colors.muted} />
        </Pressable> : null}
      </View>
      {focused && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setInput(search); inputRef.current?.blur(); }}>
        <Txt style={styles.cancel}>취소</Txt>
      </Pressable>}
    </View>
    {showRecent
      ? <RecentSearches items={recent} onSelect={(item) => submit(item)}
        onRemove={async (item) => setRecent(await removeRecentSearch(item))}
        onClear={async () => setRecent(await clearRecentSearches())} />
      : <ProductGrid products={catalog.products} loading={catalog.loading} error={catalog.error}
        onEndReached={catalog.loadMore} onRetry={catalog.retry} ListHeaderComponent={header}
        emptyMessage={search ? "검색어를 바꾸거나 과목을 다시 골라 보세요." : "다른 과목을 골라 보세요."} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space.page, paddingVertical: 10 },
  searchBox: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  input: { flex: 1, height: 44, fontSize: 15, color: colors.text, fontFamily: fonts.regular, paddingVertical: 0 },
  cancel: { fontSize: 15, color: colors.textSecondary },
  filters: { paddingTop: 4 },
  chips: { paddingHorizontal: space.page, gap: 8 },
  resultBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.page, paddingTop: 16, paddingBottom: 14 },
  resultCount: { fontSize: 13, color: colors.textSecondary },
  sorts: { flexDirection: "row", gap: 14 },
  sort: { fontSize: 13, color: colors.muted },
  sortActive: { color: colors.text },
  recent: { paddingHorizontal: space.page, paddingTop: 12 },
  recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  recentTitle: { fontSize: 16 },
  recentClear: { fontSize: 13, color: colors.muted },
  recentEmpty: { fontSize: 14, color: colors.muted, paddingVertical: 8 },
  recentList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recentChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingLeft: 14, paddingRight: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, maxWidth: "100%" },
  recentChipLabel: { flexShrink: 1 },
  recentChipText: { fontSize: 14, color: colors.textSecondary },
});
