import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Accelerometer } from "expo-sensors";
import { FORTUNE_COOKIE_MESSAGES } from "../../../public-web/src/lib/fortuneCookieMessages.js";

// 포춘쿠키 규칙은 웹 홈과 같다: 하루 한 번, "보지 않기"는 계속 유지. 이 기기에만 저장한다.
const LAST_KEY = "subook.fortune.last";
const OPTOUT_KEY = "subook.fortune.optout";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// 오늘 쿠키를 띄워도 되는지
export async function canShowFortune() {
  try {
    const [[, optout], [, last]] = await AsyncStorage.multiGet([OPTOUT_KEY, LAST_KEY]);
    return optout !== "1" && last !== today();
  } catch {
    return false;
  }
}

// 문구를 하나 뽑고 오늘 날짜를 남긴다(문구 원본은 웹과 같은 파일).
export function drawFortune() {
  const message = FORTUNE_COOKIE_MESSAGES[Math.floor(Math.random() * FORTUNE_COOKIE_MESSAGES.length)] ?? "";
  void AsyncStorage.setItem(LAST_KEY, today()).catch(() => {});
  return message;
}

export function optOutFortune() {
  void AsyncStorage.setItem(OPTOUT_KEY, "1").catch(() => {});
}

// 휴대폰을 흔들었을 때 onShake를 부른다.
// 가속도 크기가 평소(1g)보다 크게 벗어나는 순간이 짧은 시간 안에 두 번 나오면 흔든 것으로 본다.
const SHAKE_FORCE = 1.1; // 1g에서 벗어난 정도(g)
const SHAKE_WINDOW_MS = 700;
const SHAKE_COOLDOWN_MS = 1500;

export function useShake(onShake, enabled) {
  const handler = useRef(onShake);
  handler.current = onShake;

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return undefined;
    let subscription = null;
    let disposed = false;
    let firstHitAt = 0;
    let lastFiredAt = 0;

    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (!available || disposed) return;
        Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const force = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
          if (force < SHAKE_FORCE) return;
          const now = Date.now();
          if (now - lastFiredAt < SHAKE_COOLDOWN_MS) return;
          if (now - firstHitAt > SHAKE_WINDOW_MS) {
            firstHitAt = now;
            return;
          }
          firstHitAt = 0;
          lastFiredAt = now;
          handler.current?.();
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [enabled]);
}
