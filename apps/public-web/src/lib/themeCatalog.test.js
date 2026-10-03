import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorePopularity, loadThemeCatalog, orderThemeProductsByPopularity } from './themeCatalog.js';

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

test('theme popularity follows the complete main catalog across page caps and excludes unrelated products', async () => {
  const ids = [8, 3, 7, 1, 5];
  const offsets = [];
  const ranks = await loadStorePopularity(async ({ offset }) => {
    offsets.push(offset);
    return ids.slice(offset, offset + 2).map(id => ({ id, total_count: ids.length }));
  });
  const theme = [{ id: '5' }, { id: '1' }, { id: '3' }];
  assert.deepEqual(offsets, [0, 2, 4]);
  assert.deepEqual(orderThemeProductsByPopularity(theme, ranks).map(row => row.id), ['3', '1', '5']);
  assert.deepEqual(theme.map(row => row.id), ['5', '1', '3']);
});

test('new theme products absent from the ranking remain visible after ranked products', () => {
  const theme = [{ id: 4 }, { id: 2 }, { id: 6 }];
  assert.deepEqual(orderThemeProductsByPopularity(theme, new Map([['2', 0]])).map(row => row.id), [2, 4, 6]);
});

test('popularity failures are retryable errors instead of a silently incorrect ranking', async () => {
  await assert.rejects(loadStorePopularity(async () => { throw new Error('network'); }), /network/);
  await assert.rejects(loadStorePopularity(async () => [{ id: 1, total_count: 3 }]), /인기순/);
});
