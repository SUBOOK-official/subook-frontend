import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { promotionDismissKey } from "../../../../packages/shared-domain/src/sitePromotions.js";
import { openSiteLink } from "../lib/siteLinks.js";
import { colors, radius } from "../theme.js";
import { Txt } from "./ui.jsx";

// 닫은 팝업은 그날 다시 띄우지 않는다(이 기기에만 저장).
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function readDismissed(ids) {
  try {
    const pairs = await AsyncStorage.multiGet(ids.map(promotionDismissKey));
    const day = today();
    return new Set(ids.filter((_, index) => pairs[index]?.[1] === day));
  } catch {
    return new Set();
  }
}

// 어드민에서 올린 홈 팝업 배너(/admin/promotions의 home_popup). 한 번에 하나씩 보여 준다.
export function HomePopup({ popups }) {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [dismissed, setDismissed] = useState(null);
  const [ratio, setRatio] = useState(1);
  const key = popups.map((popup) => popup.id).join(",");

  useEffect(() => {
    let active = true;
    if (!key) return undefined;
    void readDismissed(key.split(",")).then((set) => {
      if (active) setDismissed(set);
    });
    return () => {
      active = false;
    };
  }, [key]);

  const popup = dismissed ? popups.find((item) => !dismissed.has(item.id)) : null;
  if (!popup) return null;

  const close = () => {
    setDismissed((current) => new Set([...(current ?? []), popup.id]));
    void AsyncStorage.setItem(promotionDismissKey(popup.id), today()).catch(() => {});
  };
  const open = () => {
    close();
    if (popup.href) openSiteLink(navigation, popup.href, popup.title);
  };
  const panelWidth = Math.min(width - 56, 340);

  return <Modal transparent statusBarTranslucent animationType="fade" visible onRequestClose={close}>
    <Pressable style={styles.backdrop} onPress={close} accessible={false}>
      <View style={[styles.panel, { width: panelWidth }]}>
        <Pressable accessibilityRole={popup.href ? "link" : "image"} accessibilityLabel={popup.title} disabled={!popup.href} onPress={open}>
          <Image source={popup.imageUrl} style={{ width: panelWidth, height: panelWidth / ratio }} contentFit="cover"
            onLoad={(event) => {
              const { width: w, height: h } = event.source ?? {};
              if (w > 0 && h > 0) setRatio(Math.max(0.5, Math.min(w / h, 2)));
            }} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.close, pressed && { backgroundColor: colors.card }]}>
          <Feather name="x" size={16} color={colors.textSecondary} />
          <Txt style={styles.closeText}>닫기</Txt>
        </Pressable>
      </View>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center" },
  panel: { borderRadius: radius.xl, backgroundColor: colors.surface, overflow: "hidden" },
  close: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  closeText: { fontSize: 14, color: colors.textSecondary },
});
