// 실제 회원/쿠폰을 변경하지 않는 브라우저 검증. 인증·API 응답은 모두 모의 데이터다.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const project = new URL(parseEnv(readFileSync('.env', 'utf8')).VITE_SUPABASE_URL).hostname.split('.')[0];
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4173';
const output = '.codex/qa-screenshots'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const id = '00000000-0000-0000-0000-000000000911';
const now = new Date().toISOString();
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'receipt@example.invalid', email_confirmed_at: now,
  created_at: now, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { name: '테스트회원' } };
const payload = { sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const session = { access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`,
  refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: payload.exp, user };
const code = 'a'.repeat(32);
async function setup({ signedIn = true, completed = false, received = false, friendName = '김*북', expired = false, fail = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const state = { completed, reads: 0 };
  if (signedIn) await context.addInitScript(({ key, session }) => sessionStorage.setItem(key, JSON.stringify(session)), { key: `sb-${project}-auth-token`, session });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/api/')) return json([]);
    if (url.origin === origin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({ status: 204, body: '' });
    const name = url.pathname.split('/').pop();
    if (name === 'user') return json(user);
    if (name === 'get_member_identity_policy') return json({ enabled: true, phone_signup_enabled: false, email_required: true });
    if (name === 'get_my_member_identity') return json({ enabled: true, status: 'verified', phone: '01000000001' });
    if (name === 'get_current_auth_account_role') return json([{ account_role: 'member', user_id: id, email: user.email, name: '테스트회원',
      phone: '01000000001', email_verified_at: now, terms_agreed_at: now, privacy_agreed_at: now }]);
    if (name === 'get_signup_referral_offer') return json({ active: true, code_valid: !expired, code_expired: expired, amount: 4000, min_order_amount: 30000, valid_days: 30 });
    if (name === 'complete_signup_referral') return json({ status: received ? 'rewarded' : 'no_referral' });
    if (name === 'get_my_signup_referral') {
      state.reads++;
      if (fail) return json({ code: 'P0001', message: '초대 정보를 확인할 수 없습니다.' }, 400);
      return json({ code, can_invite: !state.completed, reward_count: state.completed ? 1 : 0, received_reward: received,
        sent_reward: state.completed ? { friend_name: friendName, rewarded_at: '2026-10-01T10:00:00Z' } : null });
    }
    if (name === 'is_admin_user') return json(false);
    return json([]);
  });
  await page.goto(origin + '/event/invite' + (expired ? `?ref=${code}` : ''));
  return { page, context, errors, state };
}
try {
  const waiting = await setup();
  await waiting.page.getByRole('button', { name: '친구에게 초대 링크 보내기' }).waitFor();
  assert.equal(await waiting.page.getByText('함께 쌓은 혜택', { exact: true }).count(), 0);
  assert.equal(await waiting.page.getByText('수북 친구 초대', { exact: true }).count(), 0);
  assert.equal(await waiting.page.getByText('지급 완료', { exact: true }).count(), 0);
  await waiting.page.screenshot({ path: `${output}/referral-waiting-desktop.png`, fullPage: true });
  waiting.state.completed = true;
  await waiting.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waiting.page.getByText('지급 완료', { exact: true }).waitFor();
  await waiting.page.getByRole('heading', { name: '나의 초대로 김*북님이 가입했어요!' }).waitFor();
  assert.equal(await waiting.page.getByRole('button', { name: '친구에게 초대 링크 보내기' }).count(), 0);
  assert.equal(await waiting.page.locator('#invite-link').count(), 0);
  assert.equal(await waiting.page.getByRole('link', { name: '내 쿠폰 확인하기' }).getAttribute('href'), '/mypage#coupons');
  await waiting.page.getByText('2026년 10월 1일 지급', { exact: true }).waitFor();
  await waiting.page.screenshot({ path: `${output}/referral-receipt-desktop.png`, fullPage: true });
  for (const width of [390, 320]) {
    await waiting.page.setViewportSize({ width, height: 844 });
    assert.equal(await waiting.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await waiting.page.screenshot({ path: `${output}/referral-receipt-${width}.png`, fullPage: true });
  }
  assert.deepEqual(waiting.errors, []); await waiting.context.close();
  const guest = await setup({ signedIn: false });
  await guest.page.getByRole('link', { name: '로그인하고 친구 초대하기' }).waitFor();
  assert.equal(await guest.page.locator('.invite-receipt').count(), 0);
  await guest.context.close();
  const received = await setup({ received: true });
  await received.page.getByText('초대받아 가입한 4,000원 쿠폰이 지급되었어요.', { exact: false }).waitFor();
  assert.equal(await received.page.locator('.invite-receipt').count(), 0);
  await received.context.close();
  const missingName = await setup({ completed: true, friendName: null });
  await missingName.page.getByRole('heading', { name: '나의 초대로 친구가 가입했어요!' }).waitFor();
  await missingName.context.close();
  const expired = await setup({ signedIn: false, expired: true });
  await expired.page.getByText('이미 초대가 완료되어 만료된 링크입니다.', { exact: false }).waitFor();
  assert.equal(await expired.page.getByRole('link', { name: '가입하고 4,000원 쿠폰 받기' }).count(), 0);
  await expired.context.close();
  const failed = await setup({ fail: true });
  await failed.page.getByRole('button', { name: '다시 시도', exact: true }).waitFor();
  assert.equal(await failed.page.locator('.invite-receipt').count(), 0);
  await failed.context.close();
  console.log('PASS: 게스트/초대 전/포커스 자동 갱신/지급 완료/친구 역할 구분/이름 없음/만료/오류/390·320px. 실제 문자·회원·쿠폰 변경 없음.');
} finally { await browser.close(); }
