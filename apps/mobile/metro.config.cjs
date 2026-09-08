const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const frontendRoot = path.resolve(__dirname, "../..");

// 기존 저장소는 npm workspaces를 사용하지 않는다. 모바일을 독립 설치해
// 웹의 React 18과 앱의 React 19가 한 번들에 섞이지 않게 한다.
config.watchFolders = [
  path.join(frontendRoot, "packages"),
  path.join(frontendRoot, "apps/public-web/src/assets"),
  path.join(frontendRoot, "apps/public-web/src/lib"),
  path.join(frontendRoot, "apps/public-web/public"),
];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 저장소 바깥 앱이 공유 소스의 SDK/React를 자기 버전으로 해석한다.
  // 나머지는 Expo 기본 계층 탐색을 유지해 SDK 내부 중첩 의존성을 찾는다.
  if (context.originModulePath.startsWith(path.join(frontendRoot, "packages"))
    && ["@supabase/supabase-js", "react", "react/jsx-runtime"].includes(moduleName)) {
    return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, "index.js") }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
