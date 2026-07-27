// 로컬 개발용 서버리스(/api/*) 셔틀 — Vercel Functions를 로컬에서 흉내낸다.
//
// 용도: public-web의 api/ 핸들러(예: /api/payments/nicepay-return)를 프로덕션 배포 없이
//   vite dev 서버(프록시: vite.config.js server.proxy)와 함께 E2E 테스트.
//
// 사용법:
//   node frontend/scripts/dev-api-server.mjs            # 기본 3999 포트
//   PORT=4001 node frontend/scripts/dev-api-server.mjs
//
// env 로딩(존재하는 것만, 이미 설정된 값은 유지):
//   <workspace>/.env, <workspace>/.env.local, frontend/.env, frontend/.env.development.local
//   → SUPABASE_SERVICE_ROLE_KEY / NICEPAY_* 등을 여기서 가져온다.
//
// ⚠ 프로덕션과의 차이: Vercel의 helpers(res.redirect 등) 전부가 아니라 이 저장소 api/가
//   실제로 쓰는 것(req.body, res.status().json(), statusCode/setHeader/end)만 제공한다.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const workspaceRoot = resolve(frontendRoot, "..");
const apiRoot = resolve(frontendRoot, "apps/public-web/api");

// ── 미니 dotenv (의존성 없이) ────────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

for (const file of [
  join(workspaceRoot, ".env"),
  join(workspaceRoot, ".env.local"),
  join(frontendRoot, ".env"),
  join(frontendRoot, ".env.development.local"),
]) {
  loadEnvFile(file);
}

// ── 요청 본문 파싱 (Vercel과 동일하게 json/urlencoded → 객체) ────────────────
function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolvePromise(undefined);
        return;
      }
      const contentType = String(req.headers["content-type"] || "");
      try {
        if (contentType.includes("application/json")) {
          resolvePromise(JSON.parse(raw));
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          resolvePromise(Object.fromEntries(new URLSearchParams(raw)));
        } else {
          resolvePromise(raw);
        }
      } catch {
        resolvePromise(raw);
      }
    });
    req.on("error", rejectPromise);
  });
}

// ── res에 Vercel 스타일 헬퍼 부착 ────────────────────────────────────────────
function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

// /api/payments/nicepay-return → <apiRoot>/payments/nicepay-return.js
function resolveHandlerPath(pathname) {
  const clean = pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  if (!clean) return null;
  // 경로 탈출 방지
  if (clean.includes("..")) return null;
  const candidate = resolve(apiRoot, `${clean}.js`);
  if (!candidate.startsWith(apiRoot)) return null;
  return existsSync(candidate) ? candidate : null;
}

const port = Number(process.env.PORT) || 3999;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const handlerPath = resolveHandlerPath(url.pathname);
  console.log(`[dev-api] ${req.method} ${url.pathname}${handlerPath ? "" : " (no handler)"}`);

  if (!handlerPath) {
    decorateResponse(res).status(404).json({ error: `No handler for ${url.pathname}`, code: 404 });
    return;
  }

  try {
    const mod = await import(pathToFileURL(handlerPath).href);
    const handler = mod.default;
    if (typeof handler !== "function") {
      throw new Error(`default export is not a function: ${handlerPath}`);
    }
    req.body = await readBody(req);
    req.query = Object.fromEntries(url.searchParams);
    await handler(req, decorateResponse(res));
  } catch (err) {
    console.error("[dev-api] handler error:", err);
    if (!res.headersSent) {
      decorateResponse(res).status(500).json({ error: String(err?.message || err), code: 500 });
    } else {
      res.end();
    }
  }
});

server.listen(port, () => {
  console.log(`[dev-api] listening on http://localhost:${port} (api root: ${apiRoot})`);
  console.log(
    `[dev-api] env ready: SUPABASE=${Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )} NICEPAY=${Boolean(process.env.NICEPAY_CLIENT_KEY && process.env.NICEPAY_SECRET_KEY)}`,
  );
});
