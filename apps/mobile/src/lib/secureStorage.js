import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// 로그인 세션은 기기 보안 저장소(iOS Keychain / Android Keystore)에 둔다.
// 일부 iOS는 2KB 넘는 값을 거부하므로 조각으로 나눠 저장한다(Expo SecureStore 문서).
// 키에는 영문·숫자·. - _만 쓸 수 있다.
const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 32;

function safeKey(key) {
  return String(key).replace(/[^A-Za-z0-9._-]/g, "_");
}

const webStorage = {
  async getItem(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  async setItem(key, value) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* 미리보기 전용 */ }
  },
  async removeItem(key) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* 미리보기 전용 */ }
  },
};

async function readCount(base) {
  const count = Number(await SecureStore.getItemAsync(`${base}.n`));
  return Number.isInteger(count) && count > 0 && count <= MAX_CHUNKS ? count : 0;
}

async function removeChunks(base, from, to) {
  for (let index = from; index < to; index += 1) {
    await SecureStore.deleteItemAsync(`${base}.${index}`);
  }
}

const nativeStorage = {
  async getItem(key) {
    const base = safeKey(key);
    const count = await readCount(base);
    if (!count) return null;
    let value = "";
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(`${base}.${index}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(key, value) {
    const base = safeKey(key);
    const text = String(value);
    const count = Math.max(1, Math.ceil(text.length / CHUNK_SIZE));
    if (count > MAX_CHUNKS) throw new Error("저장할 값이 너무 커요.");
    const previous = await readCount(base);
    for (let index = 0; index < count; index += 1) {
      await SecureStore.setItemAsync(`${base}.${index}`, text.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${base}.n`, String(count));
    await removeChunks(base, count, previous);
  },
  async removeItem(key) {
    const base = safeKey(key);
    const previous = await readCount(base);
    await SecureStore.deleteItemAsync(`${base}.n`);
    await removeChunks(base, 0, previous);
  },
};

export const secureStorage = Platform.OS === "web" ? webStorage : nativeStorage;
