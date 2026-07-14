// 포인터 드래그 정렬의 순수 계산부 (AdminFaqsPage 등에서 사용).
// DOM 순서를 바꾸지 않고 transform으로만 움직이는 방식의 수학:
//   - mids: 드래그 시작 시점 각 카드의 세로 중심(페이지 좌표) 배열 (레이아웃 기준, 불변)
//   - 드래그 중인 카드의 시각적 중심 = mids[sourceIndex] + delta

/**
 * 드래그 중인 카드가 놓일 삽입 위치를 계산한다.
 * = 드래그 중인 카드의 시각적 중심보다 위에 있는 '다른 카드' 수
 */
export function computeReorderTarget(mids, sourceIndex, delta) {
  const draggedCenter = mids[sourceIndex] + delta;
  let target = 0;
  mids.forEach((mid, i) => {
    if (i !== sourceIndex && mid < draggedCenter) target += 1;
  });
  return target;
}

/**
 * 드래그 중 각 카드의 세로 오프셋(px).
 * 잡은 카드 사이~타깃 사이 구간의 카드만 슬롯 크기만큼 비켜난다.
 */
export function computeCardOffset(index, sourceIndex, targetIndex, slotSize) {
  if (index === sourceIndex) return 0; // 잡은 카드는 delta로 직접 움직임
  if (sourceIndex < index && index <= targetIndex) return -slotSize;
  if (targetIndex <= index && index < sourceIndex) return slotSize;
  return 0;
}

/** 배열에서 sourceIndex 요소를 targetIndex로 이동한 새 배열. */
export function reorderArray(list, sourceIndex, targetIndex) {
  const next = [...list];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}
