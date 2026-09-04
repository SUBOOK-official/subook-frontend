// 콜라보 전용 상세페이지 — 일반 교재의 상세 정보(AI 요약 + 검수 사진 + 검수 리포트)
// 대신, 디자인팀이 만든 상세페이지 이미지를 그대로 세로로 이어 붙여 보여준다.
//
// 원본은 Figma 한 장짜리 세로 이미지(2000×약 20,000px)라 그대로 쓰면 너무 무거워서,
// 디자인상의 섹션 경계에서 9장으로 잘라 WebP로 변환해 두었다(장당 40~100KB).
// 잘린 조각을 틈 없이 이어 붙이는 게 전제라 CSS에서 display:block + width:100%로
// 붙이고, 조각 사이 여백을 절대 주지 않는다.
//
// key는 publicFeaturedProducts.js의 레지스트리 key와 같다. 여기 DETAIL_IMAGE_HEIGHTS에
// 없는 key는 전용 상세페이지가 없는 상품이라 일반 포맷으로 폴백된다.

import { useEffect, useRef } from "react";
import { trackEvent, trackException } from "../lib/analytics";
import { useInViewOnce } from "../lib/useInViewOnce";

// assets/product-detail/<key>/01.webp ... 09.webp
const detailImageModules = import.meta.glob("../assets/product-detail/*/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

// 슬라이스 원본 픽셀 크기 — width/height를 명시해 12,000px짜리 레이아웃 점프를 막는다.
// ⚠ 이미지를 다시 내보내면 이 높이 배열도 함께 갱신할 것.
const DETAIL_IMAGE_WIDTH = 1201;
const DETAIL_IMAGE_HEIGHTS = {
  "j1-full": [934, 767, 1394, 1879, 1258, 1257, 1418, 1778, 1250],
  "j1-mini": [934, 767, 1394, 2216, 1151, 1419, 1417, 1797, 1250],
};

function buildDetailImages(key) {
  const heights = DETAIL_IMAGE_HEIGHTS[key];

  if (!heights) {
    return [];
  }

  return Object.entries(detailImageModules)
    .filter(([path]) => path.includes(`/product-detail/${key}/`))
    // 파일명이 01..09 제로패딩이라 경로 사전순 = 위에서 아래 순서.
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, src], index) => ({
      src,
      width: DETAIL_IMAGE_WIDTH,
      height: heights[index] ?? null,
    }));
}

const DETAIL_IMAGES = Object.fromEntries(
  Object.keys(DETAIL_IMAGE_HEIGHTS).map((key) => [key, buildDetailImages(key)]),
);

export function hasFeaturedProductDetail(key) {
  return Boolean(key) && (DETAIL_IMAGES[key]?.length ?? 0) > 0;
}

// 상세 이미지 열람 깊이 마일스톤(%) — 슬라이스가 화면에 들어온 순간의 누적 비율로 판정.
const SCROLL_DEPTH_MILESTONES = [25, 50, 75, 100];

function FeaturedProductDetail({ detailKey, title, productId }) {
  const images = DETAIL_IMAGES[detailKey] ?? [];
  const containerRef = useRef(null);
  const firedDepthsRef = useRef(new Set());
  const sliceCount = images.length;

  // GA4 featured_detail_view — 콜라보 상세 이미지가 실제로 화면에 들어온 순간 1회
  useInViewOnce(
    containerRef,
    () => {
      trackEvent("featured_detail_view", {
        detailKey,
        sliceCount,
        ...(productId != null ? { itemId: String(productId) } : {}),
      });
    },
    { enabled: sliceCount > 0, resetKey: detailKey },
  );

  // GA4 featured_detail_scroll — 슬라이스 노출을 열람 깊이(25/50/75/100%)로 환산해 각 1회
  useEffect(() => {
    firedDepthsRef.current = new Set();
  }, [detailKey]);

  useEffect(() => {
    if (sliceCount === 0) return undefined;
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return undefined;
    const slices = Array.from(
      container.querySelectorAll(".public-detail-featured__slice"),
    );
    if (slices.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number(entry.target.dataset.sliceIndex);
          if (!Number.isFinite(index)) continue;
          const depthPct = ((index + 1) / sliceCount) * 100;
          for (const milestone of SCROLL_DEPTH_MILESTONES) {
            if (milestone > depthPct) continue;
            if (firedDepthsRef.current.has(milestone)) continue;
            firedDepthsRef.current.add(milestone);
            trackEvent("featured_detail_scroll", {
              detailKey,
              sliceIndex: index,
              depthPct: milestone,
              ...(productId != null ? { itemId: String(productId) } : {}),
            });
          }
        }
      },
      { threshold: 0.25 },
    );
    slices.forEach((slice) => observer.observe(slice));
    return () => observer.disconnect();
  }, [detailKey, productId, sliceCount]);

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="public-detail-featured" ref={containerRef}>
      {/* 본문이 전부 이미지라 텍스트 대안이 없다. 최소한 섹션 제목은 읽히도록 둔다. */}
      <h3 className="public-visually-hidden">{title ? `${title} 상세 정보` : "상세 정보"}</h3>
      {images.map((image, index) => (
        <img
          alt=""
          className="public-detail-featured__slice"
          data-slice-index={index}
          decoding="async"
          draggable={false}
          height={image.height ?? undefined}
          key={image.src}
          // 첫 두 장은 접히는 화면 근처라 바로 받고, 나머지는 스크롤할 때 받는다.
          loading={index < 2 ? "eager" : "lazy"}
          // GA4 exception — 상세 이미지가 통째로 안 뜨는 사고(본문 전체가 이미지라 치명적)
          onError={() => {
            trackException("featured_detail_image_failed", {
              detailKey,
              sliceIndex: index,
              ...(productId != null ? { itemId: String(productId) } : {}),
            });
          }}
          src={image.src}
          width={image.width}
        />
      ))}
    </div>
  );
}

export default FeaturedProductDetail;
