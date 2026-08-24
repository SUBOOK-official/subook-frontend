import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const frontendRepoRoot = resolve(appRoot, "../..");
const workspaceRoot = resolve(appRoot, "../../..");
const isStandaloneFrontendRepo = existsSync(resolve(frontendRepoRoot, "packages/shared-domain/src"));
const repoRoot = isStandaloneFrontendRepo ? frontendRepoRoot : workspaceRoot;
const sharedRoot = isStandaloneFrontendRepo
  ? resolve(frontendRepoRoot, "packages")
  : resolve(workspaceRoot, "frontend/packages");
const envDir = existsSync(resolve(frontendRepoRoot, ".env")) ? frontendRepoRoot : workspaceRoot;

// react-vendor는 react의 런타임 의존성(scheduler, @remix-run/router)까지 포함해
// 의존성 기준으로 닫혀 있어야 한다. 빠뜨리면 react-vendor -> vendor 역방향 엣지가 생기고,
// vendor 쪽 react 의존 라이브러리(@sentry/react 등)의 vendor -> react-vendor 엣지와 만나
// 순환 청크(circular chunk)가 된다. 순환 청크는 로드 순서에 따라 TDZ ReferenceError를
// 일으킬 수 있는 잠복 리스크. (admin-web은 같은 문제를 단일 vendor 통합으로 해결)
function getManualChunk(id) {
  const normalizedId = id.replaceAll("\\", "/");
  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (
    normalizedId.includes("/node_modules/react/") ||
    normalizedId.includes("/node_modules/react-dom/") ||
    normalizedId.includes("/node_modules/react-router/") ||
    normalizedId.includes("/node_modules/react-router-dom/") ||
    normalizedId.includes("/node_modules/scheduler/") ||
    normalizedId.includes("/node_modules/@remix-run/router/")
  ) {
    return "react-vendor";
  }

  if (normalizedId.includes("/node_modules/@supabase/")) {
    return "supabase-vendor";
  }

  return "vendor";
}

export default defineConfig({
  root: appRoot,
  cacheDir: resolve(appRoot, ".vite"),
  envDir,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: resolve(appRoot, "tailwind.config.js") }), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      "@shared-domain": resolve(sharedRoot, "shared-domain/src"),
      "@shared-supabase": resolve(sharedRoot, "shared-supabase/src"),
    },
  },
  server: {
    // 브라우저 프리뷰가 세션마다 다른 포트를 배정할 수 있게 PORT env 우선 (기본 5183)
    port: Number(process.env.PORT) || 5183,
    // dev 전용: 서버리스(/api/*)를 로컬에서 시험할 때 scripts/dev-api-server.mjs(기본 3999)로
    // 프록시. 셔틀이 안 떠 있으면 /api 요청이 502로 떨어질 뿐 앱 동작엔 영향 없다.
    proxy: {
      "/api": {
        target: process.env.DEV_API_PROXY || "http://localhost:3999",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [repoRoot],
    },
  },
});
