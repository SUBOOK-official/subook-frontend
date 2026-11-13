import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { canShowFortune, drawFortune, optOutFortune, useShake } from "../lib/fortune.js";
import { successFeedback, tapFeedback } from "../lib/haptics.js";
import { colors, radius, shadow } from "../theme.js";
import { Txt } from "./ui.jsx";

// 홈에 포춘쿠키가 떠 있고, 휴대폰을 흔들거나 누르면 깨지면서 오늘의 한마디가 나온다.
// 하루 한 번·"보지 않기"·문구는 웹 홈 포춘쿠키와 같은 규칙이다.
// 쿠키는 이모지를 그대로 쓴다(사용자가 지정한 예외 — 디자인 규칙의 이모지 금지 대상이 아님).
const COOKIE = "🥠";
const APPEAR_DELAY_MS = 1500;
const useNative = Platform.OS !== "web";

function CookieEmoji({ size }) {
  return <Text style={{ fontSize: size, lineHeight: Math.round(size * 1.25) }} allowFontScaling={false}>{COOKIE}</Text>;
}

// 쿠키 반쪽(왼쪽·오른쪽을 잘라 보여 주고 갈라지는 동안 벌어진다)
function CookieHalf({ side, size, progress }) {
  const direction = side === "left" ? -1 : 1;
  const half = Math.round(size * 0.62);
  return <Animated.View style={{
    width: half,
    height: Math.round(size * 1.3),
    overflow: "hidden",
    alignItems: side === "left" ? "flex-start" : "flex-end",
    opacity: progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, direction * size * 0.55] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.35] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${direction * 28}deg`] }) },
    ],
  }}>
    <View style={{ width: half * 2, alignItems: "center" }}><CookieEmoji size={size} /></View>
  </Animated.View>;
}

export function FortuneCookie({ active }) {
  // hidden → floating(홈에 떠 있음) → ready(크게 보여 주고 흔들기 대기) → cracking → open → hidden
  const [phase, setPhase] = useState("hidden");
  const [message, setMessage] = useState("");
  const drift = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  const crack = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduceMotion.current = Boolean(value);
    }).catch(() => {});
    const timer = setTimeout(() => {
      void canShowFortune().then((ok) => {
        if (alive && ok) setPhase("floating");
      });
    }, APPEAR_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // 떠 있는 동안 천천히 흔들린다.
  useEffect(() => {
    if (phase !== "floating" && phase !== "ready") return undefined;
    const target = phase === "floating" ? drift : wobble;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(target, { toValue: 1, duration: phase === "floating" ? 2600 : 700, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
      Animated.timing(target, { toValue: 0, duration: phase === "floating" ? 2600 : 700, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
    ]));
    if (!reduceMotion.current) loop.start();
    return () => loop.stop();
  }, [phase, drift, wobble]);

  const breakCookie = useCallback(() => {
    if (phase !== "floating" && phase !== "ready") return;
    setMessage(drawFortune());
    successFeedback();
    crack.setValue(0);
    reveal.setValue(0);
    if (reduceMotion.current) {
      crack.setValue(1);
      reveal.setValue(1);
      setPhase("open");
      return;
    }
    setPhase("cracking");
    Animated.sequence([
      Animated.timing(crack, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }),
      Animated.timing(reveal, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }),
    ]).start(() => setPhase("open"));
  }, [phase, crack, reveal]);

  // 홈이 보이는 동안 흔들면 바로 깨진다.
  useShake(breakCookie, active && (phase === "floating" || phase === "ready"));

  const close = () => setPhase("hidden");
  const stop = () => {
    optOutFortune();
    close();
  };

  if (phase === "hidden" || (!active && phase === "floating")) return null;

  if (phase === "floating") {
    return <Animated.View pointerEvents="box-none" style={[styles.floating, {
      transform: [
        { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
        { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "8deg"] }) },
      ],
    }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="포춘쿠키 열기 — 오늘의 한마디" hitSlop={10}
        onPress={() => { tapFeedback(); setPhase("ready"); }}>
        <CookieEmoji size={44} />
      </Pressable>
    </Animated.View>;
  }

  const showMessage = phase === "cracking" || phase === "open";
  return <Modal transparent statusBarTranslucent animationType="fade" visible onRequestClose={close}>
    <Pressable style={styles.backdrop} onPress={close} accessible={false}>
      <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12} onPress={close} style={styles.close}>
          <Feather name="x" size={20} color={colors.muted} />
        </Pressable>

        {phase === "ready" ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="포춘쿠키 깨기" onPress={breakCookie} style={styles.stage}>
            <Animated.View style={{ transform: [{ rotate: wobble.interpolate({ inputRange: [0, 1], outputRange: ["-9deg", "9deg"] }) }] }}>
              <CookieEmoji size={96} />
            </Animated.View>
          </Pressable>
          <Txt bold style={styles.hint}>흔들어서 깨 보세요</Txt>
        </> : <>
          <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.halves}>
              <CookieHalf side="left" size={96} progress={crack} />
              <CookieHalf side="right" size={96} progress={crack} />
            </View>
          </View>
          {showMessage && <Animated.View style={[styles.note, {
            opacity: reveal,
            transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          }]} accessibilityLiveRegion="polite">
            <Txt style={styles.label}>오늘의 포춘쿠키</Txt>
            <Txt bold style={styles.message}>{message}</Txt>
          </Animated.View>}
          {phase === "open" && <>
            <Txt style={styles.sub}>내일 또 만나요</Txt>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={stop} style={styles.optout}>
              <Txt style={styles.optoutText}>앞으로 포춘쿠키를 보지 않을래요</Txt>
            </Pressable>
          </>}
        </>}
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  floating: { position: "absolute", top: "24%", right: "10%", zIndex: 5 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 340, minHeight: 300, borderRadius: radius.xl, backgroundColor: colors.surface, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22, alignItems: "center", ...shadow.md },
  close: { position: "absolute", top: 12, right: 12, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  stage: { height: 132, alignItems: "center", justifyContent: "center" },
  halves: { flexDirection: "row", alignItems: "center" },
  hint: { fontSize: 17, color: colors.primary, marginTop: 18 },
  note: { alignSelf: "stretch", marginTop: -34, paddingVertical: 20, paddingHorizontal: 18, borderRadius: radius.lg, backgroundColor: colors.secondary, alignItems: "center", gap: 10 },
  label: { fontSize: 12, color: colors.muted },
  message: { fontSize: 18, lineHeight: 27, textAlign: "center", color: colors.primary, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: colors.textSecondary, marginTop: 18 },
  optout: { marginTop: 10, paddingVertical: 6 },
  optoutText: { fontSize: 12, color: colors.muted, textDecorationLine: "underline" },
});
