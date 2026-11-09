import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { PICKUP_FEE_POLICY } from "../../../../packages/shared-domain/src/settlement.js";
import { PICKUP_INTRO_NOTES } from "../../../public-web/src/lib/pickupGuideContent.js";
import {
  SELL_GUIDE_CONDITIONS,
  SELL_GUIDE_FAQS,
  SELL_GUIDE_HEADING,
  SELL_GUIDE_LEAD,
  SELL_GUIDE_REJECTED,
  SELL_GUIDE_STEPS,
} from "../../../public-web/src/lib/sellGuideContent.js";
import { Button, ScreenHeader, Txt } from "../components/ui.jsx";
import { colors, radius, space } from "../theme.js";

// 웹 판매 안내(/sell)와 같은 원본 문구·이미지를 쓴다.
const heroImage = require("../../../public-web/src/assets/sell-guide-packing.webp");
const rejectedImages = [
  require("../../../public-web/src/assets/book1.jpg"),
  require("../../../public-web/src/assets/book2.jpg"),
  require("../../../public-web/src/assets/book3.jpg"),
];

function Faq({ item }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.faq}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.faqHead}>
      <Txt bold style={styles.faqQuestion}>{item.question}</Txt>
      <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
    </Pressable>
    {open && <Txt style={styles.faqAnswer}>{item.answer}</Txt>}
  </View>;
}

export default function SellScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const apply = () => navigation.navigate("Web", { path: "/pickup/new", title: "판매 신청" });
  const threshold = `${(PICKUP_FEE_POLICY.priceThreshold / 10000).toLocaleString("ko-KR")}만원`;
  const imageWidth = Math.min(width, 560) - space.page * 2;

  return <View style={styles.screen}>
    <ScreenHeader title="판매" large />
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.hero}>
        <Image source={heroImage} style={[styles.heroImage, { width: imageWidth, height: imageWidth * 0.72 }]} contentFit="cover"
          accessibilityLabel="깨끗한 교재를 가지런히 담아 둔 수거용 박스" />
        <Txt bold style={styles.heading}>{SELL_GUIDE_HEADING.join("\n")}</Txt>
        <Txt style={styles.lead}>{SELL_GUIDE_LEAD.join("\n")}</Txt>
      </View>

      <View style={styles.section}>
        <Txt bold style={styles.sectionTitle}>판매 과정</Txt>
        {SELL_GUIDE_STEPS.map((step, index) => <View key={step.title} style={styles.step}>
          <View style={styles.stepNumber}><Txt bold style={styles.stepNumberText}>{index + 1}</Txt></View>
          <View style={styles.stepText}>
            <Txt bold style={styles.itemTitle}>{step.title}</Txt>
            <Txt style={styles.itemBody}>{step.description}</Txt>
          </View>
        </View>)}
      </View>

      <View style={styles.section}>
        <Txt bold style={styles.sectionTitle}>판매 가능한 교재</Txt>
        {SELL_GUIDE_CONDITIONS.map((condition) => <View key={condition.title} style={styles.condition}>
          <Feather name="check-circle" size={20} color={colors.primary} />
          <View style={styles.stepText}>
            <Txt bold style={styles.itemTitle}>{condition.title}</Txt>
            <Txt style={styles.itemBody}>{condition.description}</Txt>
          </View>
        </View>)}
        <Txt bold style={[styles.itemTitle, { marginTop: 12 }]}>이런 교재는 판매할 수 없어요</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rejected}>
          {SELL_GUIDE_REJECTED.map((example, index) => <View key={example.label} style={styles.rejectedItem}>
            <Image source={rejectedImages[index]} style={styles.rejectedImage} contentFit="cover" accessibilityLabel={example.description} />
            <Txt style={styles.rejectedLabel}>{example.label}</Txt>
          </View>)}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Txt bold style={styles.sectionTitle}>수수료·정산</Txt>
        <View style={styles.fees}>
          {[[`판매가 ${threshold} 이상`, `${PICKUP_FEE_POLICY.standardPercent}%`],
            [`판매가 ${threshold} 미만`, `${PICKUP_FEE_POLICY.lowPricePercent}%`],
            ["정산일", "매월 1일"], ["방문 수거", "무료"], ["상품화 비용", "박스당 5,000원"]].map(([label, value]) => <View key={label} style={styles.feeRow}>
            <Txt style={styles.feeLabel}>{label}</Txt>
            <Txt bold style={styles.feeValue}>{value}</Txt>
          </View>)}
        </View>
        <View style={styles.notes}>
          <Txt bold style={styles.itemTitle}>신청 전 꼭 확인해 주세요</Txt>
          {PICKUP_INTRO_NOTES.map((note) => <Txt key={note} style={styles.itemBody}>· {note}</Txt>)}
        </View>
      </View>

      <View style={styles.section}>
        <Txt bold style={styles.sectionTitle}>자주 묻는 질문</Txt>
        {SELL_GUIDE_FAQS.map((faq) => <Faq key={faq.id} item={faq} />)}
      </View>
    </ScrollView>
    <View style={styles.bottom}>
      <Button icon="package" onPress={apply}>판매 신청하기</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  hero: { paddingHorizontal: space.page, paddingTop: 16, gap: 14 },
  heroImage: { borderRadius: radius.lg, backgroundColor: colors.card },
  heading: { fontSize: 26, lineHeight: 36, letterSpacing: -0.6, color: colors.primary, marginTop: 6 },
  lead: { fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  section: { paddingHorizontal: space.page, paddingTop: 36, gap: 14 },
  sectionTitle: { fontSize: 19, letterSpacing: -0.4 },
  step: { flexDirection: "row", gap: 14 },
  stepNumber: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: colors.surface, fontSize: 13 },
  stepText: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 15, lineHeight: 22 },
  itemBody: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  condition: { flexDirection: "row", gap: 12 },
  rejected: { gap: 10 },
  rejectedItem: { width: 140, gap: 6 },
  rejectedImage: { width: 140, height: 105, borderRadius: radius.md, backgroundColor: colors.card },
  rejectedLabel: { fontSize: 13, color: colors.textSecondary },
  fees: { borderRadius: radius.lg, backgroundColor: colors.secondary, paddingHorizontal: 16, paddingVertical: 6 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  feeLabel: { fontSize: 14, color: colors.textSecondary },
  feeValue: { fontSize: 15, color: colors.primary },
  notes: { gap: 6, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card },
  faq: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  faqHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 14 },
  faqQuestion: { flex: 1, fontSize: 15, lineHeight: 22 },
  faqAnswer: { fontSize: 14, lineHeight: 22, color: colors.textSecondary, paddingBottom: 16 },
  bottom: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
});
