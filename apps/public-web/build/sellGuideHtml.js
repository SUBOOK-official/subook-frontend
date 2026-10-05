import {
  SELL_GUIDE_META, SELL_GUIDE_HEADING, SELL_GUIDE_LEAD, SELL_GUIDE_STEPS,
  SELL_GUIDE_CONDITIONS, SELL_GUIDE_REJECTED, SELL_GUIDE_FAQS,
} from "../src/lib/sellGuideContent.js";
import { PICKUP_INTRO_NOTES } from "../src/lib/pickupGuideContent.js";
import { PICKUP_FEE_POLICY } from "../../../packages/shared-domain/src/settlement.js";

const CANONICAL_URL = `https://subook.kr${SELL_GUIDE_META.canonicalPath}`;

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function replaceRequired(html, pattern, replacement, name) {
  if (!pattern.test(html)) throw new Error(`판매 안내 HTML 생성 실패: ${name} 없음`);
  return html.replace(pattern, () => replacement);
}

function renderGuideBody() {
  const list = (items) => items.map((item) =>
    `<li><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></li>`).join("\n");
  const threshold = (PICKUP_FEE_POLICY.priceThreshold / 10000).toLocaleString("ko-KR");
  return `<header><a href="/">수북 SUBOOK</a></header>
<main>
  <p>교재 판매 안내</p>
  <h1>${escapeHtml(SELL_GUIDE_HEADING.join(" "))}</h1>
  <p>${SELL_GUIDE_LEAD.map(escapeHtml).join("<br />")}</p>
  <p><a href="/pickup/new">판매 신청하기</a></p>
  <p>판매 신청은 로그인 후 진행할 수 있어요.</p>
  <section id="sell-process"><h2>판매 과정</h2><ol>${list(SELL_GUIDE_STEPS)}</ol></section>
  <section id="sell-conditions"><h2>판매 가능한 교재</h2><ul>${list(SELL_GUIDE_CONDITIONS)}</ul>
    <h3>이런 교재는 판매할 수 없어요</h3>
    <ul>${SELL_GUIDE_REJECTED.map((item) => `<li>${escapeHtml(item.label)} — ${escapeHtml(item.description)}</li>`).join("\n")}</ul>
    <p>판매 가능 여부는 검수 과정에서 최종 판단합니다. 기준 미달 교재는 자체 폐기되며 반송되지 않습니다.</p>
  </section>
  <section id="sell-fees"><h2>수수료·정산</h2>
    <h3>판매 수수료</h3><dl>
      <dt>판매가 ${threshold}만원 이상</dt><dd>${PICKUP_FEE_POLICY.standardPercent}%</dd>
      <dt>판매가 ${threshold}만원 미만</dt><dd>${PICKUP_FEE_POLICY.lowPricePercent}%</dd>
      <dt>정산일</dt><dd>매월 1일</dd>
      <dt>방문 수거</dt><dd>무료</dd>
      <dt>상품화 비용</dt><dd>박스당 5,000원</dd>
    </dl>
    <p>구매확정된 판매분을 등록하신 계좌로 정산해드려요.</p>
    <h3>신청 전 꼭 확인해 주세요</h3><ul>${PICKUP_INTRO_NOTES.map((note) => `<li>${escapeHtml(note)}</li>`).join("\n")}</ul>
  </section>
  <section id="sell-faq"><h2>자주 묻는 질문</h2>
    ${SELL_GUIDE_FAQS.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join("\n")}
    <p><a href="/faq">전체 질문 보기</a></p>
  </section>
</main>`;
}

// 빌드된 SPA의 JS/CSS·소유확인 태그는 보존하고 /sell의 초기 메타와 noscript만 교체한다.
// 봇용 본문도 같은 공통 원본으로 생성해 안내/정책이 따로 낡지 않게 한다.
export function buildSellGuidePages(indexHtml) {
  const title = `${SELL_GUIDE_META.title} | 수북 SUBOOK`;
  let clientHtml = replaceRequired(indexHtml, /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`, "title");
  for (const [attr, key, value] of [
    ["name", "description", SELL_GUIDE_META.description],
    ["property", "og:title", title],
    ["property", "og:description", SELL_GUIDE_META.description],
    ["property", "og:url", CANONICAL_URL],
    ["name", "twitter:title", title],
    ["name", "twitter:description", SELL_GUIDE_META.description],
  ]) {
    clientHtml = replaceRequired(clientHtml, new RegExp(`<meta\\b[^>]*${attr}="${key}"[^>]*>`, "i"),
      `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`, key);
  }
  clientHtml = replaceRequired(clientHtml, /<link\b[^>]*rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${CANONICAL_URL}" />`, "canonical");
  const body = renderGuideBody();
  clientHtml = replaceRequired(clientHtml, /<noscript>[\s\S]*?<\/noscript>/i,
    `<noscript>${body}</noscript>`, "noscript");

  // 검색용 정적 문서에는 SPA/분석 스크립트를 실행하지 않는다.
  const crawlerHead = clientHtml.match(/<head>[\s\S]*?<\/head>/i)?.[0]
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (tag, attrs) =>
      /type="application\/ld\+json"/i.test(attrs) ? tag : "")
    .replace(/<link\b[^>]*rel="(?:stylesheet|modulepreload|preload)"[^>]*>/gi, "");
  if (!crawlerHead) throw new Error("판매 안내 HTML 생성 실패: head 없음");
  return {
    clientHtml,
    crawlerHtml: `<!doctype html>\n<html lang="ko">${crawlerHead}<body>${body}</body></html>\n`,
  };
}
