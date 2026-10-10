import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

// PDF.js와 같은 버전의 한글 CMap·폰트·이미지 디코더를 자체 호스팅한다.
export function pdfjsAssetsPlugin() {
  const require = createRequire(import.meta.url);
  const base = dirname(require.resolve("pdfjs-dist/package.json"));
  const assets = new Map();
  for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    for (const name of readdirSync(join(base, directory))) {
      if (/\.(bcmap|pfb|ttf|wasm|icc|js)$/.test(name)) assets.set(`/pdfjs/${directory}/${name}`, join(base, directory, name));
    }
  }
  return {
    name: "subook-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = assets.get((request.url || "").split("?")[0]);
        if (!path) return next();
        response.setHeader("Content-Type", path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        response.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const [url, path] of assets) this.emitFile({ type: "asset", fileName: url.slice(1), source: readFileSync(path) });
    },
  };
}
