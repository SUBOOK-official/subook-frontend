import { useEffect, useState } from "react";
import {
  ILSEONG_APP_ACCESS_STATE_LABELS,
  ILSEONG_APP_ACCOUNT_NOTICE,
  ILSEONG_APP_LOGIN_GUIDE,
  ILSEONG_APP_REFUND_NOTICE,
} from "@shared-domain/ilseongApp";
import "./OrderAppAccess.css";

// 주문 상세의 일성월심 앱 안내 칸. 앱 패키지 주문이 아니면 아무것도 그리지 않는다.
// 앱 코드는 보여 주지 않는다 — 교재는 구매한 수북 계정으로 앱에 로그인하면 등록된다.
// loadAccess: () => Promise<{ data: { state, appDownloadUrl } | null, error }>, reloadKey가 바뀌면 다시 읽는다.
export default function OrderAppAccess({ loadAccess, reloadKey }) {
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let alive = true;
    loadAccess()
      .then(({ data }) => {
        if (alive) setAccess(data ?? null);
      })
      .catch(() => {
        if (alive) setAccess(null);
      });
    return () => {
      alive = false;
    };
    // loadAccess는 매 렌더 새 함수라 reloadKey로만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (!access) return null;

  if (access.state === "ended") {
    return (
      <section aria-label="일성월심 앱" className="order-app-access">
        <p className="order-app-access__title">일성월심 앱</p>
        <p className="order-app-access__state">{ILSEONG_APP_ACCESS_STATE_LABELS.ended}</p>
      </section>
    );
  }

  return (
    <section aria-label="일성월심 앱" className="order-app-access">
      <p className="order-app-access__title">일성월심 앱</p>
      <p className="order-app-access__guide">{ILSEONG_APP_LOGIN_GUIDE}</p>
      {access.state === "registered" ? (
        <p className="order-app-access__state order-app-access__state--registered">{ILSEONG_APP_ACCESS_STATE_LABELS.registered}</p>
      ) : null}
      {access.appDownloadUrl ? (
        <a className="order-app-access__link" href={access.appDownloadUrl} rel="noopener noreferrer" target="_blank">
          앱 받는 곳
        </a>
      ) : null}
      <p className="order-app-access__notice">{ILSEONG_APP_REFUND_NOTICE}</p>
    </section>
  );
}

// 상품 페이지·주문서 안내: 구매한 계정에만 등록된다는 것과 환불 시 앱 이용 종료
export function AppPackageNotice({ className = "" }) {
  return (
    <div className={`app-package-notice ${className}`.trim()}>
      <p>{ILSEONG_APP_ACCOUNT_NOTICE}</p>
      <p>{ILSEONG_APP_REFUND_NOTICE}</p>
    </div>
  );
}
