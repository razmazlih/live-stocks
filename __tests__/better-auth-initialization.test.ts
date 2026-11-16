// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@vercel/functions', () => ({ attachDatabasePool: vi.fn() }));
const mocks = vi.hoisted(() => ({ factory: vi.fn(), pools: [] as { on: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }[], config: {
  origin: 'https://example.test', issuer: 'https://example.test/api/auth', websiteAudience: 'https://example.test/api/web', mcpAudience: 'https://example.test/api/mcp',
  websiteClientId: 'test-website', mcpClientId: 'test-mcp-client', secret: 'synthetic-test-secret-at-least-thirty-two-characters',
  databaseUrl: 'postgres://livestocks_auth_backend@127.0.0.1/synthetic',
} }));
vi.mock('better-auth', () => ({ betterAuth: mocks.factory }));
vi.mock('pg', () => ({ Pool: class {
  on = vi.fn(); end = vi.fn().mockResolvedValue(undefined);
  constructor() { mocks.pools.push(this); }
} }));
vi.mock('@/lib/auth/better-auth-config', () => ({ betterAuthConfiguration: () => ({ ...mocks.config }), getAuthPublicOptions: vi.fn(), isPasswordAuthEnabled: () => false, PASSWORD_AUTH_PATHS: [] }));
import { getBetterAuth, shutdownBetterAuth } from '@/lib/auth/better-auth';
function deferred() {
  let resolve!: (value: object) => void, reject!: (error: Error) => void;
  const promise = new Promise<object>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function instance(context = Promise.resolve({})) {
  return { $context: context, handler: vi.fn().mockResolvedValue(Response.json({ ok: true })), api: {} };
}
beforeEach(() => { mocks.factory.mockReset(); mocks.pools.length = 0; mocks.config.secret = 'synthetic-test-secret-at-least-thirty-two-characters'; });
afterEach(async () => { await shutdownBetterAuth(); vi.restoreAllMocks(); });

describe('authentication initialization recovery', () => {
  it('fails the first request once and initializes fresh only for a later independent request', async () => {
    const initialization = deferred(), failed = instance(initialization.promise), healthy = instance();
    mocks.factory.mockReturnValueOnce(failed).mockReturnValueOnce(healthy);
    const first = getBetterAuth()!;
    expect(getBetterAuth()).toBe(first);
    const failure = Object.assign(new Error('synthetic initializer unavailable'), { code: 'ECONNRESET' });
    initialization.reject(failure);
    await expect(first.$context).rejects.toBe(failure);
    expect(failed.handler).not.toHaveBeenCalled();
    expect(mocks.factory).toHaveBeenCalledTimes(1);
    expect(mocks.pools[0].end).toHaveBeenCalledOnce();
    const second = getBetterAuth()!;
    expect(second).toBe(healthy); expect(second).not.toBe(first);
    await second.$context;
    expect((await second.handler(new Request('https://example.test/api/auth/get-session'))).status).toBe(200);
    expect(healthy.handler).toHaveBeenCalledOnce();
    expect(mocks.factory).toHaveBeenCalledTimes(2);
    expect(getBetterAuth()).toBe(second);
  });

  it('does not let an old rejected context discard a newer singleton', async () => {
    const initialization = deferred(), old = instance(initialization.promise), healthy = instance();
    mocks.factory.mockReturnValueOnce(old).mockReturnValueOnce(healthy);
    getBetterAuth();
    mocks.config.secret = 'different-synthetic-secret-at-least-thirty-two-characters';
    expect(getBetterAuth()).toBe(healthy);
    initialization.reject(new Error('late failure from retired instance'));
    await expect(old.$context).rejects.toThrow('late failure');
    expect(getBetterAuth()).toBe(healthy);
    expect(mocks.pools[1].end).not.toHaveBeenCalled();
    expect(mocks.factory).toHaveBeenCalledTimes(2);
  });

  it('keeps the healthy singleton after a handler failure and never replays the operation', async () => {
    const healthy = instance(); healthy.handler.mockRejectedValueOnce(new Error('synthetic request failure'));
    mocks.factory.mockReturnValue(healthy);
    const auth = getBetterAuth()!; await auth.$context;
    await expect(auth.handler(new Request('https://example.test/api/auth/sign-in/social', { method: 'POST' }))).rejects.toThrow('synthetic request failure');
    expect(getBetterAuth()).toBe(auth);
    expect(healthy.handler).toHaveBeenCalledOnce();
    expect(mocks.factory).toHaveBeenCalledOnce();
    expect(mocks.pools[0].end).not.toHaveBeenCalled();
  });

  it('suppresses pool-cleanup failures without losing initialization recovery', async () => {
    const initialization = deferred(), failed = instance(initialization.promise), healthy = instance();
    mocks.factory.mockReturnValueOnce(failed).mockReturnValueOnce(healthy);
    const first = getBetterAuth()!;
    mocks.pools[0].end.mockRejectedValue(new Error('synthetic cleanup failed'));
    initialization.reject(new Error('synthetic init failed'));
    await expect(first.$context).rejects.toThrow('synthetic init failed');
    expect(getBetterAuth()).toBe(healthy);
    await Promise.resolve();
  });
});
