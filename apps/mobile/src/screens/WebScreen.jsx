import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import { APP_MESSAGE, isExternalAppUrl, resolveNativeRoute } from "../../../../packages/shared-domain/src/appBridge.js";
import { Feedback, ScreenHeader } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useShop } from "../context/ShopContext.jsx";
import { APP_SCHEME, APP_USER_AGENT, SITE_ORIGIN } from "../config.js";
import { TAB_SCREENS, goToTab, openNativeRoute, openSiteLink } from "../lib/siteLinks.js";
import { supabase } from "../lib/supabase.js";
import { buildBootstrapScript, buildSessionUpdateScript, openExternalAppUrl } from "../lib/webBridge.js";
import { colors } from "../theme.js";

// 수북 주소만 연다. 다른 사이트 주소가 들어오면 홈으로 바꾼다.
function toSiteUrl(path) {
  try {
    const url = new URL(typeof path === "string" && path ? path : "/", SITE_ORIGIN);
    return url.origin === SITE_ORIGIN ? url.href : `${SITE_ORIGIN}/`;
  } catch {
    return `${SITE_ORIGIN}/`;
  }
}

function isSiteUrl(value) {
  try {
    return new URL(value).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

function refreshTokenOf(sessionJson) {
  if (!sessionJson) return null;
  try {
    return JSON.parse(sessionJson)?.refresh_token ?? null;
  } catch {
    return null;
  }
}

// 결제 뒤 카드사 앱이 수북 앱으로 돌아올 때 쓰는 주소(subook://). 이미 이 화면이라 따로 열지 않는다.
function isOwnAppUrl(url) {
  return url.toLowerCase().startsWith(`${APP_SCHEME}:`);
}

// 앱 안 웹 화면: 주문·결제, 판매 신청, 마이페이지, 로그인 등 subook.kr 화면을 그대로 쓴다.
// 로그인 세션은 앱이 넣어 주고, 웹에서 바뀐 세션은 앱이 받아 온다
// (약속은 packages/shared-domain/src/appBridge.js).
export default function WebScreen({ route, navigation }) {
  const { path, title, checkout } = route.params ?? {};
  const uri = useMemo(() => toSiteUrl(path), [path]);
  const insets = useSafeAreaInsets();
  const { session, adoptWebSession } = useAuth();
  const { refreshCart, refreshWishlist } = useShop();
  const webRef = useRef(null);
  const canGoBack = useRef(false);
  // 웹 화면에 들어 있는 세션(undefined = 아직 준비 전)
  const [sessionJson, setSessionJson] = useState(undefined);
  const sessionJsonRef = useRef(undefined);
  const webToken = useRef(undefined);
  const appToken = useRef(session?.refresh_token ?? null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [webKey, setWebKey] = useState(0);

  const putSession = useCallback((next) => {
    sessionJsonRef.current = next;
    webToken.current = refreshTokenOf(next);
    setSessionJson(next);
  }, []);

  // 열기 전에 세션을 확인한다(만료됐으면 여기서 갱신된다).
  useEffect(() => {
    let active = true;
    (async () => {
      let current = null;
      try {
        current = supabase ? (await supabase.auth.getSession()).data.session : null;
      } catch {
        current = null;
      }
      if (active) putSession(current ? JSON.stringify(current) : null);
    })();
    return () => {
      active = false;
    };
  }, [putSession]);

  // 앱 쪽 세션이 바뀌면(토큰 갱신·로그아웃) 열려 있는 웹 화면에 반영한다.
  // 웹에서 시작된 변경이 앱에 반영된 경우는 다시 보내지 않는다.
  useEffect(() => {
    const token = session?.refresh_token ?? null;
    if (token === appToken.current) return;
    appToken.current = token;
    if (sessionJsonRef.current === undefined || token === webToken.current) return;
    const next = session ? JSON.stringify(session) : null;
    putSession(next);
    webRef.current?.injectJavaScript(buildSessionUpdateScript(next));
  }, [session, putSession]);

  // 웹 화면에서 주문·찜이 바뀌었을 수 있으니 닫힐 때 새로 고친다.
  useEffect(() => () => {
    void refreshCart();
    void refreshWishlist();
  }, [refreshCart, refreshWishlist]);

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else goToTab(navigation, "Home");
  }, [navigation]);

  // Android 뒤로 버튼: 웹 화면 안에서 먼저 뒤로 가고, 더 갈 곳이 없으면 닫는다.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []));

  const onMessage = useCallback((event) => {
    // 수북 화면이 보낸 것만 받는다(결제창 등 다른 사이트 화면은 무시).
    if (!isSiteUrl(event.nativeEvent.url)) return;
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message?.type === APP_MESSAGE.READY) {
      if (sessionJsonRef.current !== undefined) {
        webRef.current?.injectJavaScript(buildBootstrapScript({ sessionJson: sessionJsonRef.current, checkout }));
      }
    } else if (message?.type === APP_MESSAGE.AUTH) {
      if (message.event !== "set" && message.event !== "remove") return;
      const next = message.event === "set" && typeof message.session === "string" ? message.session : null;
      putSession(next);
      void adoptWebSession(next);
    } else if (message?.type === APP_MESSAGE.NAVIGATE) {
      const target = resolveNativeRoute(message.href);
      if (!target) return;
      // 링크가 아닌 방식으로 이미 그 경로에 들어선 경우: 웹은 이전 화면으로 되돌리거나 닫는다.
      if (message.mode === "push") webRef.current?.goBack();
      else if (message.mode === "replace" && !TAB_SCREENS.has(target.screen) && navigation.canGoBack()) navigation.goBack();
      openNativeRoute(navigation, target);
    } else if (message?.type === APP_MESSAGE.OPEN) {
      if (typeof message.href === "string") openSiteLink(navigation, message.href);
    } else if (message?.type === APP_MESSAGE.CLOSE) {
      close();
    } else if (message?.type === APP_MESSAGE.CART) {
      void refreshCart();
    }
  }, [adoptWebSession, checkout, close, navigation, putSession, refreshCart]);

  // 카드사·은행·본인인증 앱 호출(ispmobile://, intent:// 등)과 전화·메일 링크는 앱이 직접 연다.
  const onShouldStartLoad = useCallback((request) => {
    const url = request.url ?? "";
    if (!isExternalAppUrl(url)) return true;
    if (!isOwnAppUrl(url)) void openExternalAppUrl(url);
    return false;
  }, []);

  const onError = useCallback((event) => {
    event.preventDefault();
    const url = event.nativeEvent.url ?? "";
    if (isExternalAppUrl(url)) {
      if (!isOwnAppUrl(url)) void openExternalAppUrl(url);
      return;
    }
    setFailed(true);
  }, []);

  const reload = useCallback(() => {
    setFailed(false);
    setProgress(0);
    setWebKey((value) => value + 1);
  }, []);

  const bootstrapScript = useMemo(
    () => (sessionJson === undefined ? "" : buildBootstrapScript({ sessionJson, checkout })),
    [sessionJson, checkout],
  );

  const header = <ScreenHeader title={title || "수북"} onBack={close} backIcon="x" backLabel="닫기" />;

  // 개발용 웹 미리보기에는 웹 화면 부품이 없다.
  if (Platform.OS === "web") {
    return <View style={styles.screen}>
      {header}
      <Feedback icon="smartphone" title="앱에서 열리는 화면이에요" message={uri} actionLabel="브라우저로 열기"
        onAction={() => void WebBrowser.openBrowserAsync(uri)} />
    </View>;
  }

  return <View style={styles.screen}>
    {header}
    {/* 하단 탭이 없는 화면이라 홈 표시줄·제스처 영역만큼 띄운다. */}
    <View style={[styles.body, { paddingBottom: insets.bottom }]}>
      {sessionJson === undefined ? <Feedback loading /> : <WebView
        key={webKey}
        ref={webRef}
        source={{ uri }}
        style={styles.web}
        originWhitelist={["*"]}
        applicationNameForUserAgent={APP_USER_AGENT}
        injectedJavaScriptBeforeContentLoaded={bootstrapScript}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        onNavigationStateChange={(state) => { canGoBack.current = state.canGoBack; }}
        onLoadProgress={(event) => setProgress(event.nativeEvent.progress)}
        onError={onError}
        onContentProcessDidTerminate={reload}
        onRenderProcessGone={reload}
        // 나이스페이 앱 연동 가이드의 WebView 설정
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        domStorageEnabled
        // 화면 동작
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        allowsLinkPreview={false}
        dataDetectorTypes="none"
        decelerationRate="normal"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        setBuiltInZoomControls={false}
        textZoom={100}
        overScrollMode="never"
        webviewDebuggingEnabled={process.env.NODE_ENV !== "production"}
      />}
      {progress < 1 && !failed && sessionJson !== undefined
        ? <View style={[styles.progress, { width: `${Math.max(8, progress * 100)}%` }]} /> : null}
      {failed ? <View style={styles.failed}>
        <Feedback icon="wifi-off" title="화면을 불러오지 못했어요" message="인터넷 연결을 확인하고 다시 시도해 주세요." onAction={reload} />
      </View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1 },
  web: { flex: 1, backgroundColor: colors.surface },
  progress: { position: "absolute", top: 0, left: 0, height: 2, backgroundColor: colors.primary },
  failed: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, justifyContent: "center" },
});
