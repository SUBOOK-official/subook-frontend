import { useId } from "react";
import { formatCurrency } from "@shared-domain/format";
import { isLowStockCount } from "../lib/publicFeaturedProducts";
import { CheckIcon } from "./icons";
import "./ProductPurchase.css";

// 실제 옵션 이름은 보존한다. 숫자만 있는 라벨도 '옵션 7'로 맥락을 알려준다.
export default function ProductOptionPicker({ groups, selections, onAdd, onRemove, showLowStock = false }) {
  const titleId = useId();
  return <section className="product-options" aria-labelledby={titleId}>
    <div className="product-options__heading">
      <h2 id={titleId}>옵션 선택</h2><span>{groups.length}개 옵션</span>
    </div>
    <div className="product-options__grid">
      {groups.map(group => {
        const selected = selections.some(item => item.key === group.key);
        const prices = group.availableBooks.map(book => book.price).filter(Number.isFinite);
        const priceRange = new Set(prices).size > 1;
        const label = /^\d+$/.test(group.label) ? `옵션 ${group.label}` : group.label;
        return <button key={group.key} type="button" disabled={group.soldOut}
          aria-pressed={selected} className={`product-options__item${selected ? " is-selected" : ""}`}
          onClick={() => selected ? onRemove(group.key) : onAdd(group.key)}>
          <span className="product-options__item-top"><span>{label}</span>
            <span className="product-options__check" aria-hidden="true">{selected && <CheckIcon size={13} />}</span>
          </span>
          <span className="product-options__item-bottom">
            <strong>{group.soldOut ? "품절" : group.unitPrice == null ? "가격 미입력" : `${formatCurrency(group.unitPrice)}${priceRange ? "부터" : ""}`}</strong>
            {showLowStock && !group.soldOut && isLowStockCount(group.availableCount) && <small>품절임박</small>}
          </span>
        </button>;
      })}
    </div>
  </section>;
}
