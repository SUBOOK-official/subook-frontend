import { useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const previouslyFocused = document.activeElement;

    const handleTab = (event) => {
      if (event.key !== "Tab") return;

      const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleTab);

    return () => {
      container.removeEventListener("keydown", handleTab);
      if (previouslyFocused instanceof HTMLElement) {
        try {
          previouslyFocused.focus({ preventScroll: true });
        } catch {
          previouslyFocused.focus();
        }
      }
    };
  }, [containerRef, active]);
}

export default useFocusTrap;
