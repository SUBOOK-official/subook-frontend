import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import Feather from "@expo/vector-icons/Feather";
import { getDetailImageUrl, getThumbnailImageUrl } from "../../../public-web/src/lib/storageImage.js";
import { formatReviewDate, formatReviewProductTitle, mergeReviewItems } from "../../../public-web/src/lib/publicReviewsUtils.js";
import { loadReviewPage } from "../lib/reviews.js";
import { colors, radius, space } from "../theme.js";
import { Button, Skeleton, Txt } from "./ui.jsx";

function Stars({ rating, size = 14 }) {
  const value = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)));
  return <View style={styles.stars} accessibilityRole="image" accessibilityLabel={`별점 ${value}점`}>
    {[1, 2, 3, 4, 5].map((star) => <Ionicons key={star} name="star" size={size} color={star <= value ? colors.primary : colors.border} />)}
  </View>;
}

function PhotoViewer({ photos, index, onClose }) {
  const { width, height } = useWindowDimensions();
  if (!photos) return null;
  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.viewer}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentOffset={{ x: index * width, y: 0 }}>
        {photos.map((url) => <Pressable key={url} onPress={onClose} accessibilityLabel="사진 닫기">
          <Image source={getDetailImageUrl(url)} style={{ width, height }} contentFit="contain" />
        </Pressable>)}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12} onPress={onClose} style={styles.viewerClose}>
        <Feather name="x" size={24} color={colors.surface} />
      </Pressable>
    </View>
  </Modal>;
}

function ReviewCard({ review, currentProductId, onOpenPhoto }) {
  const navigation = useNavigation();
  const canOpenProduct = review.productId && String(review.productId) !== String(currentProductId);
  const productTitle = formatReviewProductTitle(review.productTitle, review.itemCount);
  return <View style={styles.card}>
    <View style={styles.cardHead}>
      <Stars rating={review.rating} />
      <Txt style={styles.author}>{review.author}</Txt>
      {review.createdAt ? <Txt style={styles.date}>{formatReviewDate(review.createdAt)}</Txt> : null}
    </View>
    {review.isSameProduct
      ? <View style={styles.sameBadge}><Txt bold style={styles.sameBadgeText}>이 교재 구매</Txt></View>
      : <Pressable accessibilityRole={canOpenProduct ? "link" : "text"} disabled={!canOpenProduct}
        onPress={() => navigation.push("Product", { productId: String(review.productId), title: review.productTitle })}>
        <Txt numberOfLines={1} style={styles.productTitle}>{productTitle}</Txt>
      </Pressable>}
    <Txt style={styles.content}>{review.content}</Txt>
    {review.photoUrls.length > 0 && <View style={styles.photos}>
      {review.photoUrls.map((url, index) => <Pressable key={url} accessibilityRole="imagebutton" accessibilityLabel={`${review.author}님 후기 사진 ${index + 1}`}
        onPress={() => onOpenPhoto(review.photoUrls, index)}>
        <Image source={getThumbnailImageUrl(url)} style={styles.photo} contentFit="cover" />
      </Pressable>)}
    </View>}
  </View>;
}

// 통합 구매 후기(웹 상품 상세와 같은 데이터·정렬). 후기가 없으면 구역을 그리지 않는다.
export function ReviewsSection({ productId }) {
  const [state, setState] = useState({ summary: null, status: "loading", loadingMore: false });
  const [viewer, setViewer] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState({ summary: null, status: "loading", loadingMore: false });
    try {
      const summary = await loadReviewPage({ productId, offset: 0 });
      if (requestId.current === id) setState({ summary, status: "ready", loadingMore: false });
    } catch {
      if (requestId.current === id) setState({ summary: null, status: "error", loadingMore: false });
    }
  }, [productId]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  const loadMore = async () => {
    const { summary } = state;
    if (!summary || state.loadingMore || summary.items.length >= summary.total) return;
    const id = requestId.current;
    setState((current) => ({ ...current, loadingMore: true }));
    try {
      const next = await loadReviewPage({ productId, offset: summary.items.length });
      if (requestId.current !== id) return;
      setState((current) => ({
        status: "ready",
        loadingMore: false,
        summary: { ...next, items: mergeReviewItems(current.summary?.items, next.items) },
      }));
    } catch {
      if (requestId.current === id) setState((current) => ({ ...current, loadingMore: false }));
    }
  };

  const { summary, status } = state;
  if (status === "ready" && (!summary || summary.total === 0)) return null;

  return <View style={styles.section}>
    <Txt bold style={styles.title} accessibilityRole="header">수북 구매 후기{summary?.total ? ` (${summary.total.toLocaleString("ko-KR")})` : ""}</Txt>
    {status === "loading" ? <View style={styles.skeletons}><Skeleton style={styles.skeleton} /><Skeleton style={styles.skeleton} /></View>
      : status === "error" ? <View style={styles.error}>
        <Txt style={styles.errorText}>후기를 불러오지 못했어요.</Txt>
        <Button variant="secondary" size="md" onPress={load}>다시 시도</Button>
      </View>
        : <>
          {summary.average != null && <View style={styles.average}>
            <Txt bold style={styles.averageValue}>{summary.average.toFixed(1)}</Txt>
            <Stars rating={summary.average} size={18} />
          </View>}
          {summary.items.map((review) => <ReviewCard key={review.id} review={review} currentProductId={productId}
            onOpenPhoto={(photos, index) => setViewer({ photos, index })} />)}
          {summary.items.length < summary.total && <Button variant="secondary" size="md" loading={state.loadingMore} onPress={loadMore} style={styles.more}>후기 더 보기</Button>}
        </>}
    <PhotoViewer photos={viewer?.photos} index={viewer?.index ?? 0} onClose={() => setViewer(null)} />
  </View>;
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: space.page, paddingTop: 28, gap: 4 },
  title: { fontSize: 17 },
  stars: { flexDirection: "row", gap: 2 },
  skeletons: { gap: 10, paddingTop: 12 },
  skeleton: { height: 76 },
  error: { paddingTop: 12, gap: 10, alignItems: "flex-start" },
  errorText: { fontSize: 14, color: colors.muted },
  average: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, paddingBottom: 4 },
  averageValue: { fontSize: 26, letterSpacing: -0.4 },
  card: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  author: { fontSize: 13, color: colors.textSecondary },
  date: { fontSize: 12, color: colors.muted },
  sameBadge: { alignSelf: "flex-start", paddingHorizontal: 8, height: 22, borderRadius: radius.xs, backgroundColor: colors.secondary, justifyContent: "center" },
  sameBadgeText: { fontSize: 11, lineHeight: 15, color: colors.primary },
  productTitle: { fontSize: 12, color: colors.muted },
  content: { fontSize: 14, lineHeight: 22, color: colors.text },
  photos: { flexDirection: "row", gap: 8 },
  photo: { width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.card },
  more: { marginTop: 14 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 48, right: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
