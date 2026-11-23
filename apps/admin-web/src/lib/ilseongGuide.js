// 「일성월심 앱」 화면이 "지금 무엇을 할 차례인지"를 정하는 계산. 화면 없이 시험할 수 있게 여기에 둔다.
//
// 학습지 하나는 네 단계를 차례로 밟는다: 구성 → 교재 PDF → 판매 상품 → 판매 시작.
// 어디까지 왔는지는 따로 적어 두지 않고, 있는 것(교재·올린 쪽·수북 상품·공개 여부)을 보고 그때그때 정한다.

import { ilseongPath } from "./ilseongPaths.js";
import { storeProductsOf } from "./ilseongProducts.js";

export const STEPS = [
  { key: "structure", title: "구성 만들기", short: "구성" },
  { key: "pages", title: "교재 PDF 올리기", short: "교재 PDF" },
  { key: "store", title: "판매 상품 만들기", short: "판매 상품" },
  { key: "sell", title: "판매 시작", short: "판매 시작" },
];

export const stepNumber = (key) => STEPS.findIndex((step) => step.key === key) + 1;

/**
 * 교재 한 권이 앱에서 볼 준비가 됐는지.
 *  - "none"   PDF(쪽 이미지)를 아직 올리지 않았다 → 앱에 '준비 중'으로 보인다
 *  - "ranges" 쪽은 올렸는데 하루 분량마다의 쪽 범위가 비어 있다 → 하루 분량을 눌러도 쪽이 열리지 않는다
 *  - "ready"  볼 수 있다. 하루 분량으로 나누지 않은 교재(단어장·부록처럼 쪽만 보는 책)는 쪽만 올리면 된다
 */
export function bookState(book) {
  if (!book?.pageCount) return "none";
  const days = book.days ?? [];
  if (days.length === 0) return "ready";
  return days.every((day) => day.startPage != null && day.endPage != null) ? "ready" : "ranges";
}

/** 학습지(또는 과목 하나)의 교재를 준비 상태별로 센다. */
export function pageCounts(subjects) {
  const counts = { total: 0, ready: 0, none: 0, ranges: 0 };
  for (const subject of subjects ?? []) {
    for (const book of subject.books ?? []) {
      counts.total += 1;
      counts[bookState(book)] += 1;
    }
  }
  return counts;
}

/**
 * 학습지 하나가 어디까지 왔는지.
 *
 * @param series        앱 서버가 준 학습지 { subjects[], product: { code } }
 * @param storeProducts 수북에서 이 앱의 학습지에 이어 둔 상품들 { product_id, app_product_code, is_listed, … }
 *                      (아직 읽지 못했으면 null → 판매 단계는 "모름"으로 둔다)
 * @returns {{
 *   counts: { subjects: number, total: number, ready: number, none: number, ranges: number },
 *   store: object[],          이 학습지에 이어진 수북 상품
 *   done: { structure: boolean, pages: boolean, store: boolean, sell: boolean },
 *   current: string|null,     지금 할 단계의 key. 다 끝났으면 null
 *   selling: boolean,         사이트에서 팔고 있다
 *   unknownStore: boolean,    수북 상품을 아직 읽지 못했다
 * }}
 */
export function seriesProgress(series, storeProducts) {
  const subjects = series?.subjects ?? [];
  const pages = pageCounts(subjects);
  const unknownStore = storeProducts === null || storeProducts === undefined;
  const store = unknownStore ? [] : storeProductsOf(storeProducts, series?.product?.code);
  const selling = store.some((item) => item.is_listed);
  const done = {
    structure: pages.total > 0,
    pages: pages.total > 0 && pages.ready === pages.total,
    store: store.length > 0,
    sell: selling,
  };
  // 교재를 한 권이라도 볼 수 있으면 팔기 시작할 수 있다(주마다 올리는 학습지). 남은 PDF는 팔면서 올린다.
  let current = null;
  if (!done.structure) current = "structure";
  else if (pages.ready === 0) current = "pages";
  else if (unknownStore) current = null;
  else if (!done.store) current = "store";
  else if (!done.sell) current = "sell";
  else if (!done.pages) current = "pages";
  return { counts: { subjects: subjects.length, ...pages }, store, done, current, selling, unknownStore };
}

