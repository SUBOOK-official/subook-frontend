import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { APP_MESSAGE, normalizeAppNextPath } from "@shared-domain/appBridge";
import { isSubookApp, postToApp, whenSubookAppReady } from "../lib/appBridge";
import { usePageMeta } from "../lib/usePageMeta";

function readCheckout(context) {
  const checkout = context?.checkout;
  const items = Array.isArray(checkout?.items)
    ? checkout.items.filter((item) => item && item.bookId !== undefined && item.bookId !== null)
    : [];
  return { items, guestMode: Boolean(checkout?.guestMode) };
}

// 수북 앱이 웹 화면을 열 때 쓰는 진입 경로(/app/*). 일반 브라우저에서는 홈으로 보낸다.
//   /app/login?next=/app/done|/app/checkout  기존 로그인 화면으로 이동, 끝나면 next로
//   /app/checkout                            앱이 넣어 준 교재로 주문서 열기
//   /app/done                                앱에 "끝났어요" 알리고 화면 닫기
export default function PublicAppBridgePage() {
  usePageMeta({ title: "수북", noindex: true });
  const { action } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSubookApp()) {
      navigate("/", { replace: true });
      return undefined;
    }
    if (action === "login") {
      const next = normalizeAppNextPath(new URLSearchParams(window.location.search).get("next"));
      navigate("/login", { replace: true, state: { from: next } });
      return undefined;
    }
    if (action !== "checkout") {
      postToApp(APP_MESSAGE.CLOSE);
      return undefined;
    }
    // 주문할 교재는 앱이 넣어 준다. 다 들어온 뒤에 주문서를 연다.
    let cancelled = false;
    void whenSubookAppReady().then((context) => {
      if (cancelled) return;
      const { items, guestMode } = readCheckout(context);
      if (items.length === 0) {
        postToApp(APP_MESSAGE.CLOSE);
        return;
      }
      navigate("/order", { replace: true, state: guestMode ? { items, guestMode: true } : { items } });
    });
    return () => {
      cancelled = true;
    };
  }, [action, navigate]);

  return null;
}
