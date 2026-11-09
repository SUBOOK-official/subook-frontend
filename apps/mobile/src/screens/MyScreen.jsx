import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Button, ScreenHeader, Txt } from "../components/ui.jsx";
import { LOGIN_WEB_ROUTE, useAuth } from "../context/AuthContext.jsx";
import { APP_VERSION } from "../config.js";
import { colors, radius, space } from "../theme.js";
import { showDialog } from "../components/Dialog.jsx";

// 거래 내역은 웹 마이페이지(#탭)를 앱 안에서 연다.
const ACTIVITY = [
  { icon: "package", label: "구매 내역", path: "/mypage#purchases" },
  { icon: "book", label: "판매 내역", path: "/mypage#sales" },
  { icon: "credit-card", label: "정산 내역", path: "/mypage#settlements" },
  { icon: "tag", label: "쿠폰", path: "/mypage#coupons" },
  { icon: "edit-3", label: "내 리뷰", path: "/mypage#reviews" },
  { icon: "settings", label: "회원 정보", path: "/mypage#settings" },
];

const SUPPORT = [
  { label: "알림", path: "/notifications" },
  { label: "공지사항", path: "/notices" },
  { label: "자주 묻는 질문", path: "/faq" },
  { label: "이용약관", path: "/terms" },
  { label: "개인정보처리방침", path: "/privacy" },
  { label: "교환·반품 정책", path: "/refund" },
];

function MenuRow({ label, onPress, tone }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.card }]}>
    <Txt style={[styles.menuLabel, tone === "muted" && { color: colors.muted }]}>{label}</Txt>
    <Feather name="chevron-right" size={18} color={colors.muted} />
  </Pressable>;
}

export default function MyScreen({ navigation }) {
  const { isSignedIn, user, signOut } = useAuth();
  const openWeb = (path, title) => navigation.navigate("Web", { path, title });
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name || "";

  const confirmSignOut = () => showDialog("로그아웃할까요?", undefined, [
    { text: "취소", style: "cancel" },
    { text: "로그아웃", style: "destructive", onPress: () => void signOut() },
  ]);

  return <View style={styles.screen}>
    <ScreenHeader title="마이" large />
    <ScrollView contentContainerStyle={styles.content}>
      {isSignedIn ? <View style={styles.profile}>
        <View style={styles.avatar}><Feather name="user" size={24} color={colors.primary} /></View>
        <View style={styles.profileText}>
          <Txt bold style={styles.profileName}>{name ? `${name}님` : "수북 회원님"}</Txt>
          {user?.email ? <Txt numberOfLines={1} style={styles.profileMeta}>{user.email}</Txt> : null}
        </View>
      </View> : <View style={styles.guest}>
        <Txt bold style={styles.guestTitle}>로그인하고 수북을 더 편하게 이용해 보세요</Txt>
        <Button onPress={() => navigation.navigate("Web", LOGIN_WEB_ROUTE)}>로그인 · 회원가입</Button>
        <Pressable accessibilityRole="button" onPress={() => openWeb("/order/lookup", "비회원 주문 조회")} style={styles.guestLink}>
          <Txt style={styles.guestLinkText}>비회원 주문 조회</Txt>
        </Pressable>
      </View>}

      {isSignedIn && <View style={styles.grid}>
        {ACTIVITY.map((item) => <Pressable key={item.path} accessibilityRole="button" onPress={() => openWeb(item.path, item.label)}
          style={({ pressed }) => [styles.gridItem, pressed && { backgroundColor: colors.card }]}>
          <Feather name={item.icon} size={22} color={colors.primary} />
          <Txt style={styles.gridLabel}>{item.label}</Txt>
        </Pressable>)}
      </View>}

      <View style={styles.menu}>
        {SUPPORT.map((item) => <MenuRow key={item.path} label={item.label} onPress={() => openWeb(item.path, item.label)} />)}
        {isSignedIn && <MenuRow label="로그아웃" onPress={confirmSignOut} />}
        {isSignedIn && <MenuRow label="회원 탈퇴" tone="muted" onPress={() => openWeb("/mypage#settings", "회원 정보")} />}
      </View>
      <Txt style={styles.version}>앱 버전 {APP_VERSION}</Txt>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 40 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14, padding: space.page },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
  profileText: { flex: 1, gap: 4 },
  profileName: { fontSize: 18 },
  profileMeta: { fontSize: 13, color: colors.muted },
  guest: { padding: space.page, gap: 14 },
  guestTitle: { fontSize: 17, lineHeight: 25 },
  guestLink: { alignSelf: "center", padding: 6 },
  guestLinkText: { fontSize: 13, color: colors.muted, textDecorationLine: "underline" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: space.page, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  gridItem: { width: "33.333%", paddingVertical: 18, alignItems: "center", gap: 8 },
  gridLabel: { fontSize: 13, color: colors.textSecondary },
  menu: { marginTop: 24, borderTopWidth: 8, borderTopColor: colors.divider },
  menuRow: { minHeight: 54, paddingHorizontal: space.page, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  menuLabel: { fontSize: 15 },
  version: { textAlign: "center", fontSize: 12, color: colors.muted, marginTop: 24 },
});
