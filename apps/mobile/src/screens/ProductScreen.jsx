import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProductWebUrl, normalizeMobileProduct } from "../../../../packages/shared-domain/src/mobileCatalog.js";
import { formatCurrency } from "../../../../packages/shared-domain/src/format.js";
import { BookCover, Button, Feedback, Price } from "../components/ui.jsx";
import { catalogClient } from "../lib/catalog.js";
import { openWebsite } from "../lib/openWebsite.js";
import { colors } from "../theme.js";

export default function ProductScreen({ route }) {
  const { productId } = route.params;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, product: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, product: null, error: null });
    async function load() {
      try {
        if (!catalogClient) throw new Error("교재 서비스 연결을 준비하고 있어요.");
        const rows = await catalogClient.detail(productId, controller.signal);
        if (!controller.signal.aborted) setState({ loading: false, product: normalizeMobileProduct(rows[0]), error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, product: null, error: error.message });
      }
    }
    void load();
    return () => controller.abort();
  }, [productId, revision]);

  const product = state.product;
  async function shareProduct() {
    try {
      const url = getProductWebUrl(product.id);
      await Share.share(Platform.OS === "ios" ? { title: product.title, message: product.title, url } : { title: product.title, message: `${product.title}\n${url}` });
    } catch {
      Alert.alert("공유를 열 수 없어요", "잠시 후 다시 시도해 주세요.");
    }
  }

  if (!product) return <Feedback loading={state.loading} title={state.error ? "교재를 불러오지 못했어요" : "지금은 볼 수 없는 교재예요"}
    message={state.error || (!state.loading ? "판매가 종료되었거나 공개되지 않은 교재일 수 있어요." : null)}
    onRetry={state.error ? () => setRevision((value) => value + 1) : null} />;

  return <SafeAreaView edges={["bottom", "left", "right"]} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <BookCover product={product} large />
      <View style={styles.info}>
        <Text style={styles.meta}>{[product.subject, product.brand, product.year && `${product.year}학년도`].filter(Boolean).join(" · ")}</Text>
        <Text style={styles.title}>{product.title}</Text>
        {product.instructor ? <Text style={styles.meta}>{product.instructor}</Text> : null}
        <Price product={product} large />
        <Text style={styles.grade}>{product.isSoldOut ? "현재 품절" : product.grade}</Text>
        <Button secondary icon="share-2" onPress={shareProduct}>교재 공유하기</Button>
      </View>
      {product.options.length > 0 && <View style={styles.section}>
        <Text style={styles.sectionTitle}>교재 구성과 상태</Text>
        {product.options.map((option) => <View key={option.id} style={styles.option}>
          <View style={styles.optionInfo}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.meta}>{option.grade} · {option.isAvailable ? "판매중" : "품절"}</Text></View>
          <Text style={styles.optionPrice}>{option.price === null ? "가격 확인" : formatCurrency(option.price)}</Text>
        </View>)}
      </View>}
      {product.notes ? <View style={styles.section}><Text style={styles.sectionTitle}>검수 안내</Text><Text style={styles.note}>{product.notes}</Text></View> : null}
    </ScrollView>
    <View style={styles.actions}>
      <Text style={styles.webNotice}>구매와 상세 사진 확인은 수북 웹에서 이어집니다.</Text>
      <Button icon="arrow-up-right" onPress={() => openWebsite(getProductWebUrl(product.id))}>수북 웹에서 상세 보기</Button>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 24 },
  info: { padding: 24, gap: 14 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  title: { fontSize: 23, fontWeight: "800", lineHeight: 32, color: colors.text, letterSpacing: -0.5 },
  grade: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  section: { padding: 24, borderTopWidth: 8, borderTopColor: colors.background, gap: 14 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  option: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 12, flexDirection: "row", alignItems: "center" },
  optionInfo: { flex: 1, gap: 6 },
  optionTitle: { color: colors.text, fontSize: 14, lineHeight: 21 },
  optionPrice: { color: colors.text, fontSize: 14, fontWeight: "700" },
  note: { color: colors.secondary, fontSize: 14, lineHeight: 24 },
  actions: { padding: 16, paddingHorizontal: 20, gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  webNotice: { color: colors.muted, fontSize: 11, textAlign: "center" },
});
