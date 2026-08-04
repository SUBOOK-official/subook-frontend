import { createClient } from "@supabase/supabase-js";

/**
 * 재입고 알림 발송 Cron
 * 15분마다 실행(2026-08-04 Pro 전환으로 일 1회→15분 상향) — restock_notifications 중
 * product에 on_sale + is_public인 책이 있는 구독을 모아서 카카오 알림톡 발송 +
 * notified_at 마킹. 미발송분만 조회하는 구조라 실행 주기와 무관하게 중복 발송 없음.
 */

async function callSendNotification({ baseUrl, cronSecret, payload }) {
  const url = `${baseUrl}/api/admin/send-notification`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    console.error("notify-restock send-notification fetch failed:", err.message);
    return { ok: false, status: 0 };
  }
}

export default async function handler(req, res) {
  // fail-close
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
    const { data: pending, error: listError } = await supabase.rpc(
      "admin_list_pending_restock_alerts",
      { p_limit: 500 },
    );
    if (listError) {
      console.error("restock list error:", listError.message);
      return res.status(500).json({ error: listError.message });
    }

    const items = Array.isArray(pending) ? pending : [];
    if (items.length === 0) {
      return res.status(200).json({ success: true, processed_count: 0, message: "no pending" });
    }

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    let sent = 0;
    let failed = 0;
    const markByBook = new Map(); // notified_book_id → [notification_ids]

    // 동시에 너무 많이 보내지 않도록 직렬 (또는 작은 chunk 병렬)
    for (const item of items) {
      // send-notification은 recipientPhone 필수 (이메일 경로 미구현).
      // phone 없는 회원은 사이트 내 알림 센터만 받도록 mark는 하되 별도 처리.
      if (!item.user_phone) {
        failed += 1;
        continue;
      }

      const payload = {
        notificationType: "restock",
        recipientPhone: item.user_phone,
        recipientName: item.user_name || "회원",
        recipientUserId: item.user_id,
        refType: "product",
        refId: item.product_id,
        templateVariables: {
          productTitle: item.product_title,
          productId: item.product_id,
        },
      };

      const result = await callSendNotification({ baseUrl, cronSecret, payload });
      if (result.ok) {
        sent += 1;
        const bookId = item.available_book_id;
        const arr = markByBook.get(bookId) || [];
        arr.push(item.notification_id);
        markByBook.set(bookId, arr);
      } else {
        failed += 1;
      }
    }

    // 발송 성공한 알림만 mark
    let totalMarked = 0;
    for (const [bookId, ids] of markByBook.entries()) {
      if (ids.length === 0) continue;
      const { data: markData, error: markError } = await supabase.rpc(
        "admin_mark_restock_notified",
        { p_ids: ids, p_notified_book_id: bookId },
      );
      if (markError) {
        console.error("mark error for bookId", bookId, markError.message);
        continue;
      }
      totalMarked += markData?.marked ?? 0;
    }

    return res.status(200).json({
      success: true,
      processed_count: items.length,
      sent_count: sent,
      failed_count: failed,
      marked_count: totalMarked,
    });
  } catch (err) {
    console.error("notify-restock unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
