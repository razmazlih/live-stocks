#!/usr/bin/env node
// Live Auth0 gate. Secrets/tokens remain in a private temporary directory.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet } from 'jose';
import ts from 'typescript';

process.umask(0o077);
const directory = process.env.AUTH0_SETUP_DIR;
if (!directory || !/^\/private\/tmp\/livestocks-auth0-setup(?:-[A-Za-z0-9]+)?$/.test(directory)) throw new Error('A dedicated private setup directory is required.');
const env = JSON.parse(readFileSync(`${directory}/env.json`, 'utf8'));
const setup = JSON.parse(readFileSync(`${directory}/state.json`, 'utf8'));
const playwrightPath = process.env.AUTH0_GATE_PLAYWRIGHT;
if (!playwrightPath) throw new Error('Set AUTH0_GATE_PLAYWRIGHT to the installed Playwright module.');
const { chromium } = await import(playwrightPath);
const issuer = `https://${env.AUTH0_DOMAIN}/`;
const configuration = { issuer, websiteClientId: env.AUTH0_CLIENT_ID, mcpClientId: env.AUTH0_MCP_CLIENT_ID, websiteAudience: env.AUTH0_WEB_AUDIENCE, mcpAudience: env.AUTH0_MCP_AUDIENCE };
const source = readFileSync(new URL('../lib/auth/auth0-token.ts', import.meta.url), 'utf8').replace("from 'jose'", `from '${import.meta.resolve('jose')}'`);
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createAuth0TokenVerifier } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const verify = createAuth0TokenVerifier({ ...configuration, jwks: createRemoteJWKSet(new URL('.well-known/jwks.json', issuer)) });
const save = (name, data) => { const path = `${directory}/${name}`; writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 }); chmodSync(path, 0o600); };
const report = { issuer, startedAt: new Date().toISOString(), status: 'INCOMPLETE', cases: [], limits: ['Synthetic database accounts only; does not prove Google owner login, ChatGPT host compatibility, or hosted Supabase third-party integration.'] };
const tokens = { config: configuration };
const pending = new Map();
let browser;
const servers = [];
const scopes = { web: 'openid profile email offline_access portfolio:read portfolio:write', mcp: 'offline_access portfolio:read' };
function client(kind) { return kind === 'web' ? { id: env.AUTH0_CLIENT_ID, secret: env.AUTH0_CLIENT_SECRET, callback: 'http://localhost:3109/auth/callback' } : { id: env.AUTH0_MCP_CLIENT_ID, secret: env.AUTH0_MCP_CLIENT_SECRET, callback: 'http://localhost:3110/callback' }; }
function record(name, status, details = {}) { const entry = { name, status, ...details }; report.cases.push(entry); save('gate-report.json', report); console.log(JSON.stringify(entry)); }
async function exchange(kind, fields) {
  const app = client(kind);
  const response = await fetch(new URL('oauth/token', issuer), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: app.id, client_secret: app.secret, ...fields }), signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  return { status: response.status, body };
}
async function accepted(result, kind, expectedUser) {
  if (!result.body?.access_token) return false;
  try { const identity = await verify(result.body.access_token, kind); return identity.userId === expectedUser; } catch { return false; }
}
async function authorize(kind, userIndex, parameters = {}, name = 'authorize') {
  const app = client(kind); const user = setup.syntheticUsers[userIndex];
  const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(32).toString('base64url');
  const url = new URL('authorize', issuer);
  const fields = { client_id: app.id, redirect_uri: app.callback, response_type: 'code', scope: scopes[kind], state, nonce: randomBytes(32).toString('base64url'), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', connection: user.connection, prompt: 'login', ...parameters };
  for (const [key, value] of Object.entries(fields)) if (value !== null && value !== undefined) url.searchParams.set(key, value);
  let callback;
  pending.set(state, value => { callback = value; });
  const context = await browser.newContext(); const page = await context.newPage();
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const deadline = Date.now() + 25000;
    let submitted = false;
    while (!callback && Date.now() < deadline) {
      const email = page.getByRole('textbox', { name: 'Email address', exact: true });
      const password = page.getByRole('textbox', { name: 'Password', exact: true });
      if (!submitted && await email.count() && await email.isVisible()) {
        await email.fill(user.email);
        if (await password.count() && await password.isVisible()) await password.fill(user.password);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        submitted = true;
      } else {
        let clicked = false;
        for (const label of ['Accept', 'Allow', 'Authorize', 'Continue']) {
          const button = page.getByRole('button', { name: label, exact: true });
          if (await button.count() === 1 && await button.isVisible()) { await button.click(); clicked = true; break; }
        }
        if (!clicked && !callback) {
          let text = await page.locator('body').innerText().catch(() => '');
          if (/Service not found|not authorized|unauthorized|invalid_request|invalid_target|access_denied|no connections enabled|not allowed|Unable to issue|Oops!/i.test(text)) {
            const details = page.getByText('See details for this error', { exact: true });
            if (await details.count() && await details.isVisible()) { await details.click(); text = await page.locator('body').innerText(); }
            save(`page-${name}.json`, { text, path: new URL(page.url()).pathname });
            return { error: 'authorization_page_rejected', recognized: /Service not found|not authorized|unauthorized|invalid_request|invalid_target|access_denied|not allowed/.test(text) };
          }
        }
      }
      if (!callback) await page.waitForTimeout(150);
    }
    if (!callback) { save(`page-${name}.json`, { text: await page.locator('body').innerText(), path: new URL(page.url()).pathname }); return { error: 'authorization_incomplete' }; }
    if (callback.get('state') !== state || callback.get('iss') !== issuer) return { error: 'callback_binding_failed' };
    const code = callback.get('code');
    return code ? { code, verifier, redirect_uri: app.callback } : { error: callback.get('error') || 'authorization_denied', recognized: true };
  } finally { pending.delete(state); await context.close(); }
}
async function codeTokens(kind, userIndex, parameters, name, tokenParameters = {}) {
  const authorization = await authorize(kind, userIndex, parameters, name);
  if (!authorization.code) return { status: 0, body: { error: authorization.error }, authorization };
  return exchange(kind, { grant_type: 'authorization_code', code: authorization.code, code_verifier: authorization.verifier, redirect_uri: authorization.redirect_uri, ...tokenParameters });
}
async function positive(name, kind, userIndex) {
  const audience = kind === 'web' ? configuration.websiteAudience : configuration.mcpAudience;
  const result = await codeTokens(kind, userIndex, kind === 'web' ? { audience } : { resource: audience }, name, kind === 'mcp' ? { resource: audience } : {});
  const valid = await accepted(result, kind, setup.syntheticUsers[userIndex].user_id);
  record(name, valid ? 'PASS' : 'INCOMPLETE', { httpStatus: result.status, tokenAccepted: valid, refreshTokenPresent: Boolean(result.body.refresh_token), oauthError: safeError(result.body.error) });
  if (!valid) { save(`private-${name}.json`, result); return null; }
  return result.body;
}
function safeError(value) { return typeof value === 'string' && /^[a-z0-9_-]{1,80}$/.test(value) ? value : undefined; }
async function negative(name, authorizeParameters, tokenParameters = {}) {
  const result = await codeTokens('mcp', 0, authorizeParameters, name, tokenParameters);
  const valid = await accepted(result, 'mcp', setup.syntheticUsers[0].user_id);
  const explicit = result.authorization?.recognized || (result.status >= 400 && result.status < 500 && ['invalid_target', 'invalid_request', 'invalid_grant', 'access_denied', 'unauthorized_client'].includes(result.body.error));
  const rejectedToken = Boolean(result.body.access_token) && !valid;
  record(name, valid ? 'FAIL' : explicit || rejectedToken ? 'PASS' : 'INCOMPLETE', { httpStatus: result.status, tokenAccepted: valid, tokenIssued: Boolean(result.body.access_token), oauthError: safeError(result.body.error) });
}
try {
  for (const port of [3109, 3110]) {
    const server = createServer((request, response) => {
      const url = new URL(request.url, `http://localhost:${port}`);
      pending.get(url.searchParams.get('state'))?.(url.searchParams);
      response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); response.end('LiveStocks compatibility check completed.');
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); servers.push(server);
  }
  browser = await chromium.launch({ headless: true });
  const webA = await positive('web_account_a', 'web', 0);
  const webB = await positive('web_account_b', 'web', 1);
  if (webA) tokens.webAToken = webA.access_token;
  if (webB) tokens.webBToken = webB.access_token;
  if (process.argv.includes('--web-only')) save('tokens.json', tokens);
  if (process.argv.includes('--web-only')) { report.status = webA && webB ? 'PASS_WEB_ONLY' : 'INCOMPLETE'; }
  else {
    const mcpA = await positive('mcp_account_a', 'mcp', 0);
    if (mcpA) { tokens.mcpAToken = mcpA.access_token; save('tokens.json', tokens); }
    if (!webA || !webB || !mcpA) throw new Error('Positive controls incomplete; negative gate not evaluated.');
    record('same_account_across_clients_and_two_account_separation', setup.syntheticUsers[0].user_id !== setup.syntheticUsers[1].user_id ? 'PASS' : 'FAIL');
    await negative('authorize_wrong_resource', { resource: 'https://invalid.example/mcp' }, { resource: 'https://invalid.example/mcp' });
    await negative('authorize_missing_resource', {}, {});
    await negative('authorize_contradictory_audience_resource', { audience: configuration.mcpAudience, resource: 'https://invalid.example/mcp' }, { resource: 'https://invalid.example/mcp' });
    await negative('exchange_wrong_pkce', { resource: configuration.mcpAudience }, { resource: configuration.mcpAudience, code_verifier: randomBytes(32).toString('base64url') });
    await negative('exchange_wrong_resource', { resource: configuration.mcpAudience }, { resource: 'https://invalid.example/mcp' });
    const omittedExchange = await codeTokens('mcp', 0, { resource: configuration.mcpAudience }, 'exchange_missing_resource', {});
    const omittedBound = await accepted(omittedExchange, 'mcp', setup.syntheticUsers[0].user_id);
    record('exchange_missing_resource', omittedBound ? 'PASS' : omittedExchange.body.access_token ? 'FAIL' : 'INCOMPLETE', {
      httpStatus: omittedExchange.status, tokenAccepted: omittedBound, tokenIssued: Boolean(omittedExchange.body.access_token),
      expected: 'Omitted token-request resource must preserve the originally authorized canonical grant target.',
      oauthError: safeError(omittedExchange.body.error),
    });
    const refreshed = await exchange('mcp', { grant_type: 'refresh_token', refresh_token: mcpA.refresh_token, resource: configuration.mcpAudience });
    const refreshAccepted = await accepted(refreshed, 'mcp', setup.syntheticUsers[0].user_id);
    record('refresh_positive', refreshAccepted ? 'PASS' : 'INCOMPLETE', { httpStatus: refreshed.status, tokenAccepted: refreshAccepted });
    const wrongRefresh = await exchange('mcp', { grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token || mcpA.refresh_token, resource: 'https://invalid.example/mcp' });
    const wrongAccepted = await accepted(wrongRefresh, 'mcp', setup.syntheticUsers[0].user_id);
    const actionDeniedResource = !wrongRefresh.body.access_token && wrongRefresh.body.error === 'access_denied'
      && typeof wrongRefresh.body.error_description === 'string'
      && wrongRefresh.body.error_description.includes('The requested resource is not authorized for LiveStocks MCP.');
    save('private-refresh-negative.json', wrongRefresh);
    record('refresh_wrong_resource', wrongAccepted ? 'FAIL' : actionDeniedResource ? 'PASS' : 'INCOMPLETE', {
      httpStatus: wrongRefresh.status, tokenAccepted: wrongAccepted, actionDeniedResource, oauthError: safeError(wrongRefresh.body.error),
    });
    const omittedRefresh = await exchange('mcp', { grant_type: 'refresh_token', refresh_token: wrongRefresh.body.refresh_token || refreshed.body.refresh_token || mcpA.refresh_token });
    const omittedRefreshBound = await accepted(omittedRefresh, 'mcp', setup.syntheticUsers[0].user_id);
    record('refresh_missing_resource', omittedRefreshBound ? 'PASS' : omittedRefresh.body.access_token ? 'FAIL' : 'INCOMPLETE', {
      httpStatus: omittedRefresh.status, tokenAccepted: omittedRefreshBound, expected: 'Omitted refresh resource preserves the original canonical grant target.',
    });
    const managerResponse = await fetch(new URL('oauth/token', issuer), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.AUTH0_MANAGEMENT_CLIENT_ID, client_secret: env.AUTH0_MANAGEMENT_CLIENT_SECRET,
        audience: `${issuer}api/v2/`, scope: 'read:grants delete:grants' }), signal: AbortSignal.timeout(15000) });
    const manager = await managerResponse.json();
    if (!managerResponse.ok || typeof manager.access_token !== 'string') throw new Error('Restricted grant-manager token was unavailable.');
    const managerScopes = new Set(String(manager.scope).split(' '));
    record('grant_manager_exact_scopes', managerScopes.size === 2 && managerScopes.has('read:grants') && managerScopes.has('delete:grants') ? 'PASS' : 'FAIL');
    const grantUrl = new URL('api/v2/grants', issuer);
    grantUrl.search = new URLSearchParams({ user_id: setup.syntheticUsers[0].user_id, client_id: env.AUTH0_MCP_CLIENT_ID, audience: configuration.mcpAudience }).toString();
    const grantResponse = await fetch(grantUrl, { headers: { Authorization: `Bearer ${manager.access_token}` }, signal: AbortSignal.timeout(15000) });
    if (!grantResponse.ok) throw new Error('Restricted grant inspection failed; no broader cleanup attempted.');
    const raw = await grantResponse.json(); const grants = Array.isArray(raw) ? raw : raw.grants;
    const matching = grants.filter(grant => grant.user_id === setup.syntheticUsers[0].user_id && (grant.clientID || grant.client_id) === env.AUTH0_MCP_CLIENT_ID && grant.audience === configuration.mcpAudience);
    if (!matching.length || !omittedRefreshBound) record('grant_deletion_revokes_refresh', 'INCOMPLETE', { reason: 'no_matching_grant_or_live_refresh_control' });
    else {
      for (const grant of matching) {
        const deletion = await fetch(new URL(`api/v2/grants/${encodeURIComponent(grant.id)}`, issuer), { method: 'DELETE', headers: { Authorization: `Bearer ${manager.access_token}` }, signal: AbortSignal.timeout(15000) });
        if (!deletion.ok) throw new Error('Synthetic grant deletion failed.');
      }
      const revoked = await exchange('mcp', { grant_type: 'refresh_token', refresh_token: omittedRefresh.body.refresh_token, resource: configuration.mcpAudience });
      record('grant_deletion_revokes_refresh', !revoked.body.access_token && revoked.body.error === 'invalid_grant' && [400, 403].includes(revoked.status) ? 'PASS' : 'FAIL', { httpStatus: revoked.status, tokenIssued: Boolean(revoked.body.access_token), oauthError: safeError(revoked.body.error) });
    }
    report.status = report.cases.some(item => item.status === 'FAIL') ? 'FAIL' : report.cases.some(item => item.status === 'INCOMPLETE') ? 'INCOMPLETE' : 'PASS_AUTH0_GATE';
  }
} catch (error) {
  save('gate-private-error.json', { name: error?.name, message: error?.message });
  record('gate_execution', 'INCOMPLETE', { reason: 'See private diagnostic; no credential details emitted.' });
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  report.completedAt = new Date().toISOString(); save('gate-report.json', report);
  console.log(JSON.stringify({ status: report.status, reportPath: `${directory}/gate-report.json`, tokenPath: `${directory}/tokens.json` }));
  process.exitCode = ['PASS_AUTH0_GATE', 'PASS_WEB_ONLY'].includes(report.status) ? 0 : report.status === 'FAIL' ? 1 : 2;
}
