import AsyncStorage from "@react-native-async-storage/async-storage";

// 최근 검색어는 이 기기에만 저장한다(서버로 보내지 않음).
const KEY = "subook.recentSearches.v1";
const MAX = 10;

export async function readRecentSearches() {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
    return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

async function write(list) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장 공간 문제는 검색 자체를 막지 않는다.
  }
  return list.slice(0, MAX);
}

export async function addRecentSearch(keyword) {
  const value = String(keyword ?? "").trim().slice(0, 100);
  const list = await readRecentSearches();
  if (!value) return list;
  return write([value, ...list.filter((item) => item !== value)]);
}

export async function removeRecentSearch(keyword) {
  return write((await readRecentSearches()).filter((item) => item !== keyword));
}

export async function clearRecentSearches() {
  return write([]);
}
