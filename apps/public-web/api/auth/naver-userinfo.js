export default async function handler(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const naverResponse = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: authHeader },
  });

  if (!naverResponse.ok) {
    return res
      .status(naverResponse.status)
      .json({ error: "Naver API request failed" });
  }

  const naverData = await naverResponse.json();
  const profile = naverData.response ?? {};

  return res.status(200).json({
    sub: profile.id,
    email: profile.email,
    email_verified: true,
    name: profile.name,
    nickname: profile.nickname,
    picture: profile.profile_image,
  });
}
