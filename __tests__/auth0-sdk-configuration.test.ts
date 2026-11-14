import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeSignInReturnTo } from '@/lib/auth/return-to';

const { sdkConstructor } = vi.hoisted(() => ({ sdkConstructor: vi.fn() }));
vi.mock('@auth0/nextjs-auth0/server', () => ({ Auth0Client: sdkConstructor }));
const configuration = {
  AUTH0_DOMAIN: 'tenant.example', AUTH0_CLIENT_ID: 'website-client', AUTH0_CLIENT_SECRET: 'synthetic-client-secret',
  AUTH0_SECRET: 'a'.repeat(64), APP_BASE_URL: 'https://portfolio.example', AUTH0_WEB_AUDIENCE: 'https://api.example/web',
  AUTH0_MCP_CLIENT_ID: 'mcp-client', AUTH0_MCP_AUDIENCE: 'https://api.example/mcp',
};
type Callback = (error: Error | null, context: { returnTo?: string; appBaseUrl?: string }) => Promise<Response>;

describe('Auth0 SDK configuration and callback boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    sdkConstructor.mockReset();
    Object.entries(configuration).forEach(([key, value]) => vi.stubEnv(key, value));
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(Object.keys(configuration))('fails closed when %s is missing', async (missing) => {
    vi.stubEnv(missing, '');
    const auth = await import('@/lib/auth/auth0');
    expect(auth.isAuth0Configured()).toBe(false);
    expect(auth.getAuth0()).toBeNull();
    expect(sdkConstructor).not.toHaveBeenCalled();
  });

  it('creates the SDK lazily once with the client access-token endpoint disabled', async () => {
    const auth = await import('@/lib/auth/auth0');
    expect(auth.isAuth0Configured()).toBe(true);
    expect(sdkConstructor).not.toHaveBeenCalled();
    auth.getAuth0();
    auth.getAuth0();
    expect(sdkConstructor).toHaveBeenCalledOnce();
    expect(sdkConstructor.mock.calls[0][0].enableAccessTokenEndpoint).toBe(false);
  });

  it('maps provider errors to a fixed friendly route without echoing error text or trusting callback hosts', async () => {
    const auth = await import('@/lib/auth/auth0');
    auth.getAuth0();
    const callback = sdkConstructor.mock.calls[0][0].onCallback as Callback;
    const response = await callback(new Error('provider secret error_description=synthetic-secret'), { returnTo: '//attacker.example', appBaseUrl: 'https://attacker.example' });
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://portfolio.example/sign-in?error=sign-in-failed');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).not.toContain('synthetic-secret');
  });

  it('preserves a safe relative destination on success and after a failed attempt', async () => {
    const auth = await import('@/lib/auth/auth0');
    auth.getAuth0();
    const callback = sdkConstructor.mock.calls[0][0].onCallback as Callback;
    expect((await callback(null, { returnTo: '/positions?account=bank_one' })).headers.get('Location')).toBe('https://portfolio.example/positions?account=bank_one');
    const failure = await callback(new Error('denied'), { returnTo: '/positions?account=bank_one' });
    expect(new URL(failure.headers.get('Location')!).searchParams.get('returnTo')).toBe('/positions?account=bank_one');
  });
});

describe('sign-in return paths', () => {
  it.each([undefined, null, ['//attacker.example'], 'https://attacker.example', '//attacker.example', '/\\attacker.example', '/\n/attacker.example'])('rejects unsafe or malformed destination %s', (value) => {
    expect(safeSignInReturnTo(value)).toBe('/');
  });
  it('retains ordinary app paths with search and hash', () => {
    expect(safeSignInReturnTo('/watchlist?group=sample#top')).toBe('/watchlist?group=sample#top');
  });
});
