// 실제 로그인/문자 발송 없이 OAuth 복귀 → 계정 조회 → 화면 이동을 검증한다.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5189';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const now = new Date().toISOString();
const id = '00000000-0000-0000-0000-000000000931';
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'callback@example.invalid',
  created_at: now, app_metadata: { provider: 'kakao', providers: ['kakao'] },
  identities: [{ provider: 'kakao' }], user_metadata: {} };
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;

async function runScenario({ name, role = 'member', identity = 'unverified', hang = false,
  hangSession = false, identityError = false, enabled = true, expected }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/kakao-phone') return json({ success: true, status: 'sms_required' });
    if (url.pathname.startsWith('/api/')) return json([]);
    if (url.origin === origin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({ status: 204, body: '' });
    const rpc = url.pathname.split('/').pop();
    if (rpc === 'user') return hangSession ? undefined : json(user);
    if (rpc === 'get_member_identity_policy') return json({ enabled: true, email_required: true });
    if (hang && ['get_current_auth_account_role', 'get_my_member_identity'].includes(rpc)) return;
    if (rpc === 'get_my_member_identity') return identityError
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) })
      : json({ enabled, status: identity });
    if (rpc === 'get_current_auth_account_role') return json([{ account_role: role, user_id: id,
      email: user.email, email_verified_at: now, terms_agreed_at: role === 'member' ? now : null }]);
    return json([]);
  });
  try {
    const hash = new URLSearchParams({ access_token: token, refresh_token: 'fixture-only',
      provider_token: 'fixture-kakao', expires_in: '3600', token_type: 'bearer', type: 'signup' });
    await page.goto(`${origin}/auth/callback?next=%2Ffaq#${hash}`);
    if (hang || hangSession) {
      await page.getByRole('link', { name: '로그인 화면으로 돌아가기' }).waitFor({ timeout: 10000 });
    }
    await page.waitForURL(url => url.pathname === expected, { timeout: hang || hangSession ? 40000 : 10000 });
    if (hang || hangSession || identityError || !enabled) {
      await page.getByText('로그인 정보를 확인하지 못했어요. 잠시 후 다시 로그인해 주세요.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => history.state.usr.from), '/faq');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${name} → ${expected}`);
  } catch (error) {
    console.error(`FAIL: ${name}: path=${new URL(page.url()).pathname}; errors=${JSON.stringify(errors)}`);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await runScenario({ name: '기존 카카오 회원·휴대폰 미인증', expected: '/auth/verify-phone' });
  await runScenario({ name: '프로필 없는 소셜 계정', role: 'unknown', expected: '/auth/verify-phone' });
  await runScenario({ name: '번호 확인 후 약관 미동의', role: 'unknown', identity: 'verified', expected: '/auth/oauth-consent' });
  await runScenario({ name: '인증 완료 회원', identity: 'verified', expected: '/faq' });
  await runScenario({ name: '차단 회원', role: 'blocked', expected: '/login' });
  await runScenario({ name: '통합 기록이 있어도 차단 상태 유지', role: 'blocked', identity: 'merged', expected: '/login' });
  await runScenario({ name: '탈퇴 회원', role: 'withdrawn', expected: '/login' });
  await runScenario({ name: '관리자 전용 계정', role: 'admin', expected: '/login' });
  await runScenario({ name: '해결되지 않은 계정 상태', role: 'unknown', enabled: false, expected: '/login' });
  await runScenario({ name: '번호 인증 조회 실패', identityError: true, expected: '/login' });
  const pendingResults = await Promise.allSettled([
    runScenario({ name: '계정 조회 무응답', hang: true, expected: '/login' }),
    runScenario({ name: '세션 초기화 무응답', hangSession: true, expected: '/login' }),
  ]);
  for (const result of pendingResults) if (result.status === 'rejected') throw result.reason;
} finally {
  await browser.close();
}
