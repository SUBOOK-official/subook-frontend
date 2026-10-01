// 디자인 변경 후 로그인 계약을 검증한다. 모든 인증/DB/외부 요청은 모의 응답이다.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4173';
const output = '.codex/qa-screenshots'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const now = new Date().toISOString();
const id = '00000000-0000-0000-0000-000000000921';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'login@example.invalid', email_confirmed_at: now,
  created_at: now, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} };
const payload = { sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const session = { access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`,
  refresh_token: 'fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: payload.exp, user };
async function setup({ socialOnly = false, success = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const state = { submissions: [], oauth: null };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/api/')) return json([]);
    if (url.origin === origin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({ status: 204, body: '' });
    const name = url.pathname.split('/').pop();
    if (name === 'authorize') {
      state.oauth = { provider: url.searchParams.get('provider'), redirect: url.searchParams.get('redirect_to') };
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>OAuth fixture</h1>' });
    }
    if (name === 'token') {
      state.submissions.push(route.request().postDataJSON());
      return success ? json(session) : json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (name === 'user') return json(user);
    if (name === 'get_member_auth_providers') return json(socialOnly ? ['kakao'] : ['email']);
    if (name === 'is_legacy_sixshop_email') return json(false);
    if (name === 'get_member_identity_policy') return json({ enabled: true, phone_signup_enabled: false, email_required: true, legacy_phone_login_enabled: true });
    if (name === 'get_my_member_identity') return json({ enabled: true, status: 'verified', phone: '01000000001' });
    if (name === 'get_current_auth_account_role') return json([{ account_role: 'member', user_id: id, email: user.email, name: '테스트회원',
      phone: '01000000001', email_verified_at: now, terms_agreed_at: now, privacy_agreed_at: now }]);
    if (name === 'get_signup_referral_offer') return json({ active: true, code_valid: false, amount: 4000, min_order_amount: 30000, valid_days: 30 });
    if (name === 'complete_signup_referral') return json({ status: 'no_referral' });
    if (name === 'get_my_signup_referral') return json({ code: 'a'.repeat(32), can_invite: true, sent_reward: null });
    if (name === 'is_admin_user') return json(false);
    return json([]);
  });
  // 이전 요청 경로가 로그인/OAuth 후에도 유지되는지 확인한다.
  await context.addInitScript(() => {
    if (location.pathname === '/login') history.replaceState({ ...history.state, usr: { from: '/event/invite' } }, '');
  });
  await page.goto(origin + '/login');
  await page.getByRole('heading', { name: '로그인', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, context, state, errors };
}
try {
  const login = await setup();
  const { page } = login;
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/login-design-${width}.png`, fullPage: true });
  }
  assert.equal(await page.getByText('이메일을 등록하지 않은 기존 계정 찾기').count(), 0);
  assert.equal(await page.getByRole('link', { name: '비밀번호 찾기', exact: true }).getAttribute('href'), '/forgot-password');
  assert.equal(await page.getByRole('link', { name: '회원가입', exact: true }).getAttribute('href'), '/signup');
  assert.equal(await page.getByRole('link', { name: '비회원 주문 조회' }).getAttribute('href'), '/order/lookup');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  assert.equal(await page.getByText('필수 항목입니다.', { exact: true }).count(), 2);
  assert.equal(login.state.submissions.length, 0);
  await page.getByLabel('이메일', { exact: true }).fill('invalid');
  await page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
  assert.equal(await page.getByLabel('비밀번호', { exact: true }).getAttribute('type'), 'text');
  await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByText('이메일 형식을 확인해주세요.', { exact: true }).waitFor();
  await page.getByLabel('이메일', { exact: true }).fill('login@example.invalid');
  await page.getByLabel('이메일', { exact: true }).press('Enter');
  assert.equal(await page.getByLabel('비밀번호', { exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByText('이메일 또는 비밀번호가 일치하지 않습니다.', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/login-design-error-mobile.png`, fullPage: true });
  assert.deepEqual(login.errors, []); await login.context.close();
  const social = await setup({ socialOnly: true });
  await social.page.getByLabel('이메일', { exact: true }).fill(user.email);
  await social.page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await social.page.getByRole('button', { name: '로그인', exact: true }).click();
  await social.page.getByText('이 이메일은 카카오 로그인으로 가입된 계정이에요.', { exact: false }).waitFor();
  assert.deepEqual(social.errors, []); await social.context.close();
  for (const [provider, label] of [['kakao', '카카오로 시작하기'], ['google', 'Google로 시작하기']]) {
    const oauth = await setup();
    await oauth.page.getByRole('button', { name: label, exact: true }).click();
    await oauth.page.getByRole('heading', { name: 'OAuth fixture' }).waitFor();
    assert.equal(oauth.state.oauth.provider, provider);
    assert.equal(new URL(oauth.state.oauth.redirect).searchParams.get('next'), '/event/invite');
    assert.deepEqual(oauth.errors, []); await oauth.context.close();
  }
  const valid = await setup({ success: true });
  await valid.page.getByLabel('이메일', { exact: true }).fill(user.email);
  await valid.page.getByLabel('비밀번호', { exact: true }).fill('fixture-password');
  await valid.page.getByRole('checkbox', { name: '로그인 상태 유지' }).check();
  await valid.page.getByRole('button', { name: '로그인', exact: true }).click();
  await valid.page.waitForURL(origin + '/event/invite');
  assert.equal(await valid.page.evaluate(() => localStorage.getItem('subook.public.auth.persist')), 'true');
  assert.deepEqual(valid.errors, []); await valid.context.close();
  console.log('PASS: 1440/768/390/320px, 유효성·비밀번호 표시·Enter·소셜 전용 안내·카카오/구글 시작·이메일 성공·기존 경로/세션 유지. 모든 인증 요청 mocked.');
} finally { await browser.close(); }
