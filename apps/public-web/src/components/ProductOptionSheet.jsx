import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@shared-domain/format";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { CloseIcon } from "./icons";
import "./ProductPurchase.css";

export default function ProductOptionSheet({ title, subtotal, count, children, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  useBodyScrollLock(true);
  useFocusTrap(dialogRef, true);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return createPortal(<div className="product-option-sheet-backdrop" onClick={onClose}>
    <section className="product-option-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
      ref={dialogRef} onClick={event => event.stopPropagation()}>
      <div className="product-option-sheet__handle" aria-hidden="true" />
      <header className="product-option-sheet__header">
        <div><span>구매 옵션</span><h2 id={titleId}>{title}</h2></div>
        <button type="button" aria-label="구매 옵션 닫기" ref={closeRef} onClick={onClose}><CloseIcon size={22} /></button>
      </header>
      <div className="product-option-sheet__body">{children}</div>
      <footer className="product-option-sheet__footer">
        <div><span>{count}권 선택</span><strong aria-live="polite">{formatCurrency(subtotal)}</strong></div>
        <button type="button" disabled={!count} onClick={onClose}>선택 완료</button>
      </footer>
    </section>
  </div>, document.body);
}
