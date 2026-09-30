import test from 'node:test';
import assert from 'node:assert/strict';
import { loadThemeCatalog } from './themeCatalog.js';

test('loads later theme pages when the server caps the requested limit', async () => {
  const offsets = [];
  const result = await loadThemeCatalog(async ({ offset }) => {
    offsets.push(offset);
    return { theme: { id: 'theme' }, products: [{ id: offset + 1 }, { id: offset + 2 }], total_count: 6 };
  });
  assert.deepEqual(offsets, [0, 2, 4]);
  assert.deepEqual(result.products.map(row => row.id), [1, 2, 3, 4, 5, 6]);
});
test('fails instead of returning a partial theme when pagination stalls', async () => {
  await assert.rejects(loadThemeCatalog(async () => ({ theme: { id: 'theme' }, products: [{ id: 1 }], total_count: 3 })));
});
test('does not expose products for an unavailable theme', async () => {
  assert.deepEqual(await loadThemeCatalog(async () => ({ theme: null, products: [{ id: 1 }] })), { theme: null, products: [] });
});
