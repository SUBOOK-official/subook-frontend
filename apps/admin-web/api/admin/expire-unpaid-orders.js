import { createClient } from "@supabase/supabase-js";

/**
 * 미입금 24h 자동 취소 Cron 엔드포인트.
 * pending 상태로 24h 지난 주문을 cancelled로 전이 + 쿠폰 복구하는 expire_unpaid_orders() RPC 호출.
 *
 * ⚠️ 실제 집행 주기: 이 함수의 핵심 스케줄은 DB의 pg_cron이 15분마다 직접
 *    `select expire_unpaid_orders()`를 호출하는 것(migration 2026051801). 무료(Hobby)
 *    플랜이라 Vercel cron은 하루 1회(vercel.json `0 18 * * *`)로만 보조 호출한다.
 *    (Hobby cron 최소 간격 = 하루 1회 제약 때문.) 두 경로 모두 동일 RPC라 멱등.
 */
export default async function handler(req, res) {
  // fail-close: CRON_SECRET 미설정이면 항상 차단
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET env not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_ADMIN_URL ||
    process.env.VITE_SUPABASE_ADMIN_URL ||
    process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: "Missing Supabase configuration" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.rpc("expire_unpaid_orders");

    if (error) {
      console.error("Expire unpaid orders error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log("Expire unpaid orders result:", JSON.stringify(data));
    return res.status(200).json(data);
  } catch (err) {
    console.error("Expire unpaid orders unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
