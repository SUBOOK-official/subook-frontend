import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PublicMemberGateDialog from "../components/PublicMemberGateDialog";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { createMemberGateRedirectState } from "./publicMemberGateUtils";
import { setPendingMemberAction } from "./pendingMemberAction";

function usePublicMemberGate() {
  const { isAuthenticated } = usePublicAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [actionType, setActionType] = useState("");
  const [redirectTarget, setRedirectTarget] = useState(null);

  const closeMemberGate = useCallback(() => {
    setIsOpen(false);
    setActionType("");
    setRedirectTarget(null);
  }, []);

  const requireMember = useCallback(
    (nextActionType = "", nextRedirectTarget = null, pendingAction = null) => {
      if (isAuthenticated) {
        return true;
      }

      setActionType(nextActionType);
      setRedirectTarget(nextRedirectTarget);
      setIsOpen(true);
      // 로그인 후 이어서 실행할 행동(담기/바로구매/찜)을 저장. 호출부가 파라미터까지 담아 넘긴다.
      if (pendingAction) {
        setPendingMemberAction(pendingAction);
      }
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

  return {
    closeMemberGate,
    isAuthenticated,
    requireMember,
    memberGateDialog: (
      <PublicMemberGateDialog
        onClose={closeMemberGate}
        onLogin={handleLogin}
        onSignup={handleSignup}
        open={isOpen}
      />
    ),
  };
}

export default usePublicMemberGate;
