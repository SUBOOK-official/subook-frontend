import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../lib/useFocusTrap";

function PublicAgreementDialog({ documentItem, onClose, open }) {
  const dialogRef = useRef(null);

  useFocusTrap(dialogRef, open && Boolean(documentItem));

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !documentItem) {
    return null;
  }

  return createPortal(
    <div className="public-sheet-backdrop" onClick={onClose}>
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
            onClick={onClose}
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
          <button className="public-auth-button public-auth-button--primary" onClick={onClose} type="button">
            닫기
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default PublicAgreementDialog;