/** 학습지 목록·홈에 보이는 한 줄: 지금 상태와 색. */
export function seriesStatus(progress) {
  const waiting = progress.counts.total - progress.counts.ready;
  if (progress.selling) {
    return waiting > 0
      ? { tone: "orange", label: "판매 중", note: `교재 ${waiting}권이 아직 앱에서 안 보여요` }
      : { tone: "green", label: "판매 중", note: "할 일이 없어요" };
  }
  if (!progress.current) return { tone: "grey", label: "확인 중", note: "" };
  const step = STEPS.find((entry) => entry.key === progress.current);
  return { tone: "blue", label: "준비 중", note: `다음 할 일: ${stepNumber(step.key)}단계 ${step.title}` };
}

/** 판매를 시작하지 못하게 막는 것. 운영진이 풀 수 없는 것(개발자가 봐야 하는 것)은 dev: true. */
export function sellBlockers({ sales, stock }) {
  const blockers = [];
  if (sales && sales.configured === false) {
    blockers.push({ key: "server", dev: true, text: "수북 사이트와 앱 서버가 이어져 있지 않아요." });
  }
  if (sales && sales.guideTemplateReady === false) {
    blockers.push({ key: "guide", dev: true, text: "구매한 사람에게 보낼 안내 알림톡이 아직 준비되지 않았어요." });
  }
  if (stock && !stock.cover) {
    blockers.push({ key: "cover", dev: false, text: "표지 이미지가 없어요. 표지가 있어야 사이트에 보여요." });
  }
  if (stock && stock.onSale === 0) {
    blockers.push({ key: "stock", dev: false, text: "팔 수 있는 재고가 없어요." });
  }
  return blockers;
}

/**
 * 홈의 "지금 할 일". 급한 것부터.
 * @returns {{ key: string, tone: "red"|"orange"|"blue", text: string, hint?: string, action?: { label: string, to: string } }[]}
 */
export function homeTodos({ seriesList, sales, system, config, serverStale = false }) {
  const todos = [];
  const dev = "개발자에게 알려 주세요.";

  if (system && system.checkedAt && (serverStale || system.ok === false)) {
    todos.push({
      key: "server",
      tone: "red",
      text: serverStale ? "앱 서버가 점검 결과를 보내지 않고 있어요." : "앱 서버에 문제가 있어요.",
      hint: `학생들이 앱을 쓰지 못할 수 있어요. ${dev}`,
    });
  }
  if (sales && sales.configured === false) {
    todos.push({
      key: "link",
      tone: "red",
      text: "수북 사이트와 앱 서버가 이어져 있지 않아요.",
      hint: `새로 산 사람의 앱에 교재가 등록되지 않아요. ${dev}`,
    });
  }
  const failed = Number(sales?.counts?.failed || 0);
  if (failed > 0) {
    todos.push({
      key: "failed",
      tone: "red",
      text: `결제는 됐는데 앱에 교재를 등록하지 못한 주문이 ${failed}건 있어요.`,
      hint: "[다시 처리]를 눌러 주세요. 그래도 안 되면 개발자에게 알려 주세요.",
      action: { label: "주문 보기", to: `${ilseongPath("users")}#orders` },
    });
  }
  if (config?.noticeMode === "BLOCK") {
    todos.push({
      key: "block",
      tone: "orange",
      text: "앱이 '점검 중'으로 막혀 있어요.",
      hint: "지금은 학생 모두가 앱을 쓸 수 없어요. 점검이 끝났으면 꺼 주세요.",
      action: { label: "앱 설정 열기", to: ilseongPath("app-config") },
    });
  }
  if (config && (config.iosBlockCapture === false || config.androidBlockCapture === false)) {
    todos.push({
      key: "capture",
      tone: "orange",
      text: "교재 화면 캡처 막기가 꺼져 있어요.",
      hint: "문제가 풀렸으면 다시 켜 주세요.",
      action: { label: "앱 설정 열기", to: ilseongPath("app-config") },
    });
  }
  if (config && (String(config.iosReviewBuild ?? "").trim() || String(config.androidReviewBuild ?? "").trim())) {
    todos.push({
      key: "review",
      tone: "orange",
      text: "스토어 심사용 로그인 버튼이 켜져 있어요.",
      hint: "심사를 통과해 출시했으면 꺼 주세요.",
      action: { label: "앱 설정 열기", to: ilseongPath("app-config") },
    });
  }

  for (const series of seriesList ?? []) {
    const progress = seriesProgress(series, sales?.products ?? null);
    const to = ilseongPath("books", series.id);
    if (progress.selling) {
      const waiting = progress.counts.total - progress.counts.ready;
      if (waiting > 0) {
        todos.push({
          key: `series-${series.id}`,
          tone: "orange",
          text: `${series.name}: 교재 ${waiting}권의 PDF를 아직 올리지 않았어요.`,
          hint: "산 학생의 앱에 '준비 중'으로 보여요.",
          action: { label: "PDF 올리기", to },
        });
      }
    } else if (progress.current) {
      const step = STEPS.find((entry) => entry.key === progress.current);
      todos.push({
        key: `series-${series.id}`,
        tone: "blue",
        text: `${series.name}: 아직 팔고 있지 않아요.`,
        hint: `다음 할 일: ${stepNumber(step.key)}단계 ${step.title}`,
        action: { label: "이어서 하기", to },
      });
    }
  }
  return todos;
}

