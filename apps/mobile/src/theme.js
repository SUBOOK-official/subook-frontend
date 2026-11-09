// public-web/src/index.css의 브랜드 토큰과 같은 값만 쓴다(임의 색 추가 금지).
export const colors = {
  primary: "#080F47",
  primaryPressed: "#050933",
  primarySoft: "#111D73",
  secondary: "#F3FBFF",
  surface: "#FFFFFF",
  card: "#F4F4F4",
  text: "#232323",
  textSecondary: "#55565B",
  muted: "#6E6E73",
  border: "#E5E5E5",
  divider: "#F0F0F0",
  danger: "#D0342C",
  accent: "#FF4A4A",
  success: "#2E7D4F",
  overlay: "rgba(8, 15, 71, 0.45)",
};

// 4/6/8/12/16/999 스케일만 사용
export const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, page: 20 };

export const fonts = {
  regular: "LINESeedKR-Rg",
  bold: "LINESeedKR-Bd",
};

export const shadow = {
  sm: { shadowColor: "#14181C", shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#14181C", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
};

export const logoSource = require("../../public-web/src/assets/brand/logo-horizontal.png");
