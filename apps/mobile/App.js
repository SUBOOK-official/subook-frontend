import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { DialogHost } from "./src/components/Dialog.jsx";
import { AuthProvider, useAuth } from "./src/context/AuthContext.jsx";
import { ShopProvider } from "./src/context/ShopContext.jsx";
import CartScreen from "./src/screens/CartScreen.jsx";
import HomeScreen from "./src/screens/HomeScreen.jsx";
import MyScreen from "./src/screens/MyScreen.jsx";
import ProductScreen from "./src/screens/ProductScreen.jsx";
import SearchScreen from "./src/screens/SearchScreen.jsx";
import SellScreen from "./src/screens/SellScreen.jsx";
import ThemeScreen from "./src/screens/ThemeScreen.jsx";
import WebScreen from "./src/screens/WebScreen.jsx";
import WishlistScreen from "./src/screens/WishlistScreen.jsx";
import { APP_SCHEME } from "./src/config.js";
import { colors, fonts } from "./src/theme.js";

// 글꼴과 로그인 상태를 읽을 때까지 시작 화면을 유지한다.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TABS = [
  { name: "Home", component: HomeScreen, title: "홈", icon: "home" },
  { name: "Search", component: SearchScreen, title: "검색", icon: "search" },
  { name: "Sell", component: SellScreen, title: "판매", icon: "package" },
  { name: "Wishlist", component: WishlistScreen, title: "찜", icon: "heart" },
  { name: "My", component: MyScreen, title: "마이", icon: "user" },
];

const fontFace = (family) => ({ fontFamily: family, fontWeight: "normal" });
const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.surface, card: colors.surface, text: colors.text, border: colors.border },
  fonts: { regular: fontFace(fonts.regular), medium: fontFace(fonts.regular), bold: fontFace(fonts.bold), heavy: fontFace(fonts.bold) },
};

// 앱 주소(subook://)로 바로 열 수 있는 화면. 목록에 없는 주소는 무시한다.
// 카드 결제 뒤 카드사 앱이 돌려보내는 subook:// 주소가 여기 걸리면 화면이 초기화되어
// 결제 중인 웹 화면이 사라지므로, 아래 형태만 받는다.
const DEEP_LINK_PREFIX = `${APP_SCHEME}://`;
const DEEP_LINK_PATH = /^(home|search|sell|cart|store\/\d+|themes\/[^/?#]+)\/?([?#].*)?$/;
const linking = {
  prefixes: [DEEP_LINK_PREFIX],
  filter: (url) => url.startsWith(DEEP_LINK_PREFIX) && DEEP_LINK_PATH.test(url.slice(DEEP_LINK_PREFIX.length)),
  config: {
    initialRouteName: "Main",
    screens: {
      Main: { screens: { Home: "home", Search: "search", Sell: "sell" } },
      Product: "store/:productId",
      Cart: "cart",
      Theme: "themes/:themeId",
    },
  },
};

function MainTabs() {
  const insets = useSafeAreaInsets();
  return <Tabs.Navigator screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
    tabBarStyle: { height: 58 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6), borderTopColor: colors.border },
    tabBarIcon: ({ color }) => <Feather name={TABS.find((tab) => tab.name === route.name)?.icon} color={color} size={22} />,
  })}>
    {TABS.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} component={tab.component} options={{ title: tab.title }} />)}
  </Tabs.Navigator>;
}

function Root({ fontsReady }) {
  const { ready } = useAuth();
  const visible = fontsReady && ready;
  useEffect(() => {
    if (visible) void SplashScreen.hideAsync().catch(() => {});
  }, [visible]);
  if (!visible) return null;
  return <NavigationContainer theme={theme} linking={linking}>
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Product" component={ProductScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Theme" component={ThemeScreen} />
      {/* 웹 화면은 아래에서 올라오고, 쓸어 넘겨 닫히지 않게 한다(주문·결제 도중 실수로 닫힘 방지). */}
      <Stack.Screen name="Web" component={WebScreen} options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
    </Stack.Navigator>
  </NavigationContainer>;
}

export default function App() {
  // 글꼴을 못 읽어도 기본 글꼴로 앱은 연다.
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require("@kfonts/line-seed-sans-kr/src/LINESeedKR-Rg.otf"),
    [fonts.bold]: require("@kfonts/line-seed-sans-kr/src/LINESeedKR-Bd.otf"),
  });
  return <SafeAreaProvider>
    <StatusBar style="dark" />
    <AuthProvider>
      <ShopProvider>
        <Root fontsReady={fontsLoaded || Boolean(fontError)} />
        <DialogHost />
      </ShopProvider>
    </AuthProvider>
  </SafeAreaProvider>;
}
