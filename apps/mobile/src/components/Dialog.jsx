import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow } from "../theme.js";
import { Txt } from "./ui.jsx";

// 앱 공통 확인창·짧은 안내(토스트). 시스템 알림창 대신 수북 디자인으로 그린다.
// showDialog(title, message, buttons)는 Alert.alert와 같은 모양으로 부른다.
//   buttons: [{ text, style: "cancel" | "destructive" | undefined, onPress }]
let openDialog = null;
let openToast = null;

export function showDialog(title, message, buttons) {
  openDialog?.({ title, message, buttons: buttons?.length ? buttons : [{ text: "확인" }] });
}

export function showToast(message) {
  openToast?.({ message, id: Date.now() });
}

function Toast({ toast, onDone }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => finished && onDone());
    return () => animation.stop();
  }, [toast.id, opacity, onDone]);
  return <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { bottom: insets.bottom + 96, opacity }]}>
    <Txt style={styles.toastText}>{toast.message}</Txt>
  </Animated.View>;
}

export function DialogHost() {
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    openDialog = setDialog;
    openToast = setToast;
    return () => {
      openDialog = null;
      openToast = null;
    };
  }, []);

  const close = (button) => {
    setDialog(null);
    button?.onPress?.();
  };
  const cancel = dialog?.buttons.find((button) => button.style === "cancel");
  const stacked = (dialog?.buttons.length ?? 0) > 2;
  // 취소가 아닌 버튼 중 마지막이 주 동작이다(Alert와 같은 순서 규칙).
  const primary = dialog?.buttons.filter((button) => button.style !== "cancel").at(-1);

  return <>
    {toast ? <Toast toast={toast} onDone={() => setToast(null)} /> : null}
    <Modal transparent statusBarTranslucent animationType="fade" visible={Boolean(dialog)} onRequestClose={() => close(cancel)}>
      {dialog ? <Pressable style={styles.backdrop} onPress={() => cancel && close(cancel)} accessible={false}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert" accessibilityViewIsModal>
          <Txt bold style={styles.title}>{dialog.title}</Txt>
          {dialog.message ? <Txt style={styles.message}>{dialog.message}</Txt> : null}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {(stacked ? [...dialog.buttons].reverse() : dialog.buttons).map((button) => {
              const quiet = button.style === "cancel";
              const danger = button.style === "destructive";
              const outlined = !quiet && !danger && button !== primary;
              return <Pressable key={button.text} accessibilityRole="button" onPress={() => close(button)}
                style={({ pressed }) => [styles.button, !stacked && styles.buttonInline, quiet ? styles.buttonQuiet : danger ? styles.buttonDanger : outlined ? styles.buttonOutlined : styles.buttonPrimary, pressed && { opacity: 0.7 }]}>
                <Txt bold style={[styles.buttonText, quiet && { color: colors.textSecondary }, outlined && { color: colors.primary }]}>{button.text}</Txt>
              </Pressable>;
            })}
          </View>
        </Pressable>
      </Pressable> : null}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 32 },
  card: { width: "100%", maxWidth: 340, borderRadius: radius.xl, backgroundColor: colors.surface, padding: 24, ...shadow.md },
  title: { fontSize: 17, lineHeight: 25, textAlign: "center" },
  message: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: "center", marginTop: 8 },
  buttons: { flexDirection: "row", gap: 8, marginTop: 22 },
  buttonsStacked: { flexDirection: "column" },
  button: { minHeight: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonInline: { flex: 1 },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonDanger: { backgroundColor: colors.danger },
  buttonOutlined: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonQuiet: { backgroundColor: colors.card },
  buttonText: { fontSize: 15, color: colors.surface },
  toast: { position: "absolute", alignSelf: "center", maxWidth: "86%", paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: "rgba(35,35,35,0.92)" },
  toastText: { color: colors.surface, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
