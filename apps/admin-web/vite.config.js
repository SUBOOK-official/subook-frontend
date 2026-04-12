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

function getManualChunk(id) {
  const normalizedId = id.replaceAll("\\", "/");
  if (!normalizedId.includes("/node_modules/")) {
    return undefined;
  }

  if (
    normalizedId.includes("/node_modules/react/") ||
    normalizedId.includes("/node_modules/react-dom/") ||
    normalizedId.includes("/node_modules/react-router/") ||
    normalizedId.includes("/node_modules/react-router-dom/")
  ) {
    return "react-vendor";
  }

  if (normalizedId.includes("/node_modules/@supabase/")) {
    return "supabase-vendor";
  }

  if (
    normalizedId.includes("/node_modules/read-excel-file/") ||
    normalizedId.includes("/node_modules/write-excel-file/") ||
    normalizedId.includes("/node_modules/fflate/") ||
    normalizedId.includes("/node_modules/@xmldom/")
  ) {
    return "excel-vendor";
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
    fs: {
      allow: [repoRoot],
    },
  },
});
