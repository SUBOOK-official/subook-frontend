import { useEffect } from "react";

function PublicToastMessage({ actionLabel, message, onAction, onClose, tone = "info" }) {
  useEffect(() => {
    if (!message || !onClose) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onClose();
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message, onClose]);

  if (!message) {
    return null;
  }

  return (
    <div className={`public-toast public-toast--${tone}`} role="status">
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
