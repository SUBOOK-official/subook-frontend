// 뷰포트 진입 1회 콜백 — 노출(view_item_list / view_promotion / *_view) 계열 GA 이벤트를
// "마운트 시점"이 아니라 "실제로 화면에 들어온 시점"에 한 번만 발화시키기 위한 훅.
// IntersectionObserver가 없는 환경(구형 브라우저·테스트)에서는 즉시 1회 호출로 폴백한다.
// threshold 기본값 0 = 요소의 어느 한 픽셀이라도 뷰포트에 들어오면 발화. (0.25처럼 비율을
// 요구하면 뷰포트보다 4배 넘게 긴 그리드는 모바일에서 영영 발화하지 않는다)
// 관찰을 시작하는 시점에 요소가 이미 뷰포트 "위로" 지나가 있으면(lazy 청크가 늦게 마운트된
// 후기 섹션 등) IntersectionObserver는 다시 교차하지 않으므로, 그 경우는 노출로 간주해 즉시 발화한다.
//
// 사용:
//   const railRef = useRef(null);
//   useInViewOnce(railRef, () => trackViewItemList("비슷한 교재 추천", lines), {
//     enabled: lines.length > 0,   // 데이터 준비 전엔 관찰하지 않음
//     resetKey: productId,         // 값이 바뀌면 다시 1회 발화 가능(상품 전환 등)
//   });
import { useEffect, useRef } from "react";

function hasAlreadyScrolledPast(node) {
  if (typeof node.getBoundingClientRect !== "function") return false;
  const rect = node.getBoundingClientRect();
  return rect.height > 0 && rect.bottom <= 0;
}

export function useInViewOnce(
  targetRef,
  onVisible,
  { enabled = true, rootMargin = "0px", threshold = 0, resetKey } = {},
) {
  const firedRef = useRef(false);
  const callbackRef = useRef(onVisible);
  callbackRef.current = onVisible;

  // resetKey가 바뀌면(예: 상세 페이지에서 다른 상품으로 이동) 다시 발화 가능 상태로.
  useEffect(() => {
    firedRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || firedRef.current) return undefined;
    const node = targetRef?.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined" || hasAlreadyScrolledPast(node)) {
      firedRef.current = true;
      callbackRef.current?.();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (firedRef.current) return;
        if (entries.some((entry) => entry.isIntersecting)) {
          firedRef.current = true;
          observer.disconnect();
          callbackRef.current?.();
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [targetRef, enabled, rootMargin, threshold, resetKey]);

  return firedRef;
}
