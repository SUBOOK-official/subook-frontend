import { Alert, Linking } from "react-native";

export async function openWebsite(path) {
  const url = new URL(path, "https://subook.kr");
  if (url.origin !== "https://subook.kr") return;
  try {
    await Linking.openURL(url.href);
  } catch {
    Alert.alert("페이지를 열 수 없어요", "잠시 후 다시 시도해 주세요.");
  }
}
