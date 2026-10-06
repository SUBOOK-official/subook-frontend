export const REGISTER_DRAFT_PREFIX = "subook.admin.register.draft.v2.";
export const LEGACY_REGISTER_DRAFT = "subook.admin.register.draft.v1";

// 저장 직전에 읽은 버전을 비교하여 다른 탭의 초안을 덮어쓰지 않는다.
export function createAdminDraftStore(storage, shipmentId) {
  const key = `${REGISTER_DRAFT_PREFIX}${shipmentId || "unassigned"}`;
  let expected = storage.getItem(key);
  return {
    key,
    read() { return expected ? JSON.parse(expected) : null; },
    write(payload) {
      if (storage.getItem(key) !== expected) throw new Error("다른 탭에서 이 수거 건의 초안을 변경했습니다. 현재 내용을 복사한 뒤 새로고침해 주세요.");
      const serialized = JSON.stringify(payload);
      storage.setItem(key, serialized);
      expected = serialized;
    },
    clear() {
      if (storage.getItem(key) !== expected) throw new Error("다른 탭의 초안은 지우지 않았습니다. 새로고침해 확인해 주세요.");
      storage.removeItem(key);
      expected = null;
    },
  };
}
