import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { Button } from "../components/ui.jsx";
import { openWebsite } from "../lib/openWebsite.js";
import { colors, logoSource } from "../theme.js";

const steps = [
  ["package", "수거 신청", "팔고 싶은 교재를 등록하고 수거를 신청해요."],
  ["check-circle", "검수와 판매", "수북이 교재를 확인하고 판매를 진행해요."],
  ["credit-card", "판매금 정산", "구매확정된 판매분을 다음 달 1일에 정산해요."],
];

export default function ServiceScreen({ route }) {
  const selling = route.params.section === "sell";
  return <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Image source={logoSource} style={styles.logo} resizeMode="contain" accessibilityLabel="수북" />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{selling ? "수북에 판매하기" : "마이수북"}</Text>
        <Text style={styles.title}>{selling ? "책장에 잠든 교재,\n다음 수험생에게." : "내 교재의 여정을\n한곳에서."}</Text>
        <Text style={styles.description}>{selling ? "수거부터 검수, 판매까지\n수북이 함께할게요." : "기존 수북 계정으로 주문과 배송,\n판매와 정산 내역을 확인하세요."}</Text>
      </View>
      {selling && <View style={styles.steps}>{steps.map(([icon, title, description]) => <View key={title} style={styles.step}>
        <View style={styles.stepIcon}><Feather name={icon} size={22} color={colors.primary} /></View>
        <View style={styles.stepText}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDescription}>{description}</Text></View>
      </View>)}</View>}
      <View style={styles.linkGroup}>
        <Text style={styles.notice}>{selling ? "판매 안내와 수거 신청은 수북 웹에서 이어집니다." : "주문·판매 내역은 수북 웹에서 로그인 후 확인합니다."}</Text>
        <Button icon="arrow-up-right" onPress={() => openWebsite(selling ? "/sell" : "/mypage")}>
          {selling ? "수북 웹에서 판매 안내 보기" : "수북 웹에서 마이페이지 열기"}
        </Button>
        {!selling && <>
          <Button secondary icon="arrow-up-right" onPress={() => openWebsite("/privacy")}>개인정보 처리방침</Button>
          <Button secondary icon="arrow-up-right" onPress={() => openWebsite("/terms")}>이용약관</Button>
        </>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 24, gap: 28, paddingBottom: 40 },
  logo: { width: 108, height: 26 },
  hero: { gap: 16, paddingVertical: 20 },
  eyebrow: { fontSize: 13, color: colors.primary, fontWeight: "700" },
  title: { color: colors.primary, fontSize: 32, lineHeight: 44, fontWeight: "800", letterSpacing: -1 },
  description: { color: colors.secondary, fontSize: 15, lineHeight: 25 },
  steps: { gap: 24 },
  step: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepIcon: { backgroundColor: colors.background, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  stepText: { flex: 1, gap: 6 },
  stepTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  stepDescription: { fontSize: 13, color: colors.muted, lineHeight: 20 },
  linkGroup: { gap: 12, marginTop: 8 },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 20 },
});
