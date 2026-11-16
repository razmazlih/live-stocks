// @vitest-environment node
/** Opt-in, disposable LOCAL PostgreSQL only. SMTP is an in-memory mailbox. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createLocalJWKSet } from 'jose';
vi.mock('server-only', () => ({}));
const mailbox = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/auth/auth-email', () => ({ requireAuthEmailConfiguration: () => {}, sendAuthEmail: async (_to: string, url: string) => { mailbox.push(url); } }));
import { getBetterAuth, getWebsiteDatabaseToken, seedMcpClient } from '@/lib/auth/better-auth';
import { handleBetterAuthRequest } from '@/lib/auth/better-auth-handler';
import { createAuth0TokenVerifier } from '@/lib/auth/auth0-token';
import { getConsentReview, decideConsent } from '@/lib/auth/oauth-consent';
import { GET as authorizationMetadata } from '@/app/.well-known/oauth-authorization-server/api/auth/route';
import { POST as consentPost } from '@/app/api/account/oauth/consent/route';

describe.skipIf(!process.env.BETTER_AUTH_LOCAL_TEST_STATE)('actual provider with isolated PostgreSQL', () => {
  it('verifies email, signs web/MCP tokens and enforces resource, PKCE, refresh and live-session boundaries', async () => {
    const state = JSON.parse(readFileSync(process.env.BETTER_AUTH_LOCAL_TEST_STATE!, 'utf8'));
    for (const value of [state.backendDatabaseUrl, state.origin]) {
      const url = new URL(value); if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Local runtime required');
    }
    const env = { PASSWORD_AUTH_ENABLED: 'true', APP_BASE_URL: state.origin, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_DATABASE_URL: state.backendDatabaseUrl,
      BETTER_AUTH_WEBSITE_CLIENT_ID: state.websiteClientId, BETTER_AUTH_MCP_CLIENT_ID: state.mcpClientId, BETTER_AUTH_MCP_CLIENT_SECRET: randomBytes(48).toString('hex'),
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value as string));
    const debugAuth = getBetterAuth(); expect(debugAuth).not.toBeNull(); await debugAuth!.$context;
    const origin = state.origin, issuer = origin + '/api/auth', resource = origin + '/api/mcp', callback = 'http://localhost:3110/callback';
    const metadataResponse = await authorizationMetadata(new Request(origin + '/.well-known/oauth-authorization-server/api/auth'));
    expect(metadataResponse.status).toBe(200);
    const metadata = await metadataResponse.json();
    expect(metadata.issuer).toBe(issuer);
    expect(metadata.scopes_supported).toEqual(expect.arrayContaining(['portfolio:read', 'portfolio:sync', 'offline_access']));
    expect(metadata.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token']));
    expect(metadata.token_endpoint).toBe(issuer + '/oauth2/token');
    async function request(path: string, body?: Record<string, unknown>, cookie = '', form = false) {
      const response = await handleBetterAuthRequest(new Request(path.startsWith('http') ? path : issuer + path, {
        method: body ? 'POST' : 'GET', headers: { origin, ...(path.includes('/oauth2/authorize?') ? { 'sec-fetch-mode': 'cors' } : {}), ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) },
        body: body ? (form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body)) : undefined,
      }));
      const data = await response.clone().json().catch(() => ({}));
      return { response, data, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
    }
    async function account() {
      const email = randomBytes(12).toString('hex') + '@example.invalid', password = randomBytes(24).toString('base64url') + '!A1';
      const signup = await request('/sign-up/email', { name: 'Synthetic gate', email, password }); expect(signup.data.code).not.toBe('EMAIL_DELIVERY_UNAVAILABLE'); expect(signup.response.status, signup.data.code).toBe(200);
      expect((await request('/sign-in/email', { email, password })).response.status).toBe(403);
      expect(mailbox.length).toBeGreaterThan(0); expect((await request(mailbox.pop()!)).response.status).toBeLessThan(400);
      const login = await request('/sign-in/email', { email, password }); expect(login.response.status).toBe(200); expect(login.cookie).toBeTruthy();
      return { cookie: login.cookie, id: login.data.user.id, email, password };
    }
    const a = await account(), b = await account(); expect(a.id).not.toBe(b.id);
    // Exercise the real operator CLI, not a mock registration endpoint.
    const privateDir = await mkdtemp(join(tmpdir(), 'livestocks-seed-test-'));
    try {
      const config = Object.fromEntries(Object.entries(env).filter(([key]) => key !== 'GOOGLE_CLIENT_ID' && key !== 'GOOGLE_CLIENT_SECRET' && key !== 'PASSWORD_AUTH_ENABLED'));
      for (const [file, content] of [['config.json', JSON.stringify(config)], ['cookie.txt', a.cookie], ['callbacks.json', JSON.stringify([callback])]]) await writeFile(join(privateDir, file), content, { mode: 0o600 });
      const args = ['scripts/seed-mcp-client.mjs', '--config-file', join(privateDir, 'config.json'), '--cookie-file', join(privateDir, 'cookie.txt'), '--callbacks-file', join(privateDir, 'callbacks.json'), '--origin', origin, '--client-id', state.mcpClientId, '--operator-id', a.id, '--apply'];
      const first = await promisify(execFile)(process.execPath, args); expect(JSON.parse(first.stdout).created).toBe(true);
      const reused = await promisify(execFile)(process.execPath, args); expect(JSON.parse(reused.stdout).created).toBe(false);
      expect(first.stdout + first.stderr).not.toContain(env.BETTER_AUTH_MCP_CLIENT_SECRET);
      expect(first.stdout + first.stderr).not.toContain(a.cookie);
      await expect(seedMcpClient(new Headers({ cookie: a.cookie }), ['http://localhost:3110/different'])).rejects.toThrow();
      vi.stubEnv('BETTER_AUTH_MCP_CLIENT_SECRET', randomBytes(48).toString('hex'));
      await expect(seedMcpClient(new Headers({ cookie: a.cookie }), [callback])).rejects.toThrow();
      vi.stubEnv('BETTER_AUTH_MCP_CLIENT_SECRET', env.BETTER_AUTH_MCP_CLIENT_SECRET);
    } finally { await rm(privateDir, { recursive: true, force: true }); }
    const web = await getWebsiteDatabaseToken(new Headers({ cookie: a.cookie }));
    const keys = createLocalJWKSet((await request('/jwks')).data);
    const verify = createAuth0TokenVerifier({ issuer, websiteAudience: origin + '/api/web', mcpAudience: resource, websiteClientId: state.websiteClientId,
      mcpClientId: state.mcpClientId, jwks: keys, requireLiveSessionEvidence: true, companionAudience: issuer + '/oauth2/userinfo' });
    expect((await verify(web.token, 'web')).userId).toBe(a.id);
    await expect(verify(web.token, 'mcp')).rejects.toThrow();
    async function authorize(cookie = a.cookie, target: string | null = resource, reviewOnly = false, scope = 'openid email profile offline_access portfolio:read') {
      const verifier = randomBytes(32).toString('base64url');
      const params = new URLSearchParams({ client_id: state.mcpClientId, response_type: 'code', redirect_uri: callback, scope,
        prompt: 'consent', state: randomBytes(20).toString('hex'), nonce: randomBytes(20).toString('hex'), code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
      if (target !== null) params.set('resource', target);
      const start = await request('/oauth2/authorize?' + params, undefined, cookie);
      let location = start.response.headers.get('location');
      if (start.data.redirect === true) { expect(start.response.status).toBe(200); expect(location).toBeNull(); expect(typeof start.data.url).toBe('string'); location = start.data.url; }
      if (reviewOnly) return { verifier, location, code: null, status: start.response.status };
      if (location?.includes('/oauth/consent?')) {
        const headers = new Headers({ cookie, origin });
        const review = await getConsentReview(new URL(location, origin).search.slice(1), headers);
        location = await decideConsent({ query: review.query, receipt: review.receipt, accept: true }, headers);
      }
      return { verifier, location, code: location ? new URL(location, origin).searchParams.get('code') : null, status: start.response.status };
    }
    const pending = await authorize(a.cookie, resource, true);
    const rawQuery = new URL(pending.location!, origin).search.slice(1);
    const headers = new Headers({ cookie: a.cookie, origin });
    const review = await getConsentReview(rawQuery, headers);
    expect(review.account.id).toBe(a.id); expect(review.scopes).toContain('portfolio:read');
    await expect(getConsentReview(rawQuery.replace(encodeURIComponent(callback), encodeURIComponent('https://evil.invalid')), headers)).rejects.toThrow();
    await expect(getConsentReview(rawQuery, new Headers())).rejects.toThrow('SIGN_IN_REQUIRED');
    await expect(decideConsent({ query: review.query, receipt: review.receipt, accept: true }, new Headers({ cookie: b.cookie, origin }))).rejects.toThrow('ACCOUNT_CHANGED');
    const choice = { query: review.query, receipt: review.receipt, accept: false };
    const foreign = await consentPost(new Request(origin + '/api/account/oauth/consent', { method: 'POST', headers: { cookie: a.cookie, origin: 'https://evil.invalid', 'content-type': 'application/json' }, body: JSON.stringify(choice) }));
    expect(foreign.status).toBe(403);
    const denied = await consentPost(new Request(origin + '/api/account/oauth/consent', { method: 'POST', headers: { cookie: a.cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(choice) }));
    expect(denied.status).toBe(200); const denial = new URL((await denied.json()).url);
    expect(denial.searchParams.get('error')).toBe('access_denied'); expect(denial.searchParams.get('code')).toBeNull();
    expect(denial.searchParams.get('state')).toBe(new URLSearchParams(rawQuery).get('state'));
    const tampered = new URLSearchParams(rawQuery); tampered.set('scope', 'portfolio:write');
    await expect(getConsentReview(tampered.toString(), headers)).rejects.toThrow('INVALID_REQUEST');
    const expired = new URLSearchParams(rawQuery); expired.set('exp', '1');
    await expect(getConsentReview(expired.toString(), headers)).rejects.toThrow('INVALID_REQUEST');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 180_000);
      await expect(getConsentReview(rawQuery, headers)).rejects.toThrow('INVALID_REQUEST');
    } finally { vi.useRealTimers(); }
    await expect(decideConsent({ query: review.query, receipt: review.receipt + 'tamper', accept: true }, headers)).rejects.toThrow('INVALID_REQUEST');
    const admin = new Pool({ connectionString: state.adminDatabaseUrl });
    try {
      await admin.query('update livestocks_auth."oauthClient" set disabled=true where "clientId"=$1', [state.mcpClientId]);
      await expect(getConsentReview(rawQuery, headers)).rejects.toThrow();
      await expect(seedMcpClient(headers, [callback])).rejects.toThrow();
      await admin.query('update livestocks_auth."oauthClient" set disabled=false where "clientId"=$1', [state.mcpClientId]);
    } finally { await admin.end(); }
    // Starting unauthenticated must resume consent after the actual password endpoint.
    const loginStart = await authorize('', resource, true);
    expect(new URL(loginStart.location!, origin).pathname).toBe('/sign-in');
    const loginContinuation = await request('/sign-in/email', { email: a.email, password: a.password, oauth_query: new URL(loginStart.location!, origin).search.slice(1) });
    expect(loginContinuation.data.redirect).toBe(true);
    expect(new URL(loginContinuation.data.url, origin).pathname).toBe('/oauth/consent');
    const token = (body: Record<string, unknown>) => request('/oauth2/token', { client_id: state.mcpClientId, client_secret: env.BETTER_AUTH_MCP_CLIENT_SECRET, ...body }, '', true);
    async function exchange(cookie = a.cookie, target: string | null = resource, scope = 'openid email profile offline_access portfolio:read') {
      const code = await authorize(cookie, resource, false, scope); expect(code.code).toBeTruthy();
      return token({ grant_type: 'authorization_code', code: code.code, code_verifier: code.verifier, redirect_uri: callback, ...(target === null ? {} : { resource: target }) });
    }
    expect((await authorize(a.cookie, null)).status).toBe(400);
    expect((await authorize(a.cookie, 'https://evil.invalid')).status).toBe(400);
    const wrong = await exchange(a.cookie, 'https://evil.invalid'); expect(wrong.data.access_token).toBeUndefined(); expect(wrong.data.error).toBe('invalid_target');
    const positive = await exchange(); expect(positive.response.status).toBe(200);
    const claims = await verify(positive.data.access_token, 'mcp'); expect(claims.userId).toBe(a.id); expect(claims.grantId).toBeTruthy();
    expect(claims.portfolioSync).toBe(false);
    // Expanding the client's allowed scope is an explicit operator step. It does
    // not upgrade any existing consent, token, or read-only refresh grant.
    await seedMcpClient(headers, [callback], { enablePortfolioSync: true });
    expect((await verify(positive.data.access_token, 'mcp')).portfolioSync).toBe(false);
    expect((await verify((await exchange()).data.access_token, 'mcp')).portfolioSync).toBe(false);
    const syncScope = 'openid email profile offline_access portfolio:read portfolio:sync';
    const syncReviewStart = await authorize(a.cookie, resource, true, syncScope);
    const syncReview = await getConsentReview(new URL(syncReviewStart.location!, origin).search.slice(1), headers);
    expect(syncReview.scopes).toContain('portfolio:sync');
    const syncIssued = await exchange(a.cookie, resource, syncScope);
    expect(syncIssued.response.status).toBe(200);
    const syncIdentity = await verify(syncIssued.data.access_token, 'mcp');
    expect(syncIdentity.portfolioSync).toBe(true);
    expect(syncIdentity.scopes).toContain('portfolio:sync');
    expect(syncIdentity.scopes).not.toContain('portfolio:write');
    // Expiry is a token failure, not lost consent. Advance Date only so SDK
    // cleanup/network timers remain real, then refresh the existing sync grant.
    vi.useFakeTimers({ toFake: ['Date'] });
    let latestSyncRefreshToken = syncIssued.data.refresh_token;
    try {
      vi.setSystemTime((syncIdentity.expiresAt + 1) * 1000);
      await expect(verify(syncIssued.data.access_token, 'mcp')).rejects.toThrow();
      const syncRefresh = await token({ grant_type: 'refresh_token', refresh_token: syncIssued.data.refresh_token, resource });
      expect(syncRefresh.response.status).toBe(200);
      const renewed = await verify(syncRefresh.data.access_token, 'mcp');
      expect(renewed.portfolioSync).toBe(true);
      expect(renewed.grantId).toBe(syncIdentity.grantId);
      expect(renewed.authSessionId).toBe(syncIdentity.authSessionId);
      expect(renewed.expiresAt).toBeGreaterThan(syncIdentity.expiresAt);
      // Reusing the refreshed access token needs no new consent or refresh.
      expect((await verify(syncRefresh.data.access_token, 'mcp')).portfolioSync).toBe(true);
      const rotated = await token({ grant_type: 'refresh_token', refresh_token: syncRefresh.data.refresh_token, resource });
      expect(rotated.response.status).toBe(200);
      expect(rotated.data.refresh_token).not.toBe(syncRefresh.data.refresh_token);
      expect((await verify(rotated.data.access_token, 'mcp')).portfolioSync).toBe(true);
      latestSyncRefreshToken = rotated.data.refresh_token;
    } finally { vi.useRealTimers(); }
    const readForEscalation = await exchange();
    const escalated = await token({ grant_type: 'refresh_token', refresh_token: readForEscalation.data.refresh_token, resource, scope: syncScope });
    expect(escalated.data.access_token).toBeUndefined();
    expect(escalated.data.error).toBe('invalid_scope');
    expect((await verify((await exchange(b.cookie)).data.access_token, 'mcp')).userId).toBe(b.id);
    const omitted = await exchange(a.cookie, null); expect((await verify(omitted.data.access_token, 'mcp')).userId).toBe(a.id);
    const pkce = await authorize(); const invalid = await token({ grant_type: 'authorization_code', code: pkce.code, code_verifier: randomBytes(32).toString('base64url'), redirect_uri: callback, resource });
    expect(invalid.data.error).toBe('invalid_grant');
    const refresh = await token({ grant_type: 'refresh_token', refresh_token: positive.data.refresh_token, resource });
    const refreshed = await verify(refresh.data.access_token, 'mcp'); expect(refreshed.authSessionId).toBe(claims.authSessionId); expect(refreshed.grantId).toBe(claims.grantId); expect(refreshed.authSessionCreatedAt).toBe(claims.authSessionCreatedAt);
    const badRefresh = await token({ grant_type: 'refresh_token', refresh_token: refresh.data.refresh_token, resource: 'https://evil.invalid' }); expect(badRefresh.data.access_token).toBeUndefined(); expect(badRefresh.data.error).toBe('invalid_target');
    expect((await request('/sign-out', {}, a.cookie)).response.status).toBe(200);
    const afterSignout = await token({ grant_type: 'refresh_token', refresh_token: refresh.data.refresh_token, resource }); expect(afterSignout.data.access_token).toBeUndefined(); expect(afterSignout.data.error).toBe('invalid_grant');
    const revokedSync = await token({ grant_type: 'refresh_token', refresh_token: latestSyncRefreshToken, resource });
    expect(revokedSync.data.access_token).toBeUndefined();
    expect(revokedSync.data.error).toBe('invalid_grant');
    await expect(getWebsiteDatabaseToken(new Headers({ cookie: a.cookie }))).rejects.toThrow();
    vi.unstubAllEnvs();
  }, 60_000);
});
