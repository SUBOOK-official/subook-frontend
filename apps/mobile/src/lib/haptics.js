import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// 손끝 반응. 지원하지 않는 기기·웹 미리보기에서는 조용히 넘어간다.
export function tapFeedback() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
}

export function successFeedback() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function errorFeedback() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
