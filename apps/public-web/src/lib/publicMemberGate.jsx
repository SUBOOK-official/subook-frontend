import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PublicMemberGateDialog from "../components/PublicMemberGateDialog";
import { usePublicAuth } from "../contexts/PublicAuthContext";
import { createMemberGateRedirectState } from "./publicMemberGateUtils";

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
    (nextActionType = "", nextRedirectTarget = null) => {
      if (isAuthenticated) {
        return true;
      }

      setActionType(nextActionType);
      setRedirectTarget(nextRedirectTarget);
      setIsOpen(true);
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
