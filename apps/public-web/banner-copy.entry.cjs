// 스테이징 루트의 CommonJS 진입점에서 원래 ESM 경로를 유지한다.
module.exports = async function handler(req, res) {
  const { default: serveBannerCopy } = await import("../frontend/apps/public-web/api/banner-copy.js");
  return serveBannerCopy(req, res);
};
