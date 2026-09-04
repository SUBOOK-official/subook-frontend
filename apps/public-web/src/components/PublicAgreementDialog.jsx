import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { trackDialogClose } from "../lib/analytics";

// analyticsSurface(선택): 어느 폼의 약관 모달인지 — signup / oauth_consent …
// 열람 자체(agreement_view)는 호출부가 발화하고, 여기서는 닫는 방식만 남긴다.
function PublicAgreementDialog({ analyticsSurface = "", documentItem, onClose, open }) {
  const dialogRef = useRef(null);
  const active = open && Boolean(documentItem);

  useFocusTrap(dialogRef, active);
  useBodyScrollLock(active);

  const closeWith = useCallback(
    (closeMethod) => {
      // GA4 dialog_close — 약관을 끝까지 보고 닫았는지(버튼) vs 흘려 닫았는지(배경/ESC)
      trackDialogClose("agreement", closeMethod, {
        ...(documentItem?.key ? { policyKey: documentItem.key } : {}),
        ...(analyticsSurface ? { formName: analyticsSurface } : {}),
      });
      onClose();
    },
    [analyticsSurface, documentItem, onClose],
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeWith("escape");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeWith, open]);

  if (!open || !documentItem) {
    return null;
  }

  return createPortal(
    <div className="public-sheet-backdrop" onClick={() => closeWith("backdrop")}>
      <section
        aria-labelledby="public-agreement-dialog-title"
        aria-modal="true"
        className="public-sheet"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="public-sheet__drag-handle" />
        <div className="public-sheet__header">
          <div>
            <p className="public-sheet__eyebrow">{documentItem.tagLabel}</p>
            <h2 className="public-sheet__title" id="public-agreement-dialog-title">
              {documentItem.title}
            </h2>
          </div>
          <button
            aria-label="약관 닫기"
            className="public-sheet__close"
            onClick={() => closeWith("close_button")}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="public-sheet__body">
          {documentItem.paragraphs.map((paragraph) => (
            <p className="public-sheet__paragraph" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </div>
        <div className="public-sheet__footer">
          <button
            className="public-auth-button public-auth-button--primary"
            onClick={() => closeWith("submit")}
            type="button"
          >
            닫기
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default PublicAgreementDialog;
