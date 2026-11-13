import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";

// 콜라보 전용 상세페이지 이미지(웹 FeaturedProductDetail과 같은 파일).
// 한 장짜리 세로 이미지를 9조각으로 자른 것이라 틈 없이 이어 붙인다.
// key는 public-web/src/lib/publicFeaturedProducts.js 레지스트리의 key(또는 detailKey).
// 새 콜라보 상세 이미지가 추가되면 여기에도 등록해야 앱에 보인다(번들에 포함되는 정적 목록).
const DETAIL_IMAGES = {
  "j1-full": [
    require("../../../public-web/src/assets/product-detail/j1-full/01.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/02.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/03.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/04.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/05.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/06.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/07.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/08.webp"),
    require("../../../public-web/src/assets/product-detail/j1-full/09.webp"),
  ],
  "j1-mini": [
    require("../../../public-web/src/assets/product-detail/j1-mini/01.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/02.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/03.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/04.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/05.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/06.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/07.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/08.webp"),
    require("../../../public-web/src/assets/product-detail/j1-mini/09.webp"),
  ],
};

// 조각 원본은 가로 1201px, 세로 1400px(마지막 조각만 더 짧다). 실제 비율은 불러온 뒤 맞춘다.
const DEFAULT_RATIO = 1201 / 1400;

export function hasFeaturedDetailImages(key) {
  return Boolean(key) && Boolean(DETAIL_IMAGES[key]);
}

function Slice({ source, width, label }) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  return <Image source={source} style={{ width, height: width / ratio }} contentFit="cover" accessibilityLabel={label}
    onLoad={(event) => {
      const { width: w, height: h } = event.source ?? {};
      if (w > 0 && h > 0) setRatio(w / h);
    }} />;
}

export function FeaturedDetailImages({ detailKey, title }) {
  const { width } = useWindowDimensions();
  const images = DETAIL_IMAGES[detailKey];
  if (!images) return null;
  const imageWidth = Math.min(width, 720);
  return <View style={{ alignItems: "center" }}>
    {images.map((source, index) => <Slice key={index} source={source} width={imageWidth}
      label={index === 0 ? `${title} 상세 안내` : undefined} />)}
  </View>;
}