// ── 새 학습지 만들기 ─────────────────────────────────────────

/** 교재 한 권·하루 분량을 부르는 말로 자주 쓰는 것. 마지막의 빈 값은 "직접 넣기". */
/** 교재 한 권의 하루 분량 수(앱 서버의 한도와 같다). 0 = 하루 분량으로 나누지 않는 교재. */
export const MAX_DAYS = 400;
export const UNIT_WORDS = ["주차", "회", "권"];
export const DAY_WORDS = ["Day", "일차", "강"];

/** 새 학습지 만들기에서 고쳐야 할 것. 없으면 null. */
export function setupProblem(form) {
  if (!String(form.name || "").trim()) return "학습지 이름을 넣어 주세요.";
  const names = (form.subjects ?? []).map((subject) => String(subject.name || "").trim()).filter(Boolean);
  if (names.length === 0) return "과목 이름을 하나 이상 넣어 주세요.";
  if (new Set(names).size !== names.length) return "같은 과목 이름이 두 번 들어 있어요.";
  const books = Number(form.bookCount);
  if (!Number.isInteger(books) || books < 1 || books > 60) return "교재 수는 1–60 사이로 넣어 주세요.";
  const days = Number(form.dayCount);
  if (String(form.dayCount ?? "").trim() === "" || !Number.isInteger(days) || days < 0 || days > MAX_DAYS) {
    return `하루 분량 수는 0–${MAX_DAYS} 사이로 넣어 주세요. 하루 분량으로 나누지 않는 교재면 0을 넣어요.`;
  }
  if (!String(form.unitWord || "").trim()) return "교재를 부르는 말을 넣어 주세요.";
  if (!String(form.dayWord || "").trim()) return "하루 분량을 부르는 말을 넣어 주세요.";
  return null;
}

/** 새 학습지 만들기 창의 값 → 앱 서버에 보낼 본문. 빈 과목 줄은 뺀다. */
export function setupBody(form) {
  return {
    name: form.name.trim(),
    unitWord: form.unitWord.trim(),
    dayWord: form.dayWord.trim(),
    subjects: form.subjects
      .map((subject) => ({ name: String(subject.name || "").trim(), color: subject.color }))
      .filter((subject) => subject.name),
    bookCount: Number(form.bookCount),
    dayCount: Number(form.dayCount),
  };
}
