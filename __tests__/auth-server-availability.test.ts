// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), token: vi.fn(), verify: vi.fn(), rpc: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'SECRET_COOKIE' }) }));
vi.mock('@/lib/auth/better-auth', () => ({ getBetterAuthSession: mocks.session, getWebsiteDatabaseToken: mocks.token }));
vi.mock('@/lib/auth/better-auth-config', () => ({ betterAuthConfiguration: () => ({ origin: 'https://example.test', issuer: 'https://example.test/api/auth', websiteAudience: 'web', mcpAudience: 'mcp', websiteClientId: 'web-client', mcpClientId: 'mcp-client' }) }));
vi.mock('@/lib/auth/admin', () => ({ getAdminSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/auth/auth0-token', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/auth/auth0-token')>(), createAuth0TokenVerifier: () => mocks.verify }));
vi.mock('jose', async importOriginal => ({ ...await importOriginal<typeof import('jose')>(), createRemoteJWKSet: vi.fn() }));
import { requireWebPrincipal, requireMcpPrincipal, AuthenticationError, authenticationResponse } from '@/lib/auth/server';
import { Auth0TokenVerificationError, Auth0TokenInfrastructureError } from '@/lib/auth/auth0-token';
const session = { user: { id: 'owner', emailVerified: true, email: 'owner@example.invalid', name: 'Owner' }, session: { id: 'session-id', createdAt: '2026-11-16T10:00:00Z' } };
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  mocks.session.mockReset().mockResolvedValue(session);
  mocks.token.mockReset().mockResolvedValue({ token: 'SECRET_JWT', session });
  mocks.verify.mockReset().mockResolvedValue({ userId: 'owner', kind: 'web', authSessionId: 'session-id', authSessionCreatedAt: Date.parse(session.session.createdAt) / 1000, clientId: 'web-client', verifiedEmail: session.user.email });
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

describe('authentication availability is distinct from logout', () => {
  it('returns distinct safe codes for expired, revoked and unavailable authorization', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.verify.mockRejectedValueOnce(new Auth0TokenVerificationError('token_expired'));
    const expired = await requireMcpPrincipal(new Request('https://example.test/api/mcp', { headers: { authorization: 'Bearer SECRET_TOKEN' } })).catch(error => error);
    expect(expired).toMatchObject({ status: 401, code: 'token_expired' });
    expect(await authenticationResponse(expired)!.json()).toEqual({ error: 'Authentication required', code: 'token_expired' });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    const revoked = await requireMcpPrincipal(new Request('https://example.test/api/mcp', { headers: { authorization: 'Bearer SECRET_TOKEN' } })).catch(error => error);
    expect(revoked).toMatchObject({ status: 401, code: 'authorization_revoked' });
    expect(await authenticationResponse(new AuthenticationError(503))!.json()).toMatchObject({ code: 'auth_unavailable' });
    expect(log).not.toHaveBeenCalled();
  });
  it.each(['session', 'token'] as const)('returns 503 for infrastructure failure during %s without exposing secrets', async stage => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks[stage].mockRejectedValue(Object.assign(new Error('SECRET_DATABASE_URL'), { code: 'ECONNRESET' }));
    const error = await requireWebPrincipal().catch(error => error);
    expect(error).toBeInstanceOf(AuthenticationError); expect(error.status).toBe(503);
    const response = authenticationResponse(error)!;
    expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).not.toContain('SECRET');
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
    expect(log).toHaveBeenCalledWith('Authentication request failed', expect.objectContaining({ phase: stage === 'session' ? 'session' : 'website-token' }));
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it.each([null, { ...session, user: { ...session.user, emailVerified: false } }])('preserves explicit missing/unverified session rejection', async value => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.session.mockResolvedValue(value);
    await expect(requireWebPrincipal()).rejects.toMatchObject({ status: value === null ? 401 : 403 });
    expect(log).not.toHaveBeenCalled();
  });

  it('preserves explicit authentication errors from dependencies', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.token.mockRejectedValue(new AuthenticationError(403, 'Explicit rejection'));
    await expect(requireWebPrincipal()).rejects.toMatchObject({ status: 403, message: 'Explicit rejection' });
    expect(log).not.toHaveBeenCalled();
  });

  it('keeps an invalid verified token at 401 but reports unavailable key retrieval at 503', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.verify.mockRejectedValueOnce(new Auth0TokenVerificationError());
    await expect(requireWebPrincipal()).rejects.toMatchObject({ status: 401 });
    expect(log).not.toHaveBeenCalled();
    mocks.verify.mockRejectedValueOnce(new Auth0TokenInfrastructureError(Object.assign(new Error('SECRET_NETWORK'), { code: 'ETIMEDOUT' })));
    await expect(requireWebPrincipal()).rejects.toMatchObject({ status: 503 });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 503 for MCP key retrieval failures without cookie fallback or automatic replay', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.verify.mockRejectedValueOnce(new Auth0TokenInfrastructureError(new Error('SECRET_KEY_SERVICE')));
    await expect(requireMcpPrincipal(new Request('https://example.test/api/mcp', { headers: { authorization: 'Bearer SECRET_TOKEN' } }))).rejects.toMatchObject({ status: 503 });
    expect(mocks.verify).toHaveBeenCalledOnce(); expect(mocks.session).not.toHaveBeenCalled();
  });

  it('logs returned account storage errors safely and preserves an explicit 503', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '53300', message: 'SECRET_QUERY', details: 'SECRET_DETAILS' } });
    await expect(requireWebPrincipal()).rejects.toMatchObject({ status: 503 });
    expect(log).toHaveBeenCalledWith('Authentication request failed', expect.objectContaining({ phase: 'account-storage', error: { category: 'postgres', name: 'UnknownError', code: '53300' } }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
  });

  it('continues to reject an explicitly revoked session with 401', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(requireWebPrincipal()).rejects.toMatchObject({ status: 401 });
  });
});
