import { useEffect, useRef } from "react";

function PublicToastMessage({ actionLabel, message, onAction, onClose, tone = "info" }) {
  // onClose가 인라인 화살표 함수로 들어오면 매 render마다 reference가 바뀐다.
  // useEffect deps에 그대로 두면 부모가 setInterval(예: resendCooldown) 등으로 매초 re-render할 때
  // cleanup이 매번 timer를 clear해서 토스트가 영영 사라지지 않는 버그가 생긴다.
  // ref로 onClose를 안정화 — message가 같으면 timer를 새로 설정하지 않는다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onCloseRef.current?.();
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message]);

  if (!message) {
    return null;
  }

  const isError = tone === "error";
  return (
    <div
      className={`public-toast public-toast--${tone}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="public-toast__body">
        <span aria-hidden="true" className="public-toast__icon">
          {tone === "success" ? "✓" : tone === "error" ? "!" : "i"}
        </span>
        <p className="public-toast__message">{message}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="public-toast__action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default PublicToastMessage;
