import { useEffect, useId, useRef, useState } from "react";
import { isLowStockCount } from "../lib/publicFeaturedProducts";
import { trackEvent } from "../lib/analytics";
import { ChevronUpIcon } from "./icons";
import "./ProductPurchase.css";

// 회차를 고르면 선택 목록에 추가하고 닫는다. 같은 회차를 다시 고르면 재고 내에서 +1.
export default function ProductOptionPicker({ groups, selections, onAdd, productId, showLowStock = false }) {
  const id = useId();
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const availableIndexes = groups.flatMap((group, index) => group.soldOut ? [] : [index]);

  const toggleOpen = (next) => {
    trackEvent("product_option_open", {
      itemId: String(productId), uiAction: next ? "open" : "close",
      optionCount: groups.length,
      soldoutCount: groups.filter(group => group.soldOut).length,
    });
    if (next) setActiveIndex(availableIndexes[0] ?? -1);
    setIsOpen(next);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    listRef.current?.focus({ preventScroll: true });
    const closeOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isOpen]);

  const closeAndFocus = () => {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const selectOption = (group) => {
    if (!group || group.soldOut) return;
    onAdd(group.key);
    closeAndFocus();
  };

  const handleListKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(groups[activeIndex]);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!availableIndexes.length) return;
    const position = availableIndexes.indexOf(activeIndex);
    const nextPosition = event.key === "Home" ? 0 : event.key === "End" ? availableIndexes.length - 1
      : (position + (event.key === "ArrowDown" ? 1 : -1) + availableIndexes.length) % availableIndexes.length;
    const nextIndex = availableIndexes[nextPosition];
    setActiveIndex(nextIndex);
    listRef.current?.children[nextIndex]?.scrollIntoView({ block: "nearest" });
  };

  if (!groups.length) return null;

  return <section className="product-options" aria-labelledby={`${id}-label`} ref={containerRef}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
    <h2 className="product-options__label" id={`${id}-label`}>옵션 선택</h2>
    <div className="product-options__dropdown">
      <button ref={triggerRef} type="button" className={`product-options__trigger${isOpen ? " is-open" : ""}`}
        aria-haspopup="listbox" aria-expanded={isOpen} aria-controls={isOpen ? `${id}-list` : undefined}
        onClick={() => toggleOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            toggleOpen(true);
            if (event.key === "ArrowUp") setActiveIndex(availableIndexes.at(-1) ?? -1);
          }
        }}>
        <span>옵션을 선택해 주세요</span><ChevronUpIcon size={16} />
      </button>
      {isOpen && <ul ref={listRef} id={`${id}-list`} role="listbox" tabIndex={-1}
        aria-labelledby={`${id}-label`} aria-multiselectable="true"
        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        className="product-options__list" onKeyDown={handleListKeyDown}>
        {groups.map((group, index) => <li key={group.key} id={`${id}-option-${index}`} role="option"
          aria-disabled={group.soldOut || undefined}
          aria-selected={selections.some(item => item.key === group.key)}
          className={`product-options__option${group.soldOut ? " is-disabled" : ""}${index === activeIndex ? " is-active" : ""}`}
          onClick={() => selectOption(group)}>
          <span>{group.label}</span>
          {group.soldOut ? <span className="product-options__badge">품절</span>
            : showLowStock && isLowStockCount(group.availableCount) ? <span className="product-options__badge">품절임박</span> : null}
        </li>)}
      </ul>}
    </div>
  </section>;
}
