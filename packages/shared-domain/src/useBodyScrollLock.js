import { useEffect } from "react";

// 카운터 기반 single source-of-truth body scroll lock.
// 중첩 모달이 안전하게 동작하려면 모든 호출자가 이 훅을 써야 함.
let lockCount = 0;
let originalOverflow = null;
let originalPaddingRight = null;

function applyLock() {
  if (typeof document === "undefined") return;
  if (lockCount > 0) {
    lockCount += 1;
    return;
  }

  const body = document.body;
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  originalOverflow = body.style.overflow;
  originalPaddingRight = body.style.paddingRight;

  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  lockCount = 1;
}

function releaseLock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const body = document.body;
  body.style.overflow = originalOverflow ?? "";
  body.style.paddingRight = originalPaddingRight ?? "";
  originalOverflow = null;
  originalPaddingRight = null;
}

export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    applyLock();
    return () => {
      releaseLock();
    };
  }, [active]);
}

export default useBodyScrollLock;
