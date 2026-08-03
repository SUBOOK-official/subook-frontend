import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import ContentContainer from "../components/ContentContainer";
import PublicFooter from "../components/PublicFooter";
import PublicPageFrame from "../components/PublicPageFrame";
import PublicSiteHeader from "../components/PublicSiteHeader";
import { usePageMeta } from "../lib/usePageMeta";
import "./PublicOrderCompletePage.css";

// PG 결제 실패 복귀 지점 (나이스페이 failRedirect / 토스 failUrl — ?code=&message=&orderId=).
//
// 2026-08-03 '선주문 생성' 폐지 후: 나이스페이 카드 이탈/실패는 주문이 아예 만들어지지
// 않으므로(결제 세션만 잔류) 여기서 정리할 것도 없다 — orderId는 세션 번호라 아래
// orders 조회에 안 걸려 자연 스킵된다.
//
// 아래 자동 취소 로직은 구플로우(선생성 주문)·토스 경로 호환용으로 유지: orderId(주문번호)가
// 실제 미결제 카드 주문이면 본인 소유 확인 후 즉시 자동 취소한다
// (cancel_member_order RPC — 소유·pending 검증은 서버가 하므로 위조 URL로는 남의 주문
// 취소 불가). 비로그인/미방문 케이스는 30분 자동만료(expire_unpaid_orders)가 백스톱.
function PublicPaymentFailPage() {
  usePageMeta({ title: "결제 실패", noindex: true });
  const [params] = useSearchParams();
  const code = params.get("code");
  const message = params.get("message");
  const orderNumber = params.get("orderId");

  // StrictMode 이중 실행으로 취소가 두 번 호출되는 것 방지 (RPC 자체는 pending 아니면 거부)
  const calledRef = useRef(false);
  const [autoCancelled, setAutoCancelled] = useState(false);

  useEffect(() => {
    if (calledRef.current || !orderNumber || !supabase) return;
    calledRef.current = true;

    (async () => {
      try {
        // RLS로 본인 주문만 조회됨 — 비로그인/남의 주문이면 data가 비어 조용히 스킵
        const { data } = await supabase
          .from("orders")
          .select("id, status, payment_status, payment_method")
          .eq("order_number", orderNumber)
          .maybeSingle();
        if (
          !data ||
          data.status !== "pending" ||
          data.payment_status === "paid" ||
          data.payment_method === "bank_transfer"
        ) {
          return;
        }
        const { error } = await supabase.rpc("cancel_member_order", { p_order_id: data.id });
        if (!error) setAutoCancelled(true);
      } catch {
        // 취소 실패해도 30분 자동만료가 정리한다 — 사용자 흐름을 막지 않는다
      }
    })();
  }, [orderNumber]);

  const detail = message || "결제가 취소되었거나 완료되지 않았습니다.";

  return (
    <PublicPageFrame>
      <div className="order-complete-page">
        <PublicSiteHeader />
        <ContentContainer as="section" className="order-complete-content">
          <div className="order-complete-card">
            <h1 className="order-complete-card__title">결제가 완료되지 않았어요</h1>
            <p className="order-complete-card__subtitle">
              {detail}
              {code ? ` (${code})` : ""}
            </p>
            <p className="order-complete-card__subtitle">
              {autoCancelled
                ? "요금은 청구되지 않았고, 주문은 자동 취소되었어요. 언제든 다시 주문해 주세요."
                : "결제만 진행되지 않았을 뿐 요금은 청구되지 않았어요. 다시 시도하거나 다른 결제수단을 이용해 주세요."}
            </p>
            <div className="order-complete-card__actions">
              <Link className="order-complete-card__btn order-complete-card__btn--primary" to="/cart">
                장바구니로 돌아가기
              </Link>
              <Link className="order-complete-card__btn order-complete-card__btn--secondary" to="/mypage">
                주문 내역 확인
              </Link>
            </div>
          </div>
        </ContentContainer>
        <PublicFooter />
      </div>
    </PublicPageFrame>
  );
}

export default PublicPaymentFailPage;
