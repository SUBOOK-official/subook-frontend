import { useEffect } from "react";

// index.html의 정적 메타와 반드시 동일하게 유지 (구 식스샵 SEO 설정 이관본)
const DEFAULT_TITLE = "수북 | 수능을 위한 가장 똑똑한 선택";
const DEFAULT_DESCRIPTION =
  "당신의 수험이, 다음 사람의 시작이 됩니다. 전문 검수를 마친 새 수능 교재, 대치동 교재, 실전 모의고사를 저렴한 가격에 판매합니다.";

/**
 * 페이지별 <title> + meta description + canonical/og + JSON-LD 동적 설정.
 * react-helmet 의존 없이 mount 시점에 document를 직접 갱신.
 *
 * canonical/og:url은 window.location.origin 기반 — 도메인 전환(temp Vercel → subook.kr)
 * 전후 모두 자기 도메인으로 일관되게 잡힌다. (하드코딩 금지)
 *
 * @param {{
 *   title?: string;
 *   description?: string;
 *   noindex?: boolean;
 *   canonicalPath?: string;   // 예: "/store/123" — 지정 시 canonical+og:url 설정 (쿼리스트링 변형 정리)
 *   image?: string;           // og:image (절대/상대 모두 허용, 상대면 origin 붙임)
 *   jsonLd?: object | object[]; // schema.org 구조화 데이터
 * }} options
 */
export function usePageMeta({ title, description, noindex, canonicalPath, image, jsonLd } = {}) {
  const jsonLdKey = JSON.stringify(jsonLd ?? null);

  useEffect(() => {
    const nextTitle = title ? `${title} | 수북 SUBOOK` : DEFAULT_TITLE;
    const prevTitle = document.title;
    document.title = nextTitle;

    const descMeta = ensureMeta("name", "description");
    const prevDesc = descMeta.getAttribute("content");
    descMeta.setAttribute("content", description ?? DEFAULT_DESCRIPTION);

    const ogTitleMeta = ensureMeta("property", "og:title");
    const prevOgTitle = ogTitleMeta.getAttribute("content");
    ogTitleMeta.setAttribute("content", nextTitle);

    const ogDescMeta = ensureMeta("property", "og:description");
    const prevOgDesc = ogDescMeta.getAttribute("content");
    ogDescMeta.setAttribute("content", description ?? DEFAULT_DESCRIPTION);

    let prevRobots = null;
    let robotsMeta = null;
    if (noindex) {
      robotsMeta = ensureMeta("name", "robots");
      prevRobots = robotsMeta.getAttribute("content");
      robotsMeta.setAttribute("content", "noindex, nofollow");
    }

    // canonical + og:url — 라우트별 정본 URL (쿼리스트링 변형의 색인 분산 방지)
    const origin = window.location.origin;
    let canonicalLink = null;
    let prevCanonical = null;
    let ogUrlMeta = null;
    let prevOgUrl = null;
    if (canonicalPath) {
      const canonicalUrl = `${origin}${canonicalPath.startsWith("/") ? "" : "/"}${canonicalPath}`;
      canonicalLink = ensureLink("canonical");
      prevCanonical = canonicalLink.getAttribute("href");
      canonicalLink.setAttribute("href", canonicalUrl);

      ogUrlMeta = ensureMeta("property", "og:url");
      prevOgUrl = ogUrlMeta.getAttribute("content");
      ogUrlMeta.setAttribute("content", canonicalUrl);
    }

    // og:image — 상품 커버 등 페이지 대표 이미지 (카톡/SNS 공유 미리보기)
    let ogImageMeta = null;
    let prevOgImage = null;
    if (image) {
      const absoluteImage = /^https?:\/\//i.test(image)
        ? image
        : `${origin}${image.startsWith("/") ? "" : "/"}${image}`;
      ogImageMeta = ensureMeta("property", "og:image");
      prevOgImage = ogImageMeta.getAttribute("content");
      ogImageMeta.setAttribute("content", absoluteImage);
    }

    // JSON-LD — 이 훅이 만든 스크립트만 정리하도록 data 마커 사용
    let jsonLdScript = null;
    if (jsonLd) {
      jsonLdScript = document.createElement("script");
      jsonLdScript.type = "application/ld+json";
      jsonLdScript.dataset.pageMeta = "true";
      jsonLdScript.textContent = jsonLdKey;
      document.head.appendChild(jsonLdScript);
    }

    return () => {
      document.title = prevTitle;
      if (prevDesc != null) descMeta.setAttribute("content", prevDesc);
      if (prevOgTitle != null) ogTitleMeta.setAttribute("content", prevOgTitle);
      if (prevOgDesc != null) ogDescMeta.setAttribute("content", prevOgDesc);
      if (robotsMeta && prevRobots != null) robotsMeta.setAttribute("content", prevRobots);
      if (robotsMeta && prevRobots == null) robotsMeta.remove();
      if (canonicalLink) {
        if (prevCanonical != null) canonicalLink.setAttribute("href", prevCanonical);
        else canonicalLink.remove();
      }
      if (ogUrlMeta) {
        if (prevOgUrl != null) ogUrlMeta.setAttribute("content", prevOgUrl);
        else ogUrlMeta.remove();
      }
      if (ogImageMeta) {
        if (prevOgImage != null) ogImageMeta.setAttribute("content", prevOgImage);
        else ogImageMeta.remove();
      }
      if (jsonLdScript) {
        jsonLdScript.remove();
      }
    };
    // jsonLd 객체는 매 렌더 새 참조라 직렬화 키로 비교
  }, [title, description, noindex, canonicalPath, image, jsonLdKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

function ensureMeta(attr, value) {
  let el = document.querySelector(`meta[${attr}="${value}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  return el;
}

function ensureLink(rel) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  return el;
}
