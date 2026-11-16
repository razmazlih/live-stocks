/** Full HTTP OAuth-to-MCP regression against the disposable fixture only.
 * No production credentials, trade execution or confirmation calls are allowed.
 * Only synthetic proposals/grants are created. Secrets never enter the report.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';

export async function runOAuthSyncGate({ state, sdk, snapshot }) {
  assert.equal(state.kind, 'livestocks-disposable-chat-sync-v1');
  assert.equal(state.productionAccess, false);
  assert.equal(state.status, 'ready');
  assert.match(state.runtime, /^\/private\/tmp\/livestocks-chat-sync-runtime-/);
  assert.equal(new URL(state.adminDatabaseUrl).hostname, '127.0.0.1');
  assert.equal(state.users.length, 2);
  const origin = state.origin, resource = origin + '/api/mcp';
  const issuerPath = '/api/auth', callback = state.callback;
  assert.equal(new URL(callback).hostname, 'chatgpt.com');
  const scope = 'openid email profile offline_access portfolio:read';
  let phase = 'baseline', calls = 0;
  const observations = [];
  async function request(path, { body, cookie, bearer, form = false, protocol } = {}) {
    const response = await fetch('http://127.0.0.1:3137' + path, {
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { origin, ...(cookie ? { cookie } : {}), ...(bearer ? { authorization: 'Bearer ' + bearer } : {}),
        ...(protocol ? { 'mcp-protocol-version': protocol } : {}),
        ...(path.includes('/oauth2/authorize?') ? { 'sec-fetch-mode': 'cors' } : {}),
        ...(body ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) },
      body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }
  async function authorize(requestedScope, account = state.users[0]) {
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({ client_id: state.environment.BETTER_AUTH_MCP_CLIENT_ID,
      response_type: 'code', redirect_uri: callback, resource, scope: requestedScope, prompt: 'consent',
      state: randomBytes(20).toString('hex'), code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    const start = await request(issuerPath + '/oauth2/authorize?' + params, { cookie: account.cookie });
    const target = start.response.headers.get('location') || start.data.url;
    assert.equal(typeof target, 'string', 'Authorization must return a consent destination');
    const consent = new URL(target, origin);
    assert.equal(consent.pathname, '/oauth/consent');
    const review = await sdk.consentReview(consent.search.slice(1), account.cookie);
    assert.equal(review.account.id, account.subject);
    const accepted = await request('/api/account/oauth/consent', { cookie: account.cookie,
      body: { query: review.query, receipt: review.receipt, accept: true } });
    assert.equal(accepted.response.status, 200, 'Synthetic OAuth consent failed');
    const returned = new URL(accepted.data.url);
    assert.equal(returned.searchParams.get('state'), params.get('state'));
    assert.ok(returned.searchParams.get('code'), 'OAuth authorization code missing');
    return token({ grant_type: 'authorization_code', code: returned.searchParams.get('code'),
      code_verifier: verifier, redirect_uri: callback, resource });
  }
  async function token(fields) {
    const result = await request(issuerPath + '/oauth2/token', { form: true, body: {
      client_id: state.environment.BETTER_AUTH_MCP_CLIENT_ID,
      client_secret: state.environment.BETTER_AUTH_MCP_CLIENT_SECRET, ...fields,
    } });
    assert.equal(result.response.status, 200, 'Synthetic token exchange failed');
    assert.equal(typeof result.data.access_token, 'string', 'Access token missing');
    return result.data;
  }
  async function rpc(bearer, name, args = {}, protocol = '2026-07-28') {
    assert.notEqual(name, 'confirm_screenshot_sync', 'This gate never confirms proposals');
    calls++;
    return request('/api/mcp', { bearer, protocol, body: {
      jsonrpc: '2.0', id: calls, method: 'tools/call', params: { name, arguments: args },
    } });
  }
  function successful(result) {
    assert.equal(result.response.status, 200, 'MCP call must succeed');
    assert.equal(result.data.result?.isError, false, 'MCP tool unexpectedly failed');
    assert.equal(result.response.headers.has('www-authenticate'), false);
    return result.data.result;
  }
  const input = { location: state.users[0].sourceId, observedAt: '2026-11-16',
    rows: [{ symbol: 'TTWO', quantity: 6, averageCostUsd: 222, acquiredOn: '2026-11-16' }] };
  try {
    const before = await snapshot();
    phase = 'read-only-grant';
    const read = await authorize(scope);
    successful(await rpc(read.access_token, 'get_profile'));
    successful(await rpc(read.access_token, 'get_portfolio_snapshot'));
    for (const protocol of ['2026-07-28', '2025-11-25']) {
      const denied = await rpc(read.access_token, 'prepare_screenshot_sync', input, protocol);
      assert.equal(denied.response.status, protocol === '2026-07-28' ? 403 : 200);
      assert.equal(denied.data.result?.isError, true);
      const challenge = denied.data.result?._meta?.['mcp/www_authenticate']?.[0];
      assert.match(challenge, /error="insufficient_scope"/);
      assert.match(challenge, /scope="portfolio:read portfolio:sync"/);
      assert.equal(denied.response.headers.get('www-authenticate'), challenge);
      observations.push({ protocol, missingScopeStatus: denied.response.status, challenge: 'insufficient_scope' });
    }
    successful(await rpc(read.access_token, 'get_portfolio_snapshot'));
    phase = 'explicit-sync-consent';
    let grant = await authorize(scope + ' portfolio:sync');
    const profile = successful(await rpc(grant.access_token, 'get_profile')).structuredContent;
    assert.equal(profile.id, state.users[0].profileId);
    phase = 'repeated-preparation-and-refresh';
    for (let round = 0; round < 3; round++) {
      if (round) grant = await token({ grant_type: 'refresh_token', refresh_token: grant.refresh_token, resource });
      assert.ok(grant.scope.split(' ').includes('portfolio:sync'));
      const prepared = successful(await rpc(grant.access_token, 'prepare_screenshot_sync', input));
      assert.equal(prepared.structuredContent?.status, 'pending');
      assert.match(prepared._meta?.confirmationSecret, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(JSON.stringify(prepared.structuredContent).includes(prepared._meta.confirmationSecret), false);
      successful(await rpc(grant.access_token, 'get_portfolio_snapshot'));
    }
    phase = 'foreign-source';
    const foreign = await rpc(grant.access_token, 'prepare_screenshot_sync', { ...input, location: state.users[1].sourceId });
    assert.equal(foreign.data.result?.isError, true);
    phase = 'holdings-invariance';
    const after = await snapshot();
    assert.deepEqual(after.accounts, before.accounts, 'Synthetic account holdings changed during preparation');
    return { status: 'PASS_ISOLATED_OAUTH_SYNC_HTTP_CHAIN', productionAccess: false,
      sourceCommit: state.sourceCommit, observations, readToolsWorking: true, explicitSyncConsent: true,
      successfulPreparations: 3, refreshRotations: 2, foreignSourceRejected: true,
      holdingsUnchanged: true, confirmationCalls: 0, mcpCalls: calls };
  } catch {
    // Never surface provider errors, response bodies, credentials or signed OAuth queries.
    throw new Error('Isolated OAuth/MCP gate failed at phase: ' + phase);
  }
}
