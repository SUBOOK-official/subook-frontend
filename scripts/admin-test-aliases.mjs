import { registerHooks } from "node:module";

// Vite와 동일한 별칭을 Node의 실제 테스트 실행에도 적용한다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const name of ["shared-domain", "shared-supabase"]) {
      if (specifier.startsWith(`@${name}/`)) {
        const path = specifier.slice(name.length + 2);
        return nextResolve(new URL(`../packages/${name}/src/${path}${/\.[cm]?jsx?$/.test(path) ? "" : ".js"}`, import.meta.url).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
