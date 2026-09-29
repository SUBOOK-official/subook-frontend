// 버전별로 고정한 50:50 배정. 저장이 불가능하면 실험에 편입하지 않는다.
const EXPERIMENTS = new Set(['guest_checkout_guide_v1', 'pickup_preparation_v1']);
const PREFIX = 'subook:experiment:';
export function experimentVariant(name, options = {}) {
  if (!EXPERIMENTS.has(name)) return null;
  try {
    const storage = options.storage ?? globalThis.localStorage;
    const crypto = options.crypto ?? globalThis.crypto;
    const prior = storage.getItem(PREFIX + name);
    if (prior === 'control' || prior === 'guide') return prior;
    const variant = crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'control' : 'guide';
    storage.setItem(PREFIX + name, variant);
    return variant;
  } catch { return null; }
}
export function experimentParams(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    return Object.fromEntries([...EXPERIMENTS].flatMap((name) => {
      const value = store.getItem(PREFIX + name);
      return value === 'control' || value === 'guide' ? [[name, value]] : [];
    }));
  } catch { return {}; }
}
