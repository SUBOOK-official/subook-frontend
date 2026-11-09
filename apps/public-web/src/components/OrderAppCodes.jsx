import { useEffect, useState } from "react";
import { ILSEONG_APP_CODE_STATE_LABELS, ILSEONG_APP_HOW_TO, ILSEONG_APP_REFUND_NOTICE } from "@shared-domain/ilseongApp";
import { trackCopyClick } from "../lib/analytics";
import "./OrderAppCodes.css";

function AppCodeRow({ line, label, surface }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!line.code || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(line.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // GA4 복사 — 코드 값은 보내지 않는다
      trackCopyClick("app_code", surface, "ok");
    } catch {
      trackCopyClick("app_code", surface, "fail");
    }
  };
  const showCode = Boolean(line.code) && (line.state === "issued" || line.state === "redeemed");
  return (
    <li className={`order-app-codes__row order-app-codes__row--${line.state}`}>
      <span className="order-app-codes__label">{label}</span>
      {showCode ? (
        <>
          <code className="order-app-codes__code">{line.code}</code>
          {line.state === "redeemed" ? <span className="order-app-codes__state">{ILSEONG_APP_CODE_STATE_LABELS.redeemed}</span> : null}
          <button aria-label={`${label} 앱 코드 복사`} className="order-app-codes__copy" onClick={handleCopy} type="button">
            {copied ? "복사됨" : "복사"}
          </button>
        </>
      ) : (
        <span className="order-app-codes__state">{ILSEONG_APP_CODE_STATE_LABELS[line.state] ?? ILSEONG_APP_CODE_STATE_LABELS.pending}</span>
      )}
    </li>
  );
}

// 주문의 일성월심 앱 코드 칸. 앱 패키지 주문이 아니면 아무것도 그리지 않는다.
// loadLines: () => Promise<{ data: lines[], error }>, reloadKey가 바뀌면 다시 읽는다.
export default function OrderAppCodes({ loadLines, reloadKey, surface = "order_detail" }) {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    let alive = true;
    loadLines()
      .then(({ data }) => {
        if (alive) setLines(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setLines([]);
      });
    return () => {
      alive = false;
    };
    // loadLines는 매 렌더 새 함수라 reloadKey로만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (lines.length === 0) return null;

  const counts = lines.reduce((acc, line) => ({ ...acc, [line.title]: (acc[line.title] ?? 0) + 1 }), {});
  const seen = {};
  return (
    <section aria-label="앱 코드" className="order-app-codes">
      <p className="order-app-codes__title">앱 코드</p>
      <ul className="order-app-codes__list">
        {lines.map((line) => {
          seen[line.title] = (seen[line.title] ?? 0) + 1;
          const label = counts[line.title] > 1 ? `${line.title} ${seen[line.title]}` : line.title;
          return <AppCodeRow key={line.line_ref} label={label} line={line} surface={surface} />;
        })}
      </ul>
      <p className="order-app-codes__guide">{ILSEONG_APP_HOW_TO}</p>
      <p className="order-app-codes__notice">{ILSEONG_APP_REFUND_NOTICE}</p>
    </section>
  );
}

// 상품 페이지·주문서 안내 한 줄
export function AppPackageNotice({ className = "" }) {
  return <p className={`app-package-notice ${className}`.trim()}>{ILSEONG_APP_REFUND_NOTICE}</p>;
}
