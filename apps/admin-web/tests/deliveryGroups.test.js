import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/admin/cj-delivery.js';
import { combineDeliveryOrders, deliveryRevision, uniqueDeliveryLabels } from '../api/_lib/deliveryGroups.js';

const fixtureOrders = () => [1, 2].map((id) => ({
  id, user_id: 'buyer', order_number: `TEST-${id}`, status: 'preparing', tracking_number: null,
  shipping_recipient_name: '테스트', shipping_recipient_phone: '01012345678', shipping_postal_code: '12345',
  shipping_address_line1: '서울 테스트로 10', shipping_address_line2: '101호', shipping_memo: `메모${id}`,
  order_items: [{ id, title: `교재 ${id}`, quantity: id, unit_price: 5000, refunded_at: null }],
}));

test('합배송은 주문별 품목·수량·배송메모를 합치고 환불 품목을 제외한다', () => {
  const orders = fixtureOrders();
  orders[0].order_items.push({ id: 3, title: '환불 교재', quantity: 4, refunded_at: '2026-09-08' });
  const result = combineDeliveryOrders(orders.reverse());
  assert.deepEqual(result.order_numbers, ['TEST-1', 'TEST-2']);
  assert.equal(result.item_count, 3);
  assert.equal(result.order_items.length, 2);
  assert.equal(result.shipping_memo, '메모1 / 메모2');
  assert.equal(orders[1].order_items.length, 2);
});

test('여러 청크의 재출력 응답도 운송장별 한 장만 남긴다', () => {
  assert.equal(uniqueDeliveryLabels([
    { trackingNumber: '1234-5678-9012' }, { trackingNumber: '123456789012' },
    { trackingNumber: '123456789013' }, {},
  ]).length, 2);
});

test('미리보기 후 품목 환불·배송지 변경을 감지한다', () => {
  const orders = fixtureOrders();
  const before = deliveryRevision(orders);
  assert.equal(deliveryRevision([...orders].reverse()), before);
  orders[0].order_items[0].refunded_at = '2026-09-08';
  assert.notEqual(deliveryRevision(orders), before);
});

// HTTP 경계 통합 검사: Supabase와 CJ를 모두 가짜 응답으로 대체. 외부 발송 없음.
async function withApi(t, { loseBookingResponse = false, rejectBooking = false } = {}, run) {
  const env = { SUPABASE_URL: 'https://database.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    CJ_API_BASE_URL: 'https://courier.test', CJ_CUST_ID: 'fixture', CJ_BIZ_REG_NUM: '1234567890', CJ_LOGISTICS_MOCK: 'false' };
  const old = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => Object.entries(old).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }));
  const orders = fixtureOrders();
  let group = null;
  const bookings = [];
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.host === 'courier.test') {
      if (url.pathname === '/ReqOneDayToken') return response({ RESULT_CD: 'S', DATA: { TOKEN_NUM: 'fixture-token' } });
      if (url.pathname === '/ReqAddrRfnSm') return response({ RESULT_CD: 'S', DATA: { CLSFCD: '2T01', SUBCLSFCD: '1h' } });
      if (url.pathname === '/ReqInvcNo') return response({ RESULT_CD: 'S', DATA: { INVC_NO: '123456789012' } });
      if (url.pathname === '/RegBook') {
        bookings.push(body.DATA);
        if (loseBookingResponse) throw new TypeError('fetch failed');
        if (rejectBooking && bookings.length === 1) return response({ RESULT_CD: 'E', RESULT_DETAIL: '수취인 정보 확인 필요' });
        return response({ RESULT_CD: 'S' });
      }
    }
    if (url.pathname === '/auth/v1/user') return response({ id: 'admin-user' });
    if (url.pathname.endsWith('/rpc/is_admin_user')) return response(true);
    if (url.pathname.endsWith('/rpc/admin_plan_order_deliveries')) return response([[1, 2]]);
    if (url.pathname.endsWith('/rpc/admin_claim_order_delivery')) {
      if (group?.state === 'booking') return response({ message: 'CJ 접수 결과 확인 필요' }, 400);
      group ??= { id: 'group', claim_token: 'owner', state: 'claimed' };
      return response(group);
    }
    if (url.pathname.endsWith('/rpc/admin_transition_order_delivery')) {
      if (body.p_action === 'booking') {
        group = { ...group, state: 'booking', tracking_number: body.p_tracking_number, routing_data: body.p_routing_data };
      } else if (body.p_action === 'registered') {
        group.state = 'registered';
        orders.forEach((order) => Object.assign(order, { status: 'shipping', tracking_number: group.tracking_number, tracking_carrier: 'CJ대한통운' }));
      } else { group.state = 'failed'; }
      return response(group);
    }
    if (url.pathname === '/rest/v1/order_delivery_groups') return response(group);
    if (url.pathname === '/rest/v1/order_delivery_group_members') {
      return response(url.searchParams.has('order_id') ? { group_id: group.id } : [{ order_id: 1 }, { order_id: 2 }]);
    }
    if (url.pathname === '/rest/v1/orders') {
      const idFilter = url.searchParams.get('id') || '';
      return response(idFilter.startsWith('eq.') ? orders.find((order) => order.id === Number(idFilter.slice(3))) : orders);
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  });
  const invoke = async (body, authorized = true) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; }, setHeader() {} };
    await handler({ method: 'POST', headers: authorized ? { authorization: 'Bearer test-token' } : {}, body }, res);
    return res;
  };
  await run({ invoke, orders, bookings });
}

