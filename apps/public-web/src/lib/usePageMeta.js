import { useEffect } from "react";

const DEFAULT_TITLE = "수북 SUBOOK — 수능 교재 위탁판매 플랫폼";
const DEFAULT_DESCRIPTION =
  "수험생을 위한 안 쓰는 수능 교재 위탁판매. CJ 픽업, 검수, 안전결제까지 수북이 책임집니다.";

/**
 * 페이지별 <title> + meta description 동적 설정.
 * react-helmet 의존 없이 mount 시점에 document를 직접 갱신.
 *
 * @param {{ title?: string; description?: string; noindex?: boolean }} options
 */
export function usePageMeta({ title, description, noindex } = {}) {
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

    return () => {
      document.title = prevTitle;
      if (prevDesc != null) descMeta.setAttribute("content", prevDesc);
      if (prevOgTitle != null) ogTitleMeta.setAttribute("content", prevOgTitle);
      if (prevOgDesc != null) ogDescMeta.setAttribute("content", prevOgDesc);
      if (robotsMeta && prevRobots != null) robotsMeta.setAttribute("content", prevRobots);
      if (robotsMeta && prevRobots == null) robotsMeta.remove();
    };
  }, [title, description, noindex]);
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
