// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CompactSign, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { Auth0TokenVerificationError, createAuth0TokenVerifier, type Auth0TokenKind } from '@/lib/auth/auth0-token';

const issuer = 'https://livestocks-test.eu.auth0.com/';
const websiteAudience = 'https://stocks.example.com/api/web';
const mcpAudience = 'https://stocks.example.com/api/mcp';
const websiteClientId = 'website-client';
const mcpClientId = 'chatgpt-client';
const userId = 'google-oauth2|stable-opaque-subject';
const readOnlyClaim = 'https://livestocks.app/read_only';
const verifiedClaim = 'https://livestocks.app/email_verified';
const configuration = { issuer, websiteAudience, mcpAudience, websiteClientId, mcpClientId };
type Algorithm = 'RS256' | 'ES256';
let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
let ec: Awaited<ReturnType<typeof generateKeyPair>>;
let verify: ReturnType<typeof createAuth0TokenVerifier>;

function claims(kind: Auth0TokenKind = 'mcp'): JWTPayload {
  const iat = Math.floor(Date.now() / 1000);
  return { iss: issuer, sub: userId, aud: kind === 'web' ? websiteAudience : mcpAudience,
    azp: kind === 'web' ? websiteClientId : mcpClientId, role: 'authenticated', iat, exp: iat + 300,
    scope: kind === 'web' ? 'openid portfolio:read portfolio:write' : 'openid portfolio:read',
    [readOnlyClaim]: kind === 'mcp', [verifiedClaim]: true };
}
async function sign(payload: JWTPayload = claims(), algorithm: Algorithm = 'ES256') {
  return new SignJWT(payload).setProtectedHeader({ alg: algorithm, kid: algorithm, typ: 'JWT' })
    .sign(algorithm === 'ES256' ? ec.privateKey : rsa.privateKey);
}

beforeAll(async () => {
  [rsa, ec] = await Promise.all([generateKeyPair('RS256'), generateKeyPair('ES256')]);
  const keys = await Promise.all(([['RS256', rsa], ['ES256', ec]] as const).map(async ([alg, pair]) => ({
    ...await exportJWK(pair.publicKey), alg, kid: alg, use: 'sig',
  })));
  verify = createAuth0TokenVerifier({ ...configuration, jwks: createLocalJWKSet({ keys }) });
});

