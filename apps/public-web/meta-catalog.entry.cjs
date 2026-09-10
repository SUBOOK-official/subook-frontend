// 스테이징 루트는 CommonJS, frontend 워크스페이스는 ESM이다.
// require() 재수출은 Vercel에서 ERR_REQUIRE_ESM이 나므로 동적 import로 경계를 넘는다.
module.exports = async function handler(req, res) {
  const { default: serveFeed } = await import("../frontend/apps/public-web/api/meta-catalog.js");
  return serveFeed(req, res);
};
