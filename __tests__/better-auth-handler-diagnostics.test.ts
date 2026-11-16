// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ config: vi.fn(), auth: vi.fn(), handler: vi.fn() }));
vi.mock('@/lib/auth/better-auth', () => ({
  betterAuthConfiguration: mocks.config, getBetterAuth: mocks.auth,
  MCP_ALLOWED_SCOPES: ['portfolio:read'],
}));
vi.mock('@/lib/auth/better-auth-config', () => ({ isPasswordAuthEnabled: () => false, isPasswordAuthPath: () => false }));
import { handleBetterAuthRequest } from '@/lib/auth/better-auth-handler';
const origin = 'https://example.test';
function request() {
  return new Request(origin + '/api/auth/sign-in/social?private-query=SECRET_QUERY', {
    method: 'POST', headers: { origin, cookie: 'SECRET_COOKIE', authorization: 'Bearer SECRET_TOKEN' },
    body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
  });
}
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  mocks.config.mockReset().mockReturnValue({ origin, issuer: origin + '/api/auth', mcpClientId: 'test-mcp-client', mcpAudience: origin + '/api/mcp' });
  mocks.auth.mockReset().mockImplementation(() => ({ handler: mocks.handler, $context: Promise.resolve({}) }));
  mocks.handler.mockReset().mockResolvedValue(Response.json({ redirect: true }));
});

describe('safe authentication failure diagnostics', () => {
  it.each(['configuration', 'initialization', 'request'] as const)('records %s failures without changing the private response', async phase => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = Object.assign(new Error('SECRET_PASSWORD postgres://user:SECRET_DB@private-host'), { code: '28P01', stack: 'SECRET_STACK' });
    if (phase === 'configuration') mocks.config.mockImplementation(() => { throw failure; });
    else if (phase === 'initialization') mocks.auth.mockImplementation(() => { throw failure; });
    else mocks.handler.mockRejectedValue(failure);
    const response = await handleBetterAuthRequest(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable' });
    expect(log).toHaveBeenCalledExactlyOnceWith('Authentication request failed', {
      phase, error: { name: 'Error', category: 'postgres', code: '28P01' },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-host');
  });

  it('classifies an asynchronous SDK initialization rejection before invoking any handler', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.auth.mockImplementation(() => ({ handler: mocks.handler, $context: Promise.reject(Object.assign(new Error('SECRET_INIT'), { code: 'ECONNRESET' })) }));
    expect((await handleBetterAuthRequest(request())).status).toBe(503);
    expect(mocks.handler).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith('Authentication request failed', {
      phase: 'initialization', error: { name: 'Error', category: 'node', code: 'ECONNRESET' },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
  });

  it('recognizes allowlisted TLS cause codes and suppresses all other error fields', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = Object.assign(new Error('SECRET_CA'), { code: 'SELF_SIGNED_CERT_IN_CHAIN', query: 'SECRET_SQL' });
    const failure = Object.assign(new TypeError('SECRET_OUTER'), { cause, request: request(), token: 'SECRET_TOKEN' });
    mocks.handler.mockRejectedValue(failure);
    await handleBetterAuthRequest(request());
    expect(log).toHaveBeenCalledExactlyOnceWith('Authentication request failed', {
      phase: 'request', error: { name: 'TypeError', category: 'unknown', code: 'UNRECOGNIZED' },
      cause: { name: 'Error', category: 'tls', code: 'SELF_SIGNED_CERT_IN_CHAIN' },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
  });

  it('never logs arbitrary names, codes, string errors or unsafe accessor values', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const failure of [
      { name: 'SECRET_NAME', code: 'ABCDE', message: 'SECRET_MESSAGE', stack: 'SECRET_STACK', cause: 'SECRET_CAUSE' },
      'SECRET_THROWN_STRING',
      { get name() { throw new Error('SECRET_GETTER'); }, get code() { throw new Error('SECRET_CODE'); }, get cause() { throw new Error('SECRET_CAUSE'); } },
    ]) {
      mocks.handler.mockRejectedValueOnce(failure);
      expect((await handleBetterAuthRequest(request())).status).toBe(503);
    }
    expect(log).toHaveBeenCalledTimes(3);
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain('SECRET'); expect(output).not.toContain('ABCDE');
    expect(output).toContain('UnknownError');
  });

  it('reports session-pool capacity only for a known XX000 prefix and never emits its message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const message of ['MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size SECRET_DETAILS', 'max clients reached pool_size SECRET_DETAILS']) {
      mocks.handler.mockRejectedValueOnce(Object.assign(new Error(message), { code: 'XX000' }));
      expect((await handleBetterAuthRequest(request())).status).toBe(503);
      expect(log.mock.calls.at(-1)?.[1]).toMatchObject({ error: { category: 'postgres', code: 'XX000', reason: 'session-pool-capacity' } });
    }
    mocks.handler.mockRejectedValueOnce(Object.assign(new Error('SECRET_UNRELATED_INTERNAL_ERROR'), { code: 'XX000' }));
    await handleBetterAuthRequest(request());
    expect(log.mock.calls.at(-1)?.[1].error).not.toHaveProperty('reason');
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
    expect(JSON.stringify(log.mock.calls)).not.toContain('max clients reached');
  });

  it('does not log successful requests or ordinary origin rejections', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleBetterAuthRequest(request())).status).toBe(200);
    expect((await handleBetterAuthRequest(new Request(origin + '/api/auth/sign-in/social', { method: 'POST', headers: { origin: 'https://other.invalid' } }))).status).toBe(403);
    expect(log).not.toHaveBeenCalled();
  });
});