describe('Auth0 access-token trust boundaries', () => {
  it.each<Algorithm>(['RS256', 'ES256'])('verifies real %s signatures for both independent clients', async algorithm => {
    for (const kind of ['web', 'mcp'] as const) {
      const payload = { ...claims(kind), email: 'unrelated@example.invalid', user_metadata: { user_id: 'attacker' } };
      await expect(verify(await sign(payload, algorithm), kind)).resolves.toEqual({
        userId, clientId: kind === 'web' ? websiteClientId : mcpClientId, issuedAt: payload.iat, expiresAt: payload.exp, kind,
      });
    }
  });
  it('accepts the exact resource in a well-formed audience list', async () => {
    await expect(verify(await sign({ ...claims(), aud: [mcpAudience, `${issuer}userinfo`] }), 'mcp')).resolves.toMatchObject({ userId });
  });
  it('returns signed session origin and namespaced verified email without trusting editable aliases', async () => {
    const payload = claims();
    const origin = Number(payload.iat) - 100;
    await expect(verify(await sign({ ...payload,
      'https://livestocks.app/auth_session_id': 'original-session',
      'https://livestocks.app/auth_session_created_at': origin,
      'https://livestocks.app/email': 'owner@example.invalid',
      email: 'attacker@example.invalid', user_metadata: { auth_session_created_at: payload.iat },
    }), 'mcp')).resolves.toMatchObject({ verifiedEmail: 'owner@example.invalid', authSessionId: 'original-session', authSessionCreatedAt: origin });
  });
  it.each([
    { 'https://livestocks.app/auth_session_id': 'session-without-time' },
    { 'https://livestocks.app/auth_session_created_at': 1 },
    { 'https://livestocks.app/auth_session_id': 'session', 'https://livestocks.app/auth_session_created_at': 9_000_000_000 },
    { 'https://livestocks.app/email': 'malformed email' },
  ])('rejects malformed optional origin or verified-email evidence %j', async evidence => {
    await expect(verify(await sign({ ...claims(), ...evidence }), 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it('never accepts a website token as an MCP token or an MCP token as a website token', async () => {
    await expect(verify(await sign(claims('web')), 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
    await expect(verify(await sign(claims('mcp')), 'web')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it.each([
    ['foreign issuer', { iss: 'https://another-tenant.eu.auth0.com/' }],
    ['issuer without its trailing slash', { iss: issuer.slice(0, -1) }],
    ['wrong audience', { aud: websiteAudience }],
    ['resource path suffix', { aud: `${mcpAudience}/` }],
    ['website client on MCP audience', { azp: websiteClientId }],
    ['unapproved client', { azp: 'arbitrary-client' }],
    ['conflicting RFC client claim', { client_id: websiteClientId }],
    ['missing literal role despite namespaced role', { role: undefined, 'https://livestocks.app/role': 'authenticated' }],
    ['anon role', { role: 'anon' }],
    ['privileged role', { role: 'service_role' }],
    ['string read-only flag', { [readOnlyClaim]: 'true' }],
    ['writable MCP flag', { [readOnlyClaim]: false }],
    ['string email verification', { [verifiedClaim]: 'true' }],
    ['unverified email', { [verifiedClaim]: false }],
    ['editable metadata claiming verification', { [verifiedClaim]: undefined, email_verified: true, user_metadata: { email_verified: true } }],
    ['scope substring', { scope: 'portfolio:read:all' }],
    ['array scope', { scope: ['portfolio:read'] }],
    ['MCP write permission', { scope: 'portfolio:read portfolio:write' }],
    ['empty subject', { sub: '' }],
    ['padded subject', { sub: ' user ' }],
    ['oversized subject', { sub: 'x'.repeat(256) }],
    ['expired token', { exp: 1 }],
    ['future issued-at', { iat: 9_000_000_000, exp: 9_000_000_100 }],
    ['fractional issued-at', { iat: 1.5 }],
    ['negative issued-at', { iat: -1 }],
    ['not-yet-valid token', { nbf: 9_000_000_000 }],
  ])('rejects %s even with a trusted signature', async (_name, override) => {
    await expect(verify(await sign({ ...claims(), ...override }), 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it('requires write permission and false read-only claim for the website', async () => {
    for (const override of [{ scope: 'portfolio:read' }, { [readOnlyClaim]: true }]) {
      await expect(verify(await sign({ ...claims('web'), ...override }), 'web')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
    }
  });
  it.each(['iss', 'aud', 'sub', 'azp', 'scope', 'role', 'iat', 'exp', readOnlyClaim, verifiedClaim])('requires signed %s', async field => {
    const payload = claims(); delete payload[field];
    await expect(verify(await sign(payload), 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it.each([{ aud: [mcpAudience, 42] }, { iat: 'today' }, { exp: 'tomorrow' }, { iat: null }, { sub: 42 }])('rejects malformed signed JSON claims %j', async override => {
    const token = await new CompactSign(new TextEncoder().encode(JSON.stringify({ ...claims(), ...override })))
      .setProtectedHeader({ alg: 'ES256', kid: 'ES256' }).sign(ec.privateKey);
    await expect(verify(token, 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it('rejects a forged signature even with a trusted kid and attacker header key', async () => {
    const attacker = await generateKeyPair('ES256');
    const token = await new SignJWT(claims()).setProtectedHeader({ alg: 'ES256', kid: 'ES256',
      jwk: await exportJWK(attacker.publicKey), jku: 'https://attacker.example/jwks' }).sign(attacker.privateKey);
    await expect(verify(token, 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it('rejects HMAC algorithm confusion', async () => {
    const token = await new SignJWT(claims()).setProtectedHeader({ alg: 'HS256', kid: 'RS256' })
      .sign(new TextEncoder().encode(JSON.stringify(await exportJWK(rsa.publicKey))));
    await expect(verify(token, 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
  it('fails closed without exposing credentials or JWKS error details', async () => {
    const unavailable = createAuth0TokenVerifier({ ...configuration, jwks: async () => { throw new Error('internal secret'); } });
    await expect(unavailable(await sign(), 'mcp')).rejects.toThrow('Invalid Auth0 access token');
    for (const token of ['', 'sensitive-token', 'a.b.c', 'Bearer sensitive-token']) {
      await expect(verify(token, 'mcp')).rejects.toThrow('Invalid Auth0 access token');
    }
  });
  it('requires explicit and distinct website/MCP configuration', () => {
    const jwks = createLocalJWKSet({ keys: [] });
    for (const override of [{ issuer: '' }, { mcpAudience: ' padded ' }, { mcpAudience: websiteAudience }, { mcpClientId: websiteClientId }]) {
      expect(() => createAuth0TokenVerifier({ ...configuration, ...override, jwks })).toThrow('explicit, distinct');
    }
  });
  it.each([
    ['missing live session', { sid: undefined }],
    ['conflicting session', { sid: 'different-session' }],
    ['missing immutable grant', { 'https://livestocks.app/grant_id': undefined }],
    ['unapproved extra audience', { aud: [mcpAudience, 'https://attacker.invalid/api'] }],
    ['missing verified email value', { 'https://livestocks.app/email': undefined }],
  ])('requires Better Auth live evidence: %s', async (_label, override) => {
    const strict = createAuth0TokenVerifier({ ...configuration, requireLiveSessionEvidence: true,
      companionAudience: `${issuer}oauth2/userinfo`, jwks: async header => header.alg === 'RS256' ? rsa.publicKey : ec.publicKey });
    const payload = { ...claims(), sid: 'original-session', 'https://livestocks.app/auth_session_id': 'original-session',
      'https://livestocks.app/auth_session_created_at': Math.floor(Date.now() / 1000) - 60,
      'https://livestocks.app/email': 'verified@example.invalid',
      'https://livestocks.app/grant_id': 'a0000000-0000-4000-8000-000000000001' };
    await expect(strict(await sign(payload), 'mcp')).resolves.toMatchObject({ userId });
    await expect(strict(await sign({ ...payload, ...override }), 'mcp')).rejects.toBeInstanceOf(Auth0TokenVerificationError);
  });
});

describe('Auth0 Post Login Action', () => {
  const actionExports: { onExecutePostLogin?: (event: unknown, api: unknown) => Promise<void> } = {};
  runInNewContext(readFileSync(new URL('../plugins/livestocks/auth0/post-login-action.js', import.meta.url), 'utf8'), { exports: actionExports });
  function setup(kind: Auth0TokenKind = 'mcp') {
    const event = { secrets: { AUTH0_WEBSITE_CLIENT_ID: websiteClientId, AUTH0_MCP_CLIENT_ID: mcpClientId,
      AUTH0_WEB_AUDIENCE: websiteAudience, AUTH0_MCP_AUDIENCE: mcpAudience },
    client: { client_id: kind === 'web' ? websiteClientId : mcpClientId },
    resource_server: { identifier: kind === 'web' ? websiteAudience : mcpAudience }, user: { email_verified: true },
    transaction: { protocol: 'oidc-basic-profile' },
    request: { query: (kind === 'mcp' ? { resource: mcpAudience } : {}) as Record<string, unknown>, body: {} as Record<string, unknown> } };
    const api = { access: { deny: vi.fn() }, accessToken: { setCustomClaim: vi.fn(), removeScope: vi.fn() }, idToken: { setCustomClaim: vi.fn() } };
    return { event, api };
  }
  it.each<Auth0TokenKind>(['web', 'mcp'])('sets required claims for the verified %s identity', async kind => {
    const { event, api } = setup(kind);
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).not.toHaveBeenCalled();
    for (const token of [api.accessToken, api.idToken]) {
      expect(token.setCustomClaim.mock.calls).toEqual([['role', 'authenticated'], [readOnlyClaim, kind === 'mcp'], [verifiedClaim, true]]);
    }
    expect(api.accessToken.removeScope).toHaveBeenCalledTimes(kind === 'mcp' ? 1 : 0);
  });
  it('carries initial session origin into this refresh grant without user-global metadata', async () => {
    const { event, api } = setup('web');
    const refreshToken = { setMetadata: vi.fn() };
    await actionExports.onExecutePostLogin!({ ...event, session: { id: 'session-a', created_at: '2026-11-14T10:00:00.000Z' } }, { ...api, refreshToken });
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith('https://livestocks.app/auth_session_id', 'session-a');
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith('https://livestocks.app/auth_session_created_at', Date.parse('2026-11-14T10:00:00Z') / 1000);
    expect(refreshToken.setMetadata.mock.calls).toEqual([['livestocks_session_id', 'session-a'], ['livestocks_session_created_at', '2026-11-14T10:00:00.000Z']]);
  });
  it('preserves the old grant origin on refresh even if another newer session exists', async () => {
    const { event, api } = setup('web');
    event.transaction.protocol = 'oauth2-refresh-token';
    const refreshToken = { setMetadata: vi.fn() };
    await actionExports.onExecutePostLogin!({ ...event,
      session: { id: 'new-session', created_at: '2026-11-14T11:00:00Z' },
      refresh_token: { created_at: '2026-11-14T11:00:00Z', metadata: { livestocks_session_id: 'old-session', livestocks_session_created_at: '2026-11-14T10:00:00Z' } },
    }, { ...api, refreshToken });
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith('https://livestocks.app/auth_session_id', 'old-session');
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith('https://livestocks.app/auth_session_created_at', Date.parse('2026-11-14T10:00:00Z') / 1000);
    expect(refreshToken.setMetadata).toHaveBeenCalledWith('livestocks_session_id', 'old-session');
  });
  it('leaves missing refresh-origin evidence absent instead of using a new session or rotation date', async () => {
    const { event, api } = setup('web'); event.transaction.protocol = 'oauth2-refresh-token';
    const refreshToken = { setMetadata: vi.fn() };
    await actionExports.onExecutePostLogin!({ ...event,
      session: { id: 'new-session', created_at: '2026-11-14T11:00:00Z' },
      refresh_token: { session_id: 'unproven', created_at: '2026-11-14T11:00:00Z' },
    }, { ...api, refreshToken });
    expect(api.accessToken.setCustomClaim.mock.calls).toEqual([['role', 'authenticated'], [readOnlyClaim, false], [verifiedClaim, true]]);
    expect(refreshToken.setMetadata).not.toHaveBeenCalled();
  });
  it.each(['other-api', 'no-api', 'incomplete-config', 'missing-config'])('leaves an unrelated tenant application untouched with %s', async scenario => {
    const { event, api } = setup();
    event.client.client_id = 'default-tenant-application';
    event.resource_server.identifier = scenario === 'no-api' ? '' : 'https://unrelated.example/api';
    event.user.email_verified = false; // This application's own policy still applies.
    if (scenario === 'incomplete-config') event.secrets.AUTH0_WEB_AUDIENCE = '';
    if (scenario === 'missing-config') {
      for (const key of Object.keys(event.secrets) as Array<keyof typeof event.secrets>) event.secrets[key] = '';
    }
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).not.toHaveBeenCalled();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.accessToken.removeScope).not.toHaveBeenCalled();
  });
  it('does not confuse absent client/audience and absent secrets with a LiveStocks request', async () => {
    const { api } = setup();
    await actionExports.onExecutePostLogin!({ user: { email_verified: false } }, api);
    expect(api.access.deny).not.toHaveBeenCalled();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
  });
  it.each<Auth0TokenKind>(['web', 'mcp'])('denies an unknown client requesting the %s LiveStocks audience', async kind => {
    const { event, api } = setup(kind);
    event.client.client_id = 'other-tenant-app';
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).toHaveBeenCalledOnce();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.accessToken.removeScope).not.toHaveBeenCalled();
  });
  it.each(['missing-audience', 'unrelated-audience', 'missing-config', 'whitespace-config'])('denies a known LiveStocks client with %s', async scenario => {
    const { event, api } = setup('web');
    if (scenario === 'missing-audience') event.resource_server.identifier = '';
    if (scenario === 'unrelated-audience') event.resource_server.identifier = 'https://other.example/api';
    if (scenario === 'missing-config') event.secrets.AUTH0_MCP_CLIENT_ID = '';
    if (scenario === 'whitespace-config') {
      event.secrets.AUTH0_WEBSITE_CLIENT_ID = ` ${websiteClientId} `;
      event.resource_server.identifier = '';
    }
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).toHaveBeenCalledOnce();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
    expect(api.accessToken.removeScope).not.toHaveBeenCalled();
  });
  it.each([undefined, null, '', 'https://evil.example/mcp', [mcpAudience]])('rejects initial MCP resource %j even if selected audience is canonical', async resource => {
    const { event, api } = setup(); event.request.query.resource = resource;
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).toHaveBeenCalledOnce();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
  });
  it.each([undefined, mcpAudience])('allows refresh with omitted or canonical resource %j', async resource => {
    const { event, api } = setup(); event.transaction.protocol = 'oauth2-refresh-token';
    event.request.query = {}; event.request.body = resource === undefined ? {} : { resource };
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).not.toHaveBeenCalled();
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith(readOnlyClaim, true);
  });
  it.each(['query', 'body'] as const)('rejects a contradictory refresh resource in the %s', async parameterLocation => {
    const { event, api } = setup(); event.transaction.protocol = 'oauth2-refresh-token';
    event.request[parameterLocation].resource = 'https://evil.example/mcp';
    await actionExports.onExecutePostLogin!(event, api);
    expect(api.access.deny).toHaveBeenCalledOnce();
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
  });
  it('denies unverified identities, foreign clients, cross-client audiences and incomplete setup', async () => {
    for (const mutation of [
      (event: ReturnType<typeof setup>['event']) => { event.user.email_verified = false; },
      (event: ReturnType<typeof setup>['event']) => { event.client.client_id = 'unapproved'; },
      (event: ReturnType<typeof setup>['event']) => { event.resource_server.identifier = websiteAudience; },
      (event: ReturnType<typeof setup>['event']) => { event.secrets.AUTH0_WEB_AUDIENCE = ''; },
    ]) {
      const { event, api } = setup(); mutation(event);
      await actionExports.onExecutePostLogin!(event, api);
      expect(api.access.deny).toHaveBeenCalledOnce();
      expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled();
      expect(api.idToken.setCustomClaim).not.toHaveBeenCalled();
    }
  });
});
