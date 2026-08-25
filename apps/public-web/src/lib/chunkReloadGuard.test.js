import assert from "node:assert/strict";
import test from "node:test";
import {
  RELOAD_RETRY_WINDOW_MS,
  installChunkReloadGuard,
  isChunkLoadError,
  shouldAutoReload,
} from "./chunkReloadGuard.js";

// Sentry에 실제 잡힌 메시지 3종 (issue 7481682491 / 7506651807 / 7490913496)
test("isChunkLoadError matches real-world stale chunk failures", () => {
  assert.equal(
    isChunkLoadError(
      new TypeError(
        "Failed to fetch dynamically imported module: https://subook.kr/assets/PublicProductDetailPage-AQFGXKdp.js",
      ),
    ),
    true,
  );
  assert.equal(
    isChunkLoadError(new TypeError("'text/html' is not a valid JavaScript MIME type.")),
    true,
  );
  assert.equal(
    isChunkLoadError(
      new Error("Unable to preload CSS for /assets/PublicProductDetailPage-DVBgAhCz.css"),
    ),
    true,
  );
});

test("isChunkLoadError matches Firefox/Safari module load failures", () => {
  assert.equal(
    isChunkLoadError(new TypeError("error loading dynamically imported module")),
    true,
  );
  assert.equal(isChunkLoadError(new TypeError("Importing a module script failed.")), true);
});

test("isChunkLoadError rejects unrelated errors and nullish input", () => {
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError(new Error("Network request failed")), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError("문자열 에러"), false);
});

test("shouldAutoReload allows first failure and blocks rapid repeats", () => {
  const now = 1_000_000;
  assert.equal(shouldAutoReload(0, now), true);
  assert.equal(shouldAutoReload(now - RELOAD_RETRY_WINDOW_MS + 1, now), false);
  assert.equal(shouldAutoReload(now - RELOAD_RETRY_WINDOW_MS, now), true);
});

test("installChunkReloadGuard is a no-op outside the browser", () => {
  assert.doesNotThrow(() => installChunkReloadGuard());
});