test('API: 단건 미리보기 → 두 주문 한 예약 → 어느 주문에서 재출력해도 한 장', async (t) => {
  await withApi(t, {}, async ({ invoke, bookings, orders }) => {
    assert.equal((await invoke({ orderId: 1 }, false)).statusCode, 401);
    const preview = await invoke({ orderId: 1, preview: true });
    assert.equal(bookings.length, 0);
    assert.deepEqual(preview.data.groups[0].orderIds, [1, 2]);
    const issued = await invoke({ orderIds: [1, 2], group: true, expectedRevision: preview.data.groups[0].revision });
    assert.equal(issued.data.results[0].success, true, JSON.stringify(issued.data));
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0].BOX_QTY, '1');
    assert.equal(bookings[0].ARRAY.length, 2);
    assert.equal(orders.filter((order) => order.tracking_number === '123456789012').length, 2);
    const reprint = await invoke({ orderIds: [2, 1], reprint: true });
    assert.equal(reprint.data.results.length, 1);
    assert.equal(reprint.data.results[0].order.item_count, 3);
    assert.equal(bookings.length, 1);
    const retry = await invoke({ orderIds: [1, 2], group: true });
    assert.equal(retry.data.results[0].status, 'skipped');
    assert.equal(bookings.length, 1);
  });
});

test('API: CJ 응답 유실은 자동 재예약하지 않고 기존 번호 확인을 요구한다', async (t) => {
  await withApi(t, { loseBookingResponse: true }, async ({ invoke, bookings }) => {
    const first = await invoke({ orderIds: [1, 2], group: true });
    assert.equal(first.data.results[0].success, false);
    assert.match(first.data.results[0].error, /123456789012/);
    await invoke({ orderIds: [1, 2], group: true });
    assert.equal(bookings.length, 1);
  });
});

test('API: 미리보기 후 내용이 바뀌면 CJ에 접수하지 않는다', async (t) => {
  await withApi(t, {}, async ({ invoke, bookings, orders }) => {
    const preview = await invoke({ orderId: 1, preview: true });
    orders[0].order_items[0].refunded_at = '2026-09-08';
    const issued = await invoke({ orderIds: [1, 2], group: true, expectedRevision: preview.data.groups[0].revision });
    assert.equal(issued.data.results[0].success, false);
    assert.equal(bookings.length, 0);
  });
});

test('API: CJ의 명시적 신규 접수 거부는 선점을 해제한다', async (t) => {
  await withApi(t, { rejectBooking: true }, async ({ invoke, bookings }) => {
    const first = await invoke({ orderIds: [1, 2], group: true });
    assert.equal(first.data.results[0].success, false);
    assert.match(first.data.results[0].error, /수취인 정보/);
    const retry = await invoke({ orderIds: [1, 2], group: true });
    assert.equal(retry.data.results[0].success, true);
    assert.equal(bookings.length, 2);
  });
});
