import { createClient } from "@supabase/supabase-js";

/**
 * 만료된 쿠폰 자동 처리 Cron
 * 매일 새벽 2시(KST) 실행 — status='available'이면서 expires_at이 지난 member_coupons를
 * 'expired'로 batch 갱신.
 *
 * SELECT 시점에는 동적으로 effective_status='expired'로 보이지만, cron 갱신이
 * 인덱스 효율과 통계 RPC 정확도를 높여줌.
 */
export default async function handler(req, res) {
  // ⚠️ fail-close: CRON_SECRET 미설정이면 항상 차단
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

  // service_role은 VITE_* fallback 금지 (client 번들 embed 위험)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: "Missing Supabase configuration" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.rpc("expire_old_coupons");

    if (error) {
      console.error("Expire coupons error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log("Expire coupons result:", JSON.stringify(data));
    return res.status(200).json(data);
  } catch (err) {
    console.error("Expire coupons unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
