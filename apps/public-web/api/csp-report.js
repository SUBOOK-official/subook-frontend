// CSP(콘텐츠 보안 정책) 위반 보고 수집 (public-web /api/csp-report)
//
// 브라우저가 정책 위반을 발견하면 헤더의 report-uri로 이 주소에 POST한다.
// admin-web도 같은 주소로 보낸다(?app=admin) — 수집 함수를 한 곳에만 둔다.
//
// 보고 내용은 방문자 브라우저가 만든 값이라 신뢰하지 않는다. 길이를 자르고 출처·경로만 남겨
// service_role 전용 RPC(record_csp_violation)로 집계한다. 원문·IP·쿼리 문자열은 남기지 않는다.
// 보고가 실패해도 방문자 화면과 무관하므로 POST는 어떤 경우에도 204로 끝낸다.

const MAX_BODY_BYTES = 16_000;
const MAX_REPORTS_PER_REQUEST = 5;
const REQUEST_TIMEOUT_MS = 3_000;
const DIRECTIVE_PATTERN = /^[a-z][a-z-]{2,39}$/;
const KEYWORD_PATTERN = /^[a-z][a-z-]{1,29}$/;
// 브라우저 확장·앱 내장 브라우저가 페이지에 끼워 넣은 것 — 사이트 코드가 아니라 잡음이다.
const NOISE_PATTERN = /^(?:[a-z-]*extension|webkit-masked-url|about|chrome|resource|file):/i;

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function parseUrl(value) {
  try {
    return new URL(String(value ?? ""));
  } catch {
    return null;
  }
}

// 막힌 대상: 주소면 출처(scheme+host)만, 'inline'·'eval'·'data' 같은 열쇠말이면 그대로.
function blockedKey(value) {
  const raw = text(value, 500);
  if (!raw) return "unknown";
  if (KEYWORD_PATTERN.test(raw.toLowerCase())) return raw.toLowerCase();
  const url = parseUrl(raw);
  if (!url) return "unknown";
  return /^(?:https?|wss?):$/.test(url.protocol) ? url.origin : url.protocol.replace(":", "");
}

// 쿼리 문자열·해시는 토큰이나 검색어가 섞일 수 있어 버린다.
function withoutQuery(value, { host = true } = {}) {
  const url = parseUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return "";
  return `${host ? url.host : url.origin}${url.pathname}`;
}

function normalizeOne(raw, { app, mode, userAgent }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const blockedRaw = raw["blocked-uri"] ?? raw.blockedURL ?? "";
  const sourceRaw = raw["source-file"] ?? raw.sourceFile ?? "";
  if (NOISE_PATTERN.test(String(blockedRaw)) || NOISE_PATTERN.test(String(sourceRaw))) return null;

  // 옛 브라우저는 violated-directive에 정책 전체를 넣기도 한다 — 첫 단어가 지시어 이름이다.
  const directive = text(
    raw["effective-directive"] ?? raw.effectiveDirective ?? raw["violated-directive"] ?? "",
    200,
  ).toLowerCase().split(/\s+/)[0];
  if (!DIRECTIVE_PATTERN.test(directive)) return null;

  const reported = text(raw.disposition, 20).toLowerCase();
  const disposition = reported === "enforce" || reported === "report" ? reported : mode;

  const line = Number(raw["line-number"] ?? raw.lineNumber);
  const sourceFile = withoutQuery(sourceRaw, { host: false });

  return {
    app,
    disposition,
    directive,
    blocked: blockedKey(blockedRaw).slice(0, 200),
    blockedUrl: withoutQuery(blockedRaw, { host: false }).slice(0, 300),
    documentPath: withoutQuery(raw["document-uri"] ?? raw.documentURL ?? "").slice(0, 200),
    sourceFile: (sourceFile && Number.isInteger(line) && line > 0 ? `${sourceFile}:${line}` : sourceFile).slice(0, 300),
    sample: text(raw["script-sample"] ?? raw.sample, 120),
    userAgent: text(userAgent, 200),
  };
}

// report-uri 형식({"csp-report": {...}})과 Reporting API 형식([{type, body}])을 모두 받는다.
export function normalizeCspReports(payload, { app = "public", mode = "report", userAgent = "" } = {}) {
  const context = {
    app: app === "admin" ? "admin" : "public",
    mode: mode === "enforce" ? "enforce" : "report",
    userAgent,
  };
  let candidates = [];
  if (Array.isArray(payload)) {
    candidates = payload
      .filter((item) => item && typeof item === "object" && item.type === "csp-violation")
      .map((item) => item.body);
  } else if (payload && typeof payload === "object") {
    candidates = [payload["csp-report"] ?? payload];
  }
  return candidates
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .map((candidate) => normalizeOne(candidate, context))
    .filter(Boolean);
}

async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  // Content-Type이 application/csp-report면 자동 파싱이 안 돼 본문을 직접 읽는다.
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return "";
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readQuery(req) {
  if (req.query && typeof req.query === "object") return req.query;
  const url = parseUrl(`https://subook.kr${req.url || ""}`);
  return url ? Object.fromEntries(url.searchParams) : {};
}

async function recordViolation({ supabaseUrl, serviceKey, report }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_csp_violation`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_report: report }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("[csp-report] record failed", { status: response.status });
    }
  } catch (error) {
    console.error("[csp-report] record failed", { code: String(error?.name || "UNKNOWN").slice(0, 60) });
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // Reporting API(report-to)는 다른 출처로 보낼 때 사전 요청을 먼저 한다.
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  try {
    const contentLength = Number(req.headers?.["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return res.status(204).end();
    }

    const rawBody = await readRawBody(req);
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
      return res.status(204).end();
    }

    const query = readQuery(req);
    const reports = normalizeCspReports(JSON.parse(rawBody), {
      app: String(query.app ?? ""),
      mode: String(query.mode ?? ""),
      userAgent: req.headers?.["user-agent"],
    });

    const supabaseUrl = process.env.SUPABASE_URL
      || process.env.VITE_SUPABASE_PUBLIC_URL
      || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && serviceKey) {
      await Promise.all(reports.map((report) => recordViolation({
        supabaseUrl: supabaseUrl.replace(/\/$/, ""),
        serviceKey,
        report,
      })));
    }
  } catch {
    // 형식이 틀린 보고는 조용히 버린다.
  }

  return res.status(204).end();
}
