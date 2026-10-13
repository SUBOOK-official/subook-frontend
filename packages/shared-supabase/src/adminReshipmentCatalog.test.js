import test from 'node:test';
import assert from 'node:assert/strict';
import { searchReshipmentProducts } from './adminReshipmentCatalog.js';
import { reshipmentProductOptions, toReshipmentItem } from '../../shared-domain/src/orderReshipments.js';

test('원 주문 천체편과 다른 고체편을 재고 0이어도 선택하고 송장 내용으로 전달한다', async () => {
  const product = { id: 2520, title: 'Apollo.N 지구과학1 이신혁T', option: '유체편',
    options: [{ option: '고체편', stock_count: 0 }, { option: '천체편', stock_count: 0 }, { option: '유체편', stock_count: 1 }] };
  const client = { rpc(name, params) {
    assert.equal(name, 'admin_search_products_for_register');
    assert.equal(params.p_search, product.title);
    return { abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return { data: [product] }; } };
  } };
  const [found] = await searchReshipmentProducts(client, product.title);
  const choices = reshipmentProductOptions(found);
  assert.equal(choices.length, 3);
  assert.equal(choices[0].stock, 0);
  assert.deepEqual(toReshipmentItem({ orderItemId: 1416, quantity: '1', ...choices[0] }), {
    orderItemId: 1416, quantity: 1, title: `${product.title} · 고체편`, replacementProductId: 2520, replacementOption: '고체편',
  });
});

test('옵션 없는 교재와 기존 발급 요청 재시도의 내용을 보존한다', () => {
  assert.equal(reshipmentProductOptions({ id: 2, title: '다른 교재', options: [] })[0].title, '다른 교재');
  const legacy = { orderItemId: 1416, title: '직접 입력했던 교재', quantity: 1 };
  assert.deepEqual(toReshipmentItem({ ...legacy, selected: true, max: 1 }), legacy);
});

test('검색 빈 값은 호출하지 않고 일시적 실패만 한 번 재시도한다', async () => {
  assert.deepEqual(await searchReshipmentProducts(null, '  '), []);
  let attempts = 0;
  const client = { rpc: () => ({ abortSignal: async () => ++attempts === 1 ? { error: { message: 'offline' } } : { data: [] } }) };
  assert.deepEqual(await searchReshipmentProducts(client, '아폴로'), []);
  assert.equal(attempts, 2);
  attempts = 0;
  const unavailable = { rpc: () => ({ abortSignal: async () => { attempts++; throw new Error('offline'); } }) };
  await assert.rejects(searchReshipmentProducts(unavailable, '아폴로'), /다시 검색/);
  assert.equal(attempts, 2);
});

test('권한 오류는 재시도하지 않는다', async () => {
  let attempts = 0;
  const client = { rpc: () => ({ abortSignal: async () => { attempts++; return { error: { code: '42501' } }; } }) };
  await assert.rejects(searchReshipmentProducts(client, '아폴로'), /권한/);
  assert.equal(attempts, 1);
});
