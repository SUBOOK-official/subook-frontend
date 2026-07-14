// 운영자 입력 리치텍스트(HTML) 처리 유틸 — FAQ 답변 등.
//
// 저장은 HTML 문자열 그대로 하되, 렌더/저장 양쪽에서 반드시 sanitizeRichHtml을
// 거친다. 허용 태그·속성 화이트리스트 방식이라 script/style/이벤트핸들러 등은
// 전부 제거된다. (DOMParser 사용 — 브라우저 전용. SSR/Node에서 호출 금지)

// 블록/인라인 허용 태그. contentEditable이 줄 단위로 div를 만들기 때문에 div 포함.
const ALLOWED_TAGS = new Set([
  "p",
  "div",
  "br",
  "ul",
  "ol",
  "li",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "a",
]);

// 내용까지 통째로 버릴 태그 (unwrap하면 스크립트 본문이 텍스트로 새어나온다)
const DROP_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "svg",
  "math",
  "template",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "head",
  "title",
]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function sanitizeNode(node, doc) {
  if (node.nodeType === TEXT_NODE) {
    return doc.createTextNode(node.nodeValue);
  }
  if (node.nodeType !== ELEMENT_NODE) {
    return null;
  }

  const tag = node.tagName.toLowerCase();
  if (DROP_TAGS.has(tag)) {
    return null;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    // 허용 외 태그는 unwrap — 자식만 살린다 (span, font 등)
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(node.childNodes)) {
      const clean = sanitizeNode(child, doc);
      if (clean) fragment.appendChild(clean);
    }
    return fragment;
  }

  const el = doc.createElement(tag);
  // 속성은 기본 전부 제거. a[href]만 http/https/mailto 한정으로 유지.
  if (tag === "a") {
    const href = (node.getAttribute("href") || "").trim();
    if (/^(https?:|mailto:)/i.test(href)) {
      el.setAttribute("href", href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
  for (const child of Array.from(node.childNodes)) {
    const clean = sanitizeNode(child, doc);
    if (clean) el.appendChild(clean);
  }
  return el;
}

/** HTML 문자열을 화이트리스트 기준으로 정화해 반환한다. */
export function sanitizeRichHtml(html) {
  const source = String(html ?? "");
  if (!source.trim()) return "";
  const doc = new DOMParser().parseFromString(source, "text/html");
  const container = doc.createElement("div");
  for (const child of Array.from(doc.body.childNodes)) {
    const clean = sanitizeNode(child, doc);
    if (clean) container.appendChild(clean);
  }
  return container.innerHTML;
}

/** 리치텍스트 HTML에서 순수 텍스트만 추출 (목록 미리보기·빈값 검증용). */
export function richTextToPlain(html) {
  const source = String(html ?? "");
  if (!source.trim()) return "";
  const doc = new DOMParser().parseFromString(source, "text/html");
  // NBSP(160)는 일반 공백으로 정리 — 리터럴 문자 대신 charCode로 표기 (lint no-irregular-whitespace)
  return (doc.body.textContent || "").split(String.fromCharCode(160)).join(" ").trim();
}

/** 값이 HTML 마크업으로 보이는지 — 레거시 plain text 답변과의 분기용. */
export function looksLikeRichHtml(value) {
  return /<([a-z][\w-]*)(\s[^>]*)?>/i.test(String(value ?? ""));
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** 레거시 plain text(줄바꿈 구분)를 에디터용 HTML로 변환. */
export function plainTextToHtml(text) {
  const source = String(text ?? "");
  if (!source.trim()) return "";
  return source
    .split(/\n/)
    .map((line) => {
      const escaped = line.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch]);
      return `<p>${escaped || "<br>"}</p>`;
    })
    .join("");
}
