// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(), bootstrap: vi.fn(), rpc: vi.fn(), readCredential: vi.fn(), saveCredential: vi.fn(),
  revokeGrants: vi.fn(), buildPortfolio: vi.fn(), session: vi.fn(), configured: vi.fn(), decryptCredential: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/admin', () => ({ getAdminSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/auth/credentials', () => ({ readFinnhubCredential: mocks.readCredential, saveFinnhubCredential: mocks.saveCredential, decryptCredential: mocks.decryptCredential }));
vi.mock('@/lib/auth/management', () => ({ revokeMcpGrants: mocks.revokeGrants }));
vi.mock('@/lib/server/portfolio-response', () => ({ buildPortfolioResponse: mocks.buildPortfolio }));
vi.mock('@/lib/auth/better-auth-config', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth/better-auth-config')>(), getAuthPublicOptions: mocks.configured,
}));
vi.mock('@/lib/auth/server', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth/server')>();
  return { ...original, requireWebPrincipal: mocks.principal, bootstrapWebAccount: mocks.bootstrap };
});

import { AuthenticationError } from '@/lib/auth/server';
import { GET as getCredentials, PUT as putCredentials, DELETE as deleteCredentials } from '@/app/api/account/credentials/route';
import { GET as getConnections } from '@/app/api/account/connections/route';
import { POST as updateMcp } from '@/app/api/account/connections/mcp/route';
import { POST as createWidget } from '@/app/api/account/widgets/route';
import { DELETE as revokeWidget } from '@/app/api/account/widgets/[id]/route';
import { POST as widgetSummary } from '@/app/api/widget/summary/route';
import { GET as databaseToken } from '@/app/api/account/database-token/route';
import { GET as accountSession } from '@/app/api/account/session/route';

