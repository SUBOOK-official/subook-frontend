import { createClient } from "@supabase/supabase-js";

/**
 * 미입금 24h 자동 취소 Cron
 * 매시간 정각(매 1시간마다) 실행 — pending 상태로 24h 지난 주문을 cancelled로 전이 + 쿠폰 복구.
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
