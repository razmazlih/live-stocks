#!/usr/bin/env node
/** Synthetic browser regression only: no Auth0, credentials, or database calls. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { createOwnerCapture } from './capture-owner.mjs';

// Use a normal project installation, or an explicitly supplied external install.
// See --help for a reproducible installation that does not change package.json.
if (process.argv.includes('--help')) {
  console.log(`Synthetic owner-capture browser regression (Node 20+):
  npm install --prefix /tmp/livestocks-browser-tools --no-save playwright@1.62.1
  /tmp/livestocks-browser-tools/node_modules/.bin/playwright install chromium
  OWNER_CAPTURE_PLAYWRIGHT=/tmp/livestocks-browser-tools/node_modules/playwright/index.mjs node scripts/test-owner-capture.mjs

If playwright is installed in this checkout, run node scripts/test-owner-capture.mjs.
The test uses random loopback ports and a fresh headless browser profile. It loads
no dotenv/setup files, saves no identity, and blocks non-test browser requests.`);
  process.exit(0);
}
const modulePath = process.env.OWNER_CAPTURE_PLAYWRIGHT;
if (modulePath && !isAbsolute(modulePath)) throw new Error('OWNER_CAPTURE_PLAYWRIGHT must be an absolute local module path.');
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright').catch(() => {
  throw new Error('Playwright is unavailable. Run node scripts/test-owner-capture.mjs --help for setup.');
});
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(server.address().port); });
});
const close = async server => {
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
};
const checks = [];
const diagnostics = [];
let capture; let browser; let owner; let writes = 0; let appOrigin; let providerOrigin;
const app = createServer((request, response) => {
  capture.handle(request, response).catch(() => { response.writeHead(500); response.end('Synthetic handler failed'); });
});
const provider = createServer((request, response) => {
  const incoming = new URL(request.url, providerOrigin);
  const callback = new URL('/auth/callback', appOrigin);
  callback.search = new URLSearchParams({ state: incoming.searchParams.get('state'), iss: `${providerOrigin.replace('http:', 'https:')}/`, code: 'synthetic-code' }).toString();
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<a href="${callback.href.replaceAll('&', '&amp;')}">Synthetic sign in</a>`);
});
try {
  appOrigin = `http://localhost:${await listen(app)}`;
  providerOrigin = `http://127.0.0.1:${await listen(provider)}`;
  for (const localOrigin of ['https://localhost:3109', 'http://example.invalid:3109', `${appOrigin}/`, `${appOrigin}?x=1`]) {
    assert.throws(() => createOwnerCapture({ env: {}, localOrigin }));
  }
  checks.push('only explicit localhost HTTP origins allowed');
  capture = createOwnerCapture({ localOrigin: appOrigin,
    env: { AUTH0_DOMAIN: new URL(providerOrigin).host, AUTH0_CLIENT_ID: 'synthetic-client', AUTH0_WEB_AUDIENCE: 'https://example.invalid/web' },
    exchangeCode: async () => ({ access_token: 'synthetic-access', id_token: 'synthetic-id' }),
    verifyAccess: async () => ({ userId: 'synthetic-user', expiresAt: Math.floor(Date.now() / 1000) + 600 }),
    verifyId: async () => ({ sub: 'synthetic-user', email: 'synthetic@example.invalid', email_verified: true, name: '<Synthetic & owner>' }),
    persistOwner: async value => { owner = value; writes++; },
    onDiagnostic: value => diagnostics.push(value),
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  context.setDefaultTimeout(10000);
  const blockedRequests = [];
  await context.route('**/*', route => {
    if ([appOrigin, providerOrigin].includes(new URL(route.request().url()).origin)) return route.continue();
    blockedRequests.push('unexpected-request'); return route.abort();
  });
  const page = await context.newPage();
  const authorization = new URL(capture.authorizationUrl());
  authorization.protocol = 'http:'; // Only this fake provider uses HTTP; JWT verification is injected.
  await page.goto(authorization.href);
  await page.getByRole('link', { name: 'Synthetic sign in' }).click();
  await page.waitForURL(`${appOrigin}/continue`);
  assert.equal((await page.locator('body').innerText()).includes('synthetic@example.invalid'), false);
  assert.equal(owner, undefined);
  checks.push('cross-site callback clears OAuth parameters', 'neutral landing discloses no identity');
  const cookies = await context.cookies();
  assert.equal(cookies.length, 1); assert.equal(cookies[0].httpOnly, true); assert.equal(cookies[0].sameSite, 'Strict');
  checks.push('Strict HttpOnly cookie retained');
  await page.getByRole('link', { name: 'המשך לאישור החשבון' }).click();
  await page.getByRole('button', { name: 'אשר שזה החשבון להעברת התיק הקיים' }).waitFor();
  assert.equal(owner, undefined); assert.equal(diagnostics.at(-1).cookieMatches, true);
  assert.equal(await page.locator('dd').first().innerText(), '<Synthetic & owner>');
  checks.push('same-origin link sends cookie', 'identity text safely escaped', 'GET does not persist owner');
  const csrf = await page.locator('input[name=csrf]').inputValue();
  for (const [label, origin, form] of [
    ['wrong Origin rejected', 'http://evil.example', { csrf, confirm: 'yes' }],
    ['null Origin rejected', 'null', { csrf, confirm: 'yes' }],
    ['wrong CSRF rejected', appOrigin, { csrf: 'wrong', confirm: 'yes' }],
    ['caller owner injection rejected', appOrigin, { csrf, confirm: 'yes', userId: 'attacker' }],
  ]) {
    const response = await context.request.post(`${appOrigin}/confirm`, { headers: { Origin: origin, 'sec-fetch-site': 'same-origin' }, form });
    assert.equal(response.status(), 403, label); assert.equal(owner, undefined); checks.push(label);
  }
  const anonymous = await fetch(`${appOrigin}/confirm`);
  assert.equal(anonymous.status, 401); assert.equal(owner, undefined); checks.push('missing cookie rejected');
  await page.getByRole('button', { name: 'אשר שזה החשבון להעברת התיק הקיים' }).click();
  await page.getByRole('heading', { name: 'החשבון אושר' }).waitFor();
  assert.equal(owner.userId, 'synthetic-user'); assert.equal(writes, 1); assert.equal(owner.refreshToken, undefined);
  assert.equal(diagnostics.at(-1).originMatches, true); assert.equal(diagnostics.at(-1).fetchSite, 'same-origin');
  checks.push('real browser form preserves exact Origin', 'CSRF-bound POST persists verified owner once', 'optional refresh supported');
  const replay = await context.request.post(`${appOrigin}/confirm`, { headers: { Origin: appOrigin }, form: { csrf, confirm: 'yes' } });
  assert.equal(replay.status(), 409); assert.equal(writes, 1); checks.push('confirmation replay rejected');
  assert.deepEqual(blockedRequests, []);
  console.log(JSON.stringify({ status: 'PASS', checks, humanBrowserAccessed: false, externalNetwork: false,
    limits: ['Synthetic token verifiers; this test does not verify Auth0 JWTs, hosted services, or owner migration.'] }, null, 2));
} finally {
  if (browser) await browser.close();
  capture?.clear();
  await Promise.all([close(app), close(provider)]);
}