const origin = 'https://stocks.example.test';
const userId = 'auth0|signed-in-owner';
const otherUserId = 'google-oauth2|another-owner';
const widgetId = 'b85e6eae-1d17-4199-bb53-39a0fb6065bc';
const widgetToken = `lst_widget_${'A'.repeat(43)}`;
const providerKey = 'private-finnhub-test-key';
const publicOptions = { configured: true, googleEnabled: true, emailDeliveryConfigured: true };
const now = new Date('2026-11-14T12:30:00.500Z');
const widgetRow = { id: widgetId, user_id: userId, name: 'Phone', token_hash: 'never-return-this-hash', created_at: now.toISOString(), expires_at: '2026-12-14T12:30:00.500Z', revoked_at: null, encrypted_value: 'never-return-this-value' };
function request(method: string, body?: unknown, headers: Record<string, string> = {}, query = '') {
  return new Request(`${origin}/api/test${query}`, {
    method, headers: { origin, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const widgetContext = () => ({ params: Promise.resolve({ id: widgetId }) });
function assertNoPrivateSideEffects() {
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.readCredential).not.toHaveBeenCalled();
  expect(mocks.saveCredential).not.toHaveBeenCalled();
  expect(mocks.revokeGrants).not.toHaveBeenCalled();
  expect(mocks.bootstrap).not.toHaveBeenCalled();
  expect(mocks.buildPortfolio).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('APP_BASE_URL', origin);
  mocks.principal.mockResolvedValue({ userId, kind: 'web', accessToken: 'signed-browser-access-token', expiresAt: 1795000000,
    accountEmail: 'verified@example.invalid', accountName: 'Test' });
  mocks.configured.mockReturnValue(publicOptions);
  mocks.session.mockResolvedValue({ user: { sub: userId, email: 'verified@example.invalid', name: 'Test', email_verified: true } });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.readCredential.mockResolvedValue(providerKey);
  mocks.decryptCredential.mockReturnValue(providerKey);
  mocks.saveCredential.mockResolvedValue(undefined);
  mocks.revokeGrants.mockResolvedValue(undefined);
  mocks.bootstrap.mockResolvedValue(undefined);
  mocks.buildPortfolio.mockImplementation(async () => Response.json({
    timestamp: now.toISOString(), usdToIlsRate: 3.7, summary: { totalCurrentPnLUsd: 12 },
    stocks: [{ symbol: 'TEST', quantity: 2, currentPrice: 100, totalValueUsd: 200, totalValueIls: 740, currentPnLUsd: 12, currentPnLIls: 44.4, dailyChange: 1,
      user_id: userId, location: 'private-broker-account', lots: [{ id: 'private-lot' }], settings: { finnhub_token: providerKey } }],
    settings: { finnhub_token: providerKey }, lots: [{ id: 'private-lot' }], plans: ['private-plan'], userId,
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const accountCalls = [
  ['credentials GET', () => getCredentials()],
  ['credentials PUT', () => putCredentials(request('PUT', { token: providerKey }))],
  ['credentials DELETE', () => deleteCredentials(request('DELETE'))],
  ['connections GET', () => getConnections()],
  ['MCP POST', () => updateMcp(request('POST', { action: 'disconnect' }))],
  ['widget POST', () => createWidget(request('POST', { name: 'Phone' }))],
  ['widget DELETE', () => revokeWidget(request('DELETE'), widgetContext())],
  ['database token GET', () => databaseToken()],
  ['session GET', () => accountSession()],
] as const;

describe('account authentication and mutation boundaries', () => {
  it.each(accountCalls)('rejects anonymous %s before private reads or side effects', async (_name, call) => {
    mocks.principal.mockRejectedValue(new AuthenticationError());
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    assertNoPrivateSideEffects();
  });

  it.each([
    ['credentials PUT', (req: Request) => putCredentials(req), 'PUT', { token: providerKey }],
    ['credentials DELETE', (req: Request) => deleteCredentials(req), 'DELETE', undefined],
    ['MCP POST', (req: Request) => updateMcp(req), 'POST', { action: 'disconnect' }],
    ['widget POST', (req: Request) => createWidget(req), 'POST', { name: 'Phone' }],
    ['widget DELETE', (req: Request) => revokeWidget(req, widgetContext()), 'DELETE', undefined],
  ] as const)('requires a same-origin request for %s', async (_name, call, method, body) => {
    for (const badHeaders of [{ origin: '' }, { origin: 'https://attacker.example' }, { origin, 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      expect((await call(request(method, body, badHeaders))).status).toBe(403);
    }
    expect(mocks.principal).not.toHaveBeenCalled();
    assertNoPrivateSideEffects();
  });

  it.each([
    ['credentials', () => putCredentials(request('PUT', { token: providerKey, userId: otherUserId }))],
    ['widget creation', () => createWidget(request('POST', { name: 'Phone', user_id: otherUserId }))],
    ['MCP connection', () => updateMcp(request('POST', { action: 'disconnect', userId: otherUserId }))],
  ] as const)('rejects caller-supplied ownership on %s', async (_name, call) => {
    expect((await call()).status).toBe(400);
    assertNoPrivateSideEffects();
  });

  it('saves/removes only the signed-in user credential and never returns the key', async () => {
    const saved = await putCredentials(request('PUT', { token: ` ${providerKey} ` }, {}, `?userId=${otherUserId}`));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ configured: true });
    expect(mocks.saveCredential).toHaveBeenCalledWith(userId, providerKey);
    expect(await (await getCredentials()).json()).toEqual({ configured: true });
    expect(mocks.readCredential).toHaveBeenCalledWith(userId);
    expect(await (await deleteCredentials(request('DELETE', undefined, {}, `?userId=${otherUserId}`))).json()).toEqual({ configured: false });
    expect(mocks.saveCredential).toHaveBeenLastCalledWith(userId, null);
  });

  it('reports an absent credential without exposing a previous key', async () => {
    mocks.readCredential.mockResolvedValue(null);
    expect(await (await getCredentials()).json()).toEqual({ configured: false });
  });

  it('returns only the validated identity and browser token fields', async () => {
    expect(await (await databaseToken()).json()).toEqual({ userId, accessToken: 'signed-browser-access-token', expiresAt: 1795000000 });
    const session = await (await accountSession()).json();
    expect(session).toEqual({ configured: true, options: publicOptions, user: { id: userId, email: 'verified@example.invalid', name: 'Test', emailVerified: true } });
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(JSON.stringify(session)).not.toContain('signed-browser-access-token');
  });
});

describe('widget provisioning and metadata', () => {
  it('returns a random token once, persists only its hash, and redacts internal metadata on later listing', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: widgetRow, error: null });
    const created = await createWidget(request('POST', { name: ' Phone ' }));
    expect(created.status).toBe(201);
    const payload = await created.json();
    expect(payload.token).toMatch(/^lst_widget_[A-Za-z0-9_-]{43}$/);
    expect(mocks.rpc).toHaveBeenCalledWith('server_widget_tokens', {
      p_user_id: userId, p_action: 'create', p_name: 'Phone', p_token_hash: createHash('sha256').update(payload.token).digest('hex'),
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(payload.token);
    expect(payload.widget).toEqual({ id: widgetId, name: 'Phone', createdAt: widgetRow.created_at, expiresAt: widgetRow.expires_at, revokedAt: null, lastUsedAt: null });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'server_widget_tokens' ? [widgetRow] : { enabled: true, last_connected_at: now.toISOString(), private: providerKey }, error: null }));
    const listing = await (await getConnections()).json();
    expect(listing.widgets).toEqual([payload.widget]);
    expect(JSON.stringify(listing)).not.toMatch(/never-return|token_hash|encrypted_value|lst_widget_|private-finnhub/);
    expect(mocks.rpc).toHaveBeenCalledWith('server_widget_tokens', { p_user_id: userId, p_action: 'list' });
  });

  it('scopes revocation to the signed-in principal even when another owner is named in the request', async () => {
    expect((await revokeWidget(request('DELETE', { userId: otherUserId }, {}, `?userId=${otherUserId}`), widgetContext())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('server_widget_tokens', { p_user_id: userId, p_action: 'revoke', p_id: widgetId });
  });

  it('rejects an invalid widget identifier before an admin RPC', async () => {
    expect((await revokeWidget(request('DELETE'), { params: Promise.resolve({ id: 'not-a-uuid' }) })).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('MCP disconnect and reconnect ordering', () => {
  it('blocks database access before revoking all canonical approval aliases, using only the signed-in user', async () => {
    const events: string[] = [];
    mocks.rpc.mockImplementation(async (name: string, args: { p_action: string }) => { events.push(name === 'server_revoke_canonical_mcp_approvals' ? 'revoke-approvals' : args.p_action); return { error: null }; });
    const response = await updateMcp(request('POST', { action: 'disconnect' }, {}, `?userId=${otherUserId}`));
    expect(response.status).toBe(200);
    expect(events).toEqual(['disconnect', 'revoke-approvals']);
    expect(await response.json()).toEqual({ enabled: false, connected: false });
    expect(mocks.rpc).toHaveBeenCalledWith('server_mcp_connection', { p_user_id: userId, p_action: 'disconnect', p_valid_after: Math.ceil(now.getTime() / 1000) });
    expect(mocks.rpc).toHaveBeenCalledWith('server_revoke_canonical_mcp_approvals', { p_profile_id: userId });
  });

  it.each(['disconnect', 'reconnect'])('keeps access disabled when approval revocation fails during %s', async (action) => {
    mocks.rpc.mockImplementation(async (name: string) => ({ error: name === 'server_revoke_canonical_mcp_approvals' ? { message: providerKey } : null }));
    const response = await updateMcp(request('POST', { action }));
    expect(response.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][1].p_action).toBe('disconnect');
    expect(await response.text()).not.toContain(providerKey);
  });

  it('does not attempt provider revocation if the database block could not be saved', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'write failed' } });
    expect((await updateMcp(request('POST', { action: 'disconnect' }))).status).toBe(503);
    expect(mocks.revokeGrants).not.toHaveBeenCalled();
  });

  it('reenables only after cleanup and records a cutoff beyond cleanup completion', async () => {
    const events: string[] = [];
    mocks.rpc.mockImplementation(async (name: string, args: { p_action: string }) => {
      if (name === 'server_revoke_canonical_mcp_approvals') { events.push('revoke-approvals'); vi.setSystemTime(new Date(now.getTime() + 5500)); }
      else events.push(args.p_action);
      return { error: null };
    });
    const response = await updateMcp(request('POST', { action: 'reconnect' }));
    expect(events).toEqual(['disconnect', 'revoke-approvals', 'reconnect']);
    expect(await response.json()).toEqual({ enabled: true, connected: false });
    expect(mocks.rpc).toHaveBeenLastCalledWith('server_mcp_connection', { p_user_id: userId, p_action: 'reconnect', p_valid_after: Math.floor((now.getTime() + 5500) / 1000) + 1 });
  });
});

describe('isolated widget summary access', () => {
  it.each([
    ['missing', {}], ['cookie only', { cookie: 'appSession=valid-browser-cookie' }],
    ['browser access token', { authorization: 'Bearer signed-browser-access-token' }],
    ['malformed widget token', { authorization: 'Bearer lst_widget_short' }],
  ])('rejects %s credentials before any private read', async (_name, headers) => {
    expect((await widgetSummary(request('POST', {}, headers as Record<string, string>))).status).toBe(401);
    assertNoPrivateSideEffects();
    expect(mocks.principal).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'revoked'])('rejects a %s token excluded by the database resolver', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await widgetSummary(request('POST', {}, { authorization: `Bearer ${widgetToken}` }))).status).toBe(401);
    expect(mocks.buildPortfolio).not.toHaveBeenCalled();
    expect(mocks.readCredential).not.toHaveBeenCalled();
  });

  it('rejects an expired resolved token', async () => {
    mocks.rpc.mockResolvedValue({ data: { user_id: userId, expires_at: now.toISOString() }, error: null });
    expect((await widgetSummary(request('POST', {}, { authorization: `Bearer ${widgetToken}` }))).status).toBe(401);
    expect(mocks.buildPortfolio).not.toHaveBeenCalled();
    expect(mocks.readCredential).not.toHaveBeenCalled();
  });

  it('rejects an empty resolved owner before credential or portfolio reads', async () => {
    mocks.rpc.mockResolvedValue({ data: { user_id: '', expires_at: widgetRow.expires_at }, error: null });
    expect((await widgetSummary(request('POST', {}, { authorization: `Bearer ${widgetToken}` }))).status).toBe(401);
    expect(mocks.readCredential).not.toHaveBeenCalled();
    expect(mocks.buildPortfolio).not.toHaveBeenCalled();
  });

  it('rejects malformed expiry metadata rather than treating NaN as unexpired', async () => {
    mocks.rpc.mockResolvedValue({ data: { user_id: userId, expires_at: 'not-a-date' }, error: null });
    expect((await widgetSummary(request('POST', {}, { authorization: `Bearer ${widgetToken}` }))).status).toBe(401);
    expect(mocks.buildPortfolio).not.toHaveBeenCalled();
  });

  it('uses the hash-resolved owner, fixed read options, and a restricted DTO regardless of URL/body', async () => {
    const snapshot = { user_id: userId, expires_at: widgetRow.expires_at, positions: [], position_lots: [], settings: null,
      encrypted_credential: 'encrypted-widget-key', credential_aad_subject: userId };
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'server_widget_snapshot' ? snapshot : { user_id: userId, expires_at: widgetRow.expires_at }, error: null }));
    const response = await widgetSummary(request('POST', { userId: otherUserId, operation: 'delete', includeClosed: true }, { authorization: `Bearer ${widgetToken}`, cookie: 'appSession=another-browser-account' }, `?user_id=${otherUserId}&token=ignored`));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('server_resolve_widget', { p_token_hash: createHash('sha256').update(widgetToken).digest('hex') });
    expect(mocks.rpc).toHaveBeenCalledWith('server_widget_snapshot', { p_token_hash: createHash('sha256').update(widgetToken).digest('hex') });
    expect(mocks.buildPortfolio).toHaveBeenCalledWith({ supabase: { rpc: mocks.rpc }, userId, snapshot, finnhubToken: providerKey }, { includeWeightedPrice: true, targetCurrency: 'ILS' });
    expect(mocks.readCredential).not.toHaveBeenCalled();
    expect(mocks.decryptCredential).toHaveBeenCalledWith(userId, 'encrypted-widget-key');
    expect(mocks.principal).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload).toEqual({ timestamp: now.toISOString(), usdToIlsRate: 3.7, summary: { totalCurrentPnLUsd: 12 },
      stocks: [{ symbol: 'TEST', quantity: 2, currentPrice: 100, totalValueUsd: 200, totalValueIls: 740, currentPnLUsd: 12, currentPnLIls: 44.4, dailyChange: 1 }], widgetTokenExpiresAt: widgetRow.expires_at });
    expect(JSON.stringify(payload)).not.toMatch(/private-|user_id|lots|settings|plans|auth0\|/);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('withholds a snapshot when the widget is revoked while market quotes are loading', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { user_id: userId, expires_at: widgetRow.expires_at, positions: [], position_lots: [], settings: null,
      encrypted_credential: null, credential_aad_subject: userId }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const response = await widgetSummary(request('POST', {}, { authorization: `Bearer ${widgetToken}` }));
    expect(response.status).toBe(401);
    expect(mocks.buildPortfolio).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain('totalCurrentPnLUsd');
  });
});
