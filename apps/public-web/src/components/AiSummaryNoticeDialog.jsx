import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@shared-domain/useBodyScrollLock";
import { useFocusTrap } from "@shared-domain/useFocusTrap";
import { CloseIcon } from "./icons";

function AiSummaryNoticeDialog({ onClose, open }) {
  const dialogRef = useRef(null);

  useFocusTrap(dialogRef, open);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="public-sheet-backdrop" onClick={onClose}>
      <section
        aria-labelledby="ai-summary-notice-title"
        aria-modal="true"
        className="public-sheet public-ai-summary-notice"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="public-sheet__drag-handle" />
        <div className="public-sheet__header">
          <h2 className="public-sheet__title" id="ai-summary-notice-title">
            AI 교재 요약 안내
          </h2>
          <button
            aria-label="AI 교재 요약 안내 닫기"
            className="public-sheet__close"
            onClick={onClose}
            type="button"
          >
            <CloseIcon size={24} />
          </button>
        </div>
        <div className="public-sheet__body">
          <ul className="public-ai-summary-notice__list">
            <li>
              수북의 교재 정보와 공개 검색 결과를 바탕으로 AI가 작성한 소개입니다.
            </li>
            <li>
              생성 시점과 검색 결과에 따라 부정확한 내용이 포함되거나 일부 정보가 누락될 수
              있습니다.
            </li>
            <li>
              분권·회차·부록 등 실제 구성은 판매 옵션, 상세 사진, 검수 정보를 구매 전에 확인해
              주세요.
            </li>
            <li>
              AI 요약과 판매 옵션·상세 사진이 다를 경우 판매 옵션과 상세 사진을 기준으로 합니다.
            </li>
          </ul>
          <p className="public-ai-summary-notice__note">
            AI 요약은 교재 선택을 돕는 참고 정보이며 수북 운영자가 내용을 검수·수정할 수 있습니다.
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default AiSummaryNoticeDialog;
