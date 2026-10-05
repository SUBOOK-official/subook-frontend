import { formatCurrency } from "@shared-domain/format";
import "./RefundItemPicker.css";

export default function RefundItemPicker({ items = [], selectedIds = [], onChange, disabled = false }) {
  const eligible = items.filter(item => !item.refundedAt);
  const selected = eligible.filter(item => selectedIds.includes(item.id));
  return (
    <fieldset className="refund-item-picker" disabled={disabled}>
      <legend>환불할 교재 <span>필수</span></legend>
      <p className="refund-item-picker__hint">같은 교재라도 회차가 다를 수 있어요. 옵션을 확인해 선택해주세요.</p>
      {eligible.length > 1 ? <button className="refund-item-picker__all" type="button" onClick={() => onChange(selected.length === eligible.length ? [] : eligible.map(item => item.id))}>
        {selected.length === eligible.length ? "전체 선택 해제" : "전체 선택"}
      </button> : null}
      <div className="refund-item-picker__list">
        {items.map(item => (
          <label key={item.id} className={`refund-item-picker__item${selectedIds.includes(item.id) ? " is-selected" : ""}${item.refundedAt ? " is-refunded" : ""}`}>
            <input type="checkbox" disabled={Boolean(item.refundedAt) || disabled} checked={!item.refundedAt && selectedIds.includes(item.id)} onChange={() => onChange(selectedIds.includes(item.id) ? selectedIds.filter(id => id !== item.id) : [...selectedIds, item.id])} />
            {item.coverImageUrl ? <img src={item.coverImageUrl} alt="" className="refund-item-picker__cover" /> : null}
            <span className="refund-item-picker__details">
              <strong>{item.title}</strong>
              <span className="refund-item-picker__option">옵션: {item.optionLabel || "옵션 없음"}</span>
              <span className="refund-item-picker__meta">{item.gradeLabel ? `${item.gradeLabel} · ` : ""}{item.quantity}권 · {formatCurrency(item.price)}{item.refundedAt ? " · 환불 완료" : ""}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="refund-item-picker__summary" aria-live="polite">
        {selected.length ? `${selected.reduce((sum, item) => sum + Number(item.quantity || 1), 0)}권 선택했어요` : eligible.length ? "환불할 교재를 한 권 이상 선택해주세요." : "환불 신청할 수 있는 교재가 없습니다."}
      </p>
    </fieldset>
  );
}
