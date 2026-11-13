import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { showDialog } from "../components/Dialog.jsx";
import { ScreenHeader, Txt } from "../components/ui.jsx";
import { errorFeedback } from "../lib/haptics.js";
import { signInWithProvider } from "../lib/oauth.js";
import { colors, logoSource, radius, space } from "../theme.js";

// 카카오 공식 심볼(검은 말풍선)과 구글 G 로고 — 웹 PublicOAuthButtons와 같은 도형
function KakaoIcon() {
  return <Svg width={18} height={18} viewBox="0 0 18 18" accessibilityElementsHidden>
    <Path fill="#000000" d="M9 1.5C4.86 1.5 1.5 4.18 1.5 7.48c0 2.16 1.45 4.04 3.61 5.09-.16.6-.58 2.16-.66 2.5-.1.42.15.42.32.31.13-.09 2.14-1.45 3.01-2.04.4.06.81.09 1.22.09 4.14 0 7.5-2.68 7.5-5.98S13.14 1.5 9 1.5z" />
  </Svg>;
}

function GoogleIcon() {
  return <Svg width={18} height={18} viewBox="0 0 48 48" accessibilityElementsHidden>
    <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </Svg>;
}

const PROVIDERS = [
  { provider: "kakao", label: "카카오로 시작하기", Icon: KakaoIcon },
  { provider: "google", label: "Google로 시작하기", Icon: GoogleIcon },
];

// 로그인 관문(웹 로그인 관문과 같은 위계: 카카오 → Google → 이메일 로그인·회원가입).
// 소셜 로그인은 기기 브라우저 창에서, 이메일 로그인·회원가입은 앱 안 웹 화면에서 한다.
// 로그인 뒤 약관 동의·휴대폰 인증·차단 확인은 웹의 /auth/callback 화면이 그대로 처리한다.
export default function LoginScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const checkout = route.params?.checkout ?? null;
  const next = checkout ? "/app/checkout" : "/app/done";
  const [busy, setBusy] = useState(null);

  const openWeb = (path, title) => navigation.replace("Web", { path, title, checkout });

  const startProvider = async ({ provider, label }) => {
    if (busy) return;
    setBusy(provider);
    try {
      const result = await signInWithProvider(provider);
      if (result === "success") openWeb(`/auth/callback?next=${encodeURIComponent(next)}`, checkout ? "주문하기" : "로그인");
    } catch {
      errorFeedback();
      showDialog(`${label.replace("로 시작하기", "")} 로그인을 마치지 못했어요`, "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  return <View style={styles.screen}>
    <ScreenHeader title="로그인" onBack={() => navigation.goBack()} backIcon="x" backLabel="닫기" />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <Image source={logoSource} style={styles.logo} contentFit="contain" accessibilityLabel="수북" />
      <Txt bold style={styles.headline}>수북에서 오늘의 공부를 이어가세요.</Txt>

      {/* 구매하다 들어온 경우: 카카오 → 비회원 구매 → Google 순(웹 로그인 관문과 같은 위계) */}
      <View style={styles.buttons}>
        {PROVIDERS.map((item) => <View key={item.provider} style={styles.buttonGroup}>
          <Pressable accessibilityRole="button" accessibilityState={{ busy: busy === item.provider, disabled: Boolean(busy) }}
            disabled={Boolean(busy)} onPress={() => startProvider(item)}
            style={({ pressed }) => [styles.provider, item.provider === "kakao" ? styles.kakao : styles.outlined, pressed && { opacity: 0.8 }, busy && busy !== item.provider && { opacity: 0.5 }]}>
            {busy === item.provider ? <ActivityIndicator color={colors.text} /> : <>
              <item.Icon />
              <Txt bold style={styles.providerLabel}>{item.label}</Txt>
            </>}
          </Pressable>
          {checkout && item.provider === "kakao" ? <Pressable accessibilityRole="button" disabled={Boolean(busy)}
            onPress={() => navigation.replace("Web", { path: "/app/checkout", title: "주문하기", checkout: { ...checkout, guestMode: true } })}
            style={({ pressed }) => [styles.provider, styles.guest, pressed && { backgroundColor: colors.secondary }]}>
            <Txt bold style={styles.guestLabel}>비회원으로 구매하기</Txt>
          </Pressable> : null}
        </View>)}
      </View>

      <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => openWeb(`/app/login?next=${encodeURIComponent(next)}`, "로그인")} style={styles.emailLink}>
        <Txt style={styles.emailText}>이메일로 로그인 · 회원가입</Txt>
      </Pressable>

      {checkout ? null : <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => openWeb("/order/lookup", "비회원 주문 조회")} style={styles.subLink}>
        <Txt style={styles.subText}>비회원 주문 조회</Txt>
      </Pressable>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: space.page, paddingTop: 48, alignItems: "stretch" },
  logo: { width: 132, height: 36, alignSelf: "center" },
  headline: { fontSize: 20, lineHeight: 29, letterSpacing: -0.4, textAlign: "center", marginTop: 20, color: colors.primary },
  buttons: { marginTop: 40, gap: 10 },
  buttonGroup: { gap: 10 },
  provider: { height: 52, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  kakao: { backgroundColor: colors.kakao },
  outlined: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  guest: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  guestLabel: { fontSize: 16, color: colors.primary },
  providerLabel: { fontSize: 16, color: colors.text },
  emailLink: { alignSelf: "center", marginTop: 22, paddingVertical: 10, paddingHorizontal: 12 },
  emailText: { fontSize: 15, color: colors.textSecondary, textDecorationLine: "underline" },
  subLink: { alignSelf: "center", marginTop: 6, paddingVertical: 10, paddingHorizontal: 12 },
  subText: { fontSize: 13, color: colors.muted },
});
