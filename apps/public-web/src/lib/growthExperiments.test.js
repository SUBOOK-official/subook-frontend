import test from 'node:test';
import assert from 'node:assert/strict';
import { experimentVariant, experimentParams } from './growthExperiments.js';
test('배정은 재방문에도 유지하고 저장 실패/알 수 없는 실험은 편입하지 않는다', () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  const crypto = { getRandomValues: (v) => { v[0] = 200; return v; } };
  assert.equal(experimentVariant('guest_checkout_guide_v1', { storage, crypto }), 'guide');
  crypto.getRandomValues = () => { throw new Error('no reassignment'); };
  assert.equal(experimentVariant('guest_checkout_guide_v1', { storage, crypto }), 'guide');
  assert.deepEqual(experimentParams(storage), { guest_checkout_guide_v1: 'guide' });
  assert.equal(experimentVariant('unknown', { storage, crypto }), null);
  assert.equal(experimentVariant('pickup_preparation_v1', { storage: null, crypto }), null);
});
