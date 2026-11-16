// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ attach: vi.fn(), pools: [] as { options: Record<string, unknown>; on: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }[] }));
vi.mock('@vercel/functions', () => ({ attachDatabasePool: mocks.attach }));
vi.mock('pg', () => ({ Pool: class {
  options: Record<string, unknown>; on = vi.fn(); end = vi.fn().mockResolvedValue(undefined);
  constructor(options: Record<string, unknown>) { this.options = options; mocks.pools.push(this); }
} }));
import { createAuthPool } from '@/lib/auth/better-auth';
const config = { origin: 'https://example.test', issuer: 'https://example.test/api/auth', websiteAudience: 'web', mcpAudience: 'mcp', websiteClientId: 'website-client', mcpClientId: 'mcp-client', secret: 'synthetic-secret-at-least-thirty-two-characters', databaseUrl: 'postgres://livestocks_auth_backend.synthetic@pooler.example.invalid:5432/postgres?sslmode=require' };
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.pools.length = 0; });

describe('authentication database pool lifecycle', () => {
  it('attaches the pool to Vercel and bounds per-instance idle connection usage', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BETTER_AUTH_DATABASE_CA', 'synthetic-ca');
    const pool = createAuthPool(config);
    expect(mocks.attach).toHaveBeenCalledExactlyOnceWith(pool);
    expect(mocks.pools[0].options).toMatchObject({ max: 2, idleTimeoutMillis: 5000, maxLifetimeSeconds: 60, allowExitOnIdle: true, connectionTimeoutMillis: 10000 });
    expect(mocks.pools[0].on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('preserves session-pool endpoint, private search path, dedicated role and strict TLS', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BETTER_AUTH_DATABASE_CA', 'synthetic-ca');
    createAuthPool(config);
    const options = mocks.pools[0].options;
    const url = new URL(options.connectionString as string);
    expect(url.hostname).toBe('pooler.example.invalid'); expect(url.port).toBe('5432');
    expect(url.username).toBe('livestocks_auth_backend.synthetic'); expect(url.searchParams.has('sslmode')).toBe(false);
    expect(options.options).toBe('-c search_path=livestocks_auth -c statement_timeout=15000');
    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca: 'synthetic-ca' });
  });
});
