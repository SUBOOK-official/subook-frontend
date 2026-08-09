import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PublicMemberGateDialog from "../components/PublicMemberGateDialog";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { trackLoginGateShown } from "./analytics";
import { createMemberGateRedirectState } from "./publicMemberGateUtils";
import { setPendingMemberAction } from "./pendingMemberAction";

function usePublicMemberGate() {
  const { isAuthenticated } = usePublicAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [actionType, setActionType] = useState("");
  const [redirectTarget, setRedirectTarget] = useState(null);
  // 비회원 주문 진입 (2026-08-03): 바로구매 게이트에서만 "비회원으로 주문하기"를 노출한다.
  // 담기/찜은 서버 카트·회원 데이터가 필요해 게스트 진행 경로가 없다.
  const [guestOrderItems, setGuestOrderItems] = useState(null);

  const closeMemberGate = useCallback(() => {
    setIsOpen(false);
    setActionType("");
    setRedirectTarget(null);
    setGuestOrderItems(null);
  }, []);

  const requireMember = useCallback(
    (nextActionType = "", nextRedirectTarget = null, pendingAction = null) => {
      if (isAuthenticated) {
        return true;
      }

      setActionType(nextActionType);
      setRedirectTarget(nextRedirectTarget);
      setIsOpen(true);
      // GA4 login_gate_shown — 로그인 관문이 구매 흐름을 얼마나 끊는지 계측
      trackLoginGateShown(nextActionType);
      // 로그인 후 이어서 실행할 행동(담기/바로구매/찜)을 저장. 호출부가 파라미터까지 담아 넘긴다.
      if (pendingAction) {
        setPendingMemberAction(pendingAction);
      }
      setGuestOrderItems(
        nextActionType === "buyNow" && Array.isArray(pendingAction?.orderItems)
          ? pendingAction.orderItems
          : null,
      );
      return false;
    },
    [isAuthenticated],
  );

  const redirectState = useMemo(
    () =>
      createMemberGateRedirectState({
        actionType,
        location,
        redirectTo: redirectTarget,
      }),
    [actionType, location, redirectTarget],
  );

  const handleLogin = useCallback(() => {
    closeMemberGate();
    navigate("/login", { state: redirectState });
  }, [closeMemberGate, navigate, redirectState]);

  const handleSignup = useCallback(() => {
    closeMemberGate();
    navigate("/signup", { state: redirectState });
  }, [closeMemberGate, navigate, redirectState]);

  // 비회원으로 주문하기 — 게이트에 담긴 바로구매 아이템으로 주문 페이지 게스트 모드 진입
  const handleGuestCheckout = useCallback(() => {
    const items = guestOrderItems;
    closeMemberGate();
    if (!items || items.length === 0) return;
    navigate("/order", { state: { items, guestMode: true } });
  }, [closeMemberGate, guestOrderItems, navigate]);

  return {
    closeMemberGate,
    isAuthenticated,
    requireMember,
    memberGateDialog: (
      <PublicMemberGateDialog
        gateReason={actionType}
        onClose={closeMemberGate}
        onGuestCheckout={guestOrderItems && guestOrderItems.length > 0 ? handleGuestCheckout : null}
        onLogin={handleLogin}
        onSignup={handleSignup}
        open={isOpen}
      />
    ),
  };
}

export default usePublicMemberGate;
