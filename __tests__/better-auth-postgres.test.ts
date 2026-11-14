// @vitest-environment node
/** Opt-in, disposable LOCAL PostgreSQL only. SMTP is an in-memory mailbox. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { createLocalJWKSet } from 'jose';
vi.mock('server-only', () => ({}));
const mailbox = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/auth/auth-email', () => ({ requireAuthEmailConfiguration: () => {}, sendAuthEmail: async (_to: string, url: string) => { mailbox.push(url); } }));
import { getBetterAuth, getWebsiteDatabaseToken, seedMcpClient } from '@/lib/auth/better-auth';
import { handleBetterAuthRequest } from '@/lib/auth/better-auth-handler';
import { createAuth0TokenVerifier } from '@/lib/auth/auth0-token';

describe.skipIf(!process.env.BETTER_AUTH_LOCAL_TEST_STATE)('actual provider with isolated PostgreSQL', () => {
  it('verifies email, signs web/MCP tokens and enforces resource, PKCE, refresh and live-session boundaries', async () => {
    const state = JSON.parse(readFileSync(process.env.BETTER_AUTH_LOCAL_TEST_STATE!, 'utf8'));
    for (const value of [state.backendDatabaseUrl, state.origin]) {
      const url = new URL(value); if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Local runtime required');
    }
    const env = { APP_BASE_URL: state.origin, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_DATABASE_URL: state.backendDatabaseUrl,
      BETTER_AUTH_WEBSITE_CLIENT_ID: state.websiteClientId, BETTER_AUTH_MCP_CLIENT_ID: state.mcpClientId, BETTER_AUTH_MCP_CLIENT_SECRET: randomBytes(48).toString('hex'),
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value as string));
    const debugAuth = getBetterAuth(); expect(debugAuth).not.toBeNull(); await debugAuth!.$context;
    const origin = state.origin, issuer = origin + '/api/auth', resource = origin + '/api/mcp', callback = 'http://localhost:3110/callback';
    async function request(path: string, body?: Record<string, unknown>, cookie = '', form = false) {
      const response = await handleBetterAuthRequest(new Request(path.startsWith('http') ? path : issuer + path, {
        method: body ? 'POST' : 'GET', headers: { origin, ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) },
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
      return { cookie: login.cookie, id: login.data.user.id };
    }
    const a = await account(), b = await account(); expect(a.id).not.toBe(b.id);
    await seedMcpClient(new Headers({ cookie: a.cookie }), [callback]);
    const web = await getWebsiteDatabaseToken(new Headers({ cookie: a.cookie }));
    const keys = createLocalJWKSet((await request('/jwks')).data);
    const verify = createAuth0TokenVerifier({ issuer, websiteAudience: origin + '/api/web', mcpAudience: resource, websiteClientId: state.websiteClientId,
      mcpClientId: state.mcpClientId, jwks: keys, requireLiveSessionEvidence: true, companionAudience: issuer + '/oauth2/userinfo' });
    expect((await verify(web.token, 'web')).userId).toBe(a.id);
    await expect(verify(web.token, 'mcp')).rejects.toThrow();
    async function authorize(cookie = a.cookie, target: string | null = resource) {
      const verifier = randomBytes(32).toString('base64url');
      const params = new URLSearchParams({ client_id: state.mcpClientId, response_type: 'code', redirect_uri: callback, scope: 'openid email profile offline_access portfolio:read',
        state: randomBytes(20).toString('hex'), nonce: randomBytes(20).toString('hex'), code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
      if (target !== null) params.set('resource', target);
      const start = await request('/oauth2/authorize?' + params, undefined, cookie);
      let location = start.response.headers.get('location');
      if (location?.includes('/oauth/consent?')) {
        const consent = await request('/oauth2/consent', { accept: true, oauth_query: new URL(location, origin).search.slice(1) }, cookie);
        expect(consent.response.status).toBe(200); location = consent.data.url;
      }
      return { verifier, code: location ? new URL(location, origin).searchParams.get('code') : null, status: start.response.status };
    }
    const token = (body: Record<string, unknown>) => request('/oauth2/token', { client_id: state.mcpClientId, client_secret: env.BETTER_AUTH_MCP_CLIENT_SECRET, ...body }, '', true);
    async function exchange(cookie = a.cookie, target: string | null = resource) {
      const code = await authorize(cookie); expect(code.code).toBeTruthy();
      return token({ grant_type: 'authorization_code', code: code.code, code_verifier: code.verifier, redirect_uri: callback, ...(target === null ? {} : { resource: target }) });
    }
    expect((await authorize(a.cookie, null)).status).toBe(400);
    expect((await authorize(a.cookie, 'https://evil.invalid')).status).toBe(400);
    const wrong = await exchange(a.cookie, 'https://evil.invalid'); expect(wrong.data.access_token).toBeUndefined(); expect(wrong.data.error).toBe('invalid_target');
    const positive = await exchange(); expect(positive.response.status).toBe(200);
    const claims = await verify(positive.data.access_token, 'mcp'); expect(claims.userId).toBe(a.id); expect(claims.grantId).toBeTruthy();
    expect((await verify((await exchange(b.cookie)).data.access_token, 'mcp')).userId).toBe(b.id);
    const omitted = await exchange(a.cookie, null); expect((await verify(omitted.data.access_token, 'mcp')).userId).toBe(a.id);
    const pkce = await authorize(); const invalid = await token({ grant_type: 'authorization_code', code: pkce.code, code_verifier: randomBytes(32).toString('base64url'), redirect_uri: callback, resource });
    expect(invalid.data.error).toBe('invalid_grant');
    const refresh = await token({ grant_type: 'refresh_token', refresh_token: positive.data.refresh_token, resource });
    const refreshed = await verify(refresh.data.access_token, 'mcp'); expect(refreshed.authSessionId).toBe(claims.authSessionId); expect(refreshed.grantId).toBe(claims.grantId); expect(refreshed.authSessionCreatedAt).toBe(claims.authSessionCreatedAt);
    const badRefresh = await token({ grant_type: 'refresh_token', refresh_token: refresh.data.refresh_token, resource: 'https://evil.invalid' }); expect(badRefresh.data.access_token).toBeUndefined(); expect(badRefresh.data.error).toBe('invalid_target');
    expect((await request('/sign-out', {}, a.cookie)).response.status).toBe(200);
    const afterSignout = await token({ grant_type: 'refresh_token', refresh_token: refresh.data.refresh_token, resource }); expect(afterSignout.data.access_token).toBeUndefined(); expect(afterSignout.data.error).toBe('invalid_grant');
    await expect(getWebsiteDatabaseToken(new Headers({ cookie: a.cookie }))).rejects.toThrow();
    vi.unstubAllEnvs();
  }, 60_000);
});
