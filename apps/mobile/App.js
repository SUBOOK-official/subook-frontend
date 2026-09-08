import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import CatalogScreen from "./src/screens/CatalogScreen.jsx";
import ProductScreen from "./src/screens/ProductScreen.jsx";
import ServiceScreen from "./src/screens/ServiceScreen.jsx";
import { colors } from "./src/theme.js";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const icons = { Catalog: "search", Sell: "package", MySubook: "user" };
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.surface, card: colors.surface, text: colors.text, border: colors.border } };

function MainTabs() {
  const insets = useSafeAreaInsets();
  return <Tabs.Navigator screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.muted,
    tabBarLabelStyle: { fontSize: 12, fontWeight: "600", lineHeight: 18, flexShrink: 0 },
    tabBarItemStyle: { paddingVertical: 0 },
    tabBarStyle: { height: 62 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
    tabBarIcon: ({ color, size }) => <Feather name={icons[route.name]} color={color} size={size} />,
  })}>
    <Tabs.Screen name="Catalog" component={CatalogScreen} options={{ title: "교재 찾기" }} />
    <Tabs.Screen name="Sell" component={ServiceScreen} options={{ title: "판매하기" }} initialParams={{ section: "sell" }} />
    <Tabs.Screen name="MySubook" component={ServiceScreen} options={{ title: "마이수북" }} initialParams={{ section: "account" }} />
  </Tabs.Navigator>;
}

export default function App() {
  return <SafeAreaProvider>
    <StatusBar style="dark" />
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerTintColor: colors.primary, headerShadowVisible: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Product" component={ProductScreen} options={{ title: "교재 상세", headerBackTitle: "교재 찾기" }} />
      </Stack.Navigator>
    </NavigationContainer>
  </SafeAreaProvider>;
}
