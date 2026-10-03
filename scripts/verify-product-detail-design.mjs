// 옵션 UI 변경을 브라우저에서 검증한다. 인증·재고·주문 등 외부 요청은 모두 모의 응답이다.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const books = [
  { id: 900001, option: '7', price: 6000, available_count: 1 },
  { id: 900002, option: '7', price: 7000, available_count: 1 },
  { id: 900003, option: '10', price: 8000, available_count: 1 },
  { id: 900004, option: '11', price: 8000, available_count: 0, status: 'sold_out' },
];

async function setup(options = books, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.startsWith('/api/')) return json([]);
    if (url.origin === origin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({ status: 204, body: '' });
    if (url.pathname.endsWith('/get_public_store_product_detail')) return json({
      product: { id: 900000, title: '옵션 UI 검증 교재', brand: '시대인재', subject: '수학', book_type: '모의고사' },
      options: options.map(book => ({ title: '옵션 UI 검증 교재', product_id: 900000, condition_grade: 'S', status: 'on_sale', ...book })),
      related_products: [],
    });
    return json([]);
  });
  await page.goto(origin + '/store/900000');
  await page.getByRole('heading', { name: '옵션 UI 검증 교재', exact: true, level: 1 }).waitFor();
  return { page, context, errors };
}

try {
  const desktop = await setup();
  const { page } = desktop;
  const picker = page.getByRole('region', { name: '옵션 선택', exact: true });
  const option7 = picker.getByRole('button', { name: /옵션 7 / });
  const option10 = picker.getByRole('button', { name: /옵션 10 / });
  assert.equal(await picker.getByRole('button', { name: /옵션 11 품절/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '바로 구매하기', exact: true }).isDisabled(), true);
  await option7.click();
  await page.getByRole('button', { name: '옵션 7 수량 늘리기', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '옵션 7 수량 늘리기', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('.public-detail-hero__summary-total').innerText(), '13,000원');
  await option10.click();
  assert.equal(await page.locator('.public-detail-hero__summary-total').innerText(), '21,000원');
  await option7.click();
  assert.equal(await option7.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.public-detail-hero__summary-total').innerText(), '8,000원');
  await page.getByRole('button', { name: '옵션 10 옵션 제거', exact: true }).click();
  assert.equal(await option10.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#detail-section-grade').count(), 0);
  assert.equal(await page.locator('[class*="public-detail-chip--grade"]').count(), 0);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px 가로 넘침`);
  }
  const bar = page.getByRole('region', { name: '구매 액션 바' });
  await bar.getByRole('button', { name: '옵션 선택', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '옵션 UI 검증 교재', exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('button', { name: '구매 옵션 닫기' }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
  await dialog.getByRole('button', { name: /옵션 7 /, pressed: false }).click();
  await dialog.getByRole('button', { name: '옵션 7 수량 늘리기', exact: true }).click();
  await dialog.getByRole('button', { name: /옵션 10 /, pressed: false }).click();
  assert.equal(await dialog.locator('.product-option-sheet__footer strong').innerText(), '21,000원');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await dialog.getByRole('button', { name: '선택 완료', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.textContent === '옵션 변경');
  assert.equal(await bar.locator('.public-detail-sticky-bar__price-value').innerText(), '21,000원');
  await bar.getByRole('button', { name: '옵션 변경', exact: true }).click();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const single = await setup(books.slice(0, 2), 390);
  assert.equal(await single.page.getByRole('region', { name: '옵션 선택', exact: true }).count(), 0);
  assert.equal(await single.page.locator('.public-detail-hero__summary-total').innerText(), '6,000원');
  assert.equal(await single.page.getByRole('button', { name: '옵션 7 옵션 제거' }).count(), 0);
  assert.deepEqual(single.errors, []);
  await single.context.close();

  const soldOut = await setup(books.map(book => ({ ...book, status: 'sold_out', available_count: 0 })), 390);
  assert.equal(await soldOut.page.getByRole('button', { name: '옵션 선택', exact: true }).count(), 0);
  assert.equal(await soldOut.page.locator('.public-detail-sticky-bar').getByRole('button', { name: '재입고 알림', exact: true }).isVisible(), true);
  assert.deepEqual(soldOut.errors, []);
  await soldOut.context.close();
  console.log('PASS: 1440/1024/768/390/320px, 복수 선택·해제·재고 수량 상한·권별 다른 가격 합계·단일 옵션 자동 선택·품절·모바일 시트·키보드 포커스·Escape. 외부 요청은 모두 mocked.');
} finally {
  await browser.close();
}
