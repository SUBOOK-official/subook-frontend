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

export default defineConfig({
  root: appRoot,
  cacheDir: resolve(appRoot, ".vite"),
  envDir,
  plugins: [react()],
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
