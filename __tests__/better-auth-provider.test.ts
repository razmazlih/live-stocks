// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
import nodemailer from 'nodemailer';
import { betterAuthConfiguration, getAuthPublicOptions } from '@/lib/auth/better-auth-config';
import { AUTH_SCOPES, MCP_ALLOWED_SCOPES, createAuthPool, mcpRegistrationScopes } from '@/lib/auth/better-auth';
import { validateAuthRequest } from '@/lib/auth/better-auth-handler';
import { AuthEmailUnavailable, sendAuthEmail } from '@/lib/auth/auth-email';

const origin = 'https://livestocks.example';
const config = { origin, issuer: `${origin}/api/auth`, mcpAudience: `${origin}/api/mcp`, mcpClientId: 'mcp-client-test' };
const env = { APP_BASE_URL: origin, BETTER_AUTH_SECRET: 's'.repeat(48), BETTER_AUTH_DATABASE_URL: 'postgresql://livestocks_auth_backend@127.0.0.1:54998/dummy', BETTER_AUTH_WEBSITE_CLIENT_ID: 'website-test', BETTER_AUTH_MCP_CLIENT_ID: config.mcpClientId };
function configured() { vi.stubEnv('PASSWORD_AUTH_ENABLED', 'true'); for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); }
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('own-origin auth configuration', () => {
  it('keeps password and email delivery off unless explicitly enabled', () => {
    configured();
    for (const flag of ['', 'false', 'TRUE', '1']) {
      vi.stubEnv('PASSWORD_AUTH_ENABLED', flag);
      expect(getAuthPublicOptions()).toMatchObject({ passwordEnabled: false, emailDeliveryConfigured: false });
      expect(validateAuthRequest(new Request(`${origin}/api/auth/sign-up/email`, { method: 'POST', headers: { origin } }), config)?.status).toBe(404);
    }
  });
  it('uses only the fixed configured origin for issuer and API audiences', () => {
    configured(); const c = betterAuthConfiguration();
    expect(c.issuer).toBe(`${origin}/api/auth`); expect(c.websiteAudience).toBe(`${origin}/api/web`); expect(c.mcpAudience).toBe(config.mcpAudience);
  });
  it.each(['https://name:password@livestocks.example', 'https://livestocks.example/path', 'https://livestocks.example?issuer=evil', 'http://livestocks.example'])('rejects unsafe configured origin %s', value => {
    configured(); vi.stubEnv('APP_BASE_URL', value); expect(() => betterAuthConfiguration()).toThrow();
  });
  it('rejects shared web/MCP client identities', () => { configured(); vi.stubEnv('BETTER_AUTH_WEBSITE_CLIENT_ID', config.mcpClientId); expect(() => betterAuthConfiguration()).toThrow(); });
  it('uses a local browser origin without changing registered database trust', () => {
    configured(); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('LOCAL_AUTH_ORIGIN', 'http://localhost:3001');
    expect(betterAuthConfiguration()).toMatchObject({ origin: 'http://localhost:3001', issuer: `${origin}/api/auth`, websiteAudience: `${origin}/api/web`, mcpAudience: config.mcpAudience });
  });
  it.each(['https://localhost:3001', 'http://evil.example:3001', 'http://localhost:3001/path', 'http://user:pass@localhost:3001', 'http://localhost:3001?x=1'])('rejects unsafe local browser origin %s', value => {
    configured(); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('LOCAL_AUTH_ORIGIN', value);
    expect(() => betterAuthConfiguration()).toThrow();
  });
  it.each(['production', 'test'])('rejects local origin overrides outside development (%s)', value => {
    configured(); vi.stubEnv('NODE_ENV', value); vi.stubEnv('LOCAL_AUTH_ORIGIN', 'http://localhost:3001');
    expect(() => betterAuthConfiguration()).toThrow();
  });
  it('public options contain booleans only and do not require a database call', () => {
    configured(); vi.stubEnv('SMTP_PASSWORD', ''); vi.stubEnv('GOOGLE_CLIENT_ID', '');
    expect(getAuthPublicOptions()).toEqual({ configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false, demoEnabled: false });
  });
  it('refuses a privileged database role', () => {
    configured(); expect(() => createAuthPool({ ...betterAuthConfiguration(), databaseUrl: 'postgresql://postgres@127.0.0.1/dummy' })).toThrow('dedicated database role');
  });
  it('refuses database URL search_path overrides', () => {
    configured(); expect(() => createAuthPool({ ...betterAuthConfiguration(), databaseUrl: `${env.BETTER_AUTH_DATABASE_URL}?options=-c%20search_path=public` })).toThrow();
  });
});

describe('MCP authorization boundary', () => {
  function authorize(parameters: string) { return new Request(`${config.issuer}/oauth2/authorize?client_id=${config.mcpClientId}&scope=portfolio%3Aread&${parameters}`); }
  it('allows only the one canonical resource', () => { expect(validateAuthRequest(authorize(`resource=${encodeURIComponent(config.mcpAudience)}`), config)).toBeNull(); });
  it.each(['', 'resource=https://evil.example/mcp', `resource=${encodeURIComponent(config.mcpAudience)}&resource=${encodeURIComponent(config.mcpAudience)}`, `resource=${encodeURIComponent(config.mcpAudience)}&audience=https://evil.example`])('rejects absent, foreign or duplicate resource %s', parameters => {
    expect(validateAuthRequest(authorize(parameters), config)?.status).toBe(400);
  });
  it('rejects duplicate or unknown clients before redirects', () => {
    expect(validateAuthRequest(authorize(`resource=${config.mcpAudience}&client_id=other`), config)?.status).toBe(400);
    expect(validateAuthRequest(new Request(`${config.issuer}/oauth2/authorize?client_id=other&resource=${config.mcpAudience}`), config)?.status).toBe(400);
  });
  it('keeps synchronization optional and requires explicit requested scopes', () => {
    expect(AUTH_SCOPES).not.toContain('portfolio:sync');
    expect(MCP_ALLOWED_SCOPES).toContain('portfolio:sync');
    expect(MCP_ALLOWED_SCOPES).not.toContain('portfolio:write');
    const base = `${config.issuer}/oauth2/authorize?client_id=${config.mcpClientId}&resource=${encodeURIComponent(config.mcpAudience)}`;
    expect(validateAuthRequest(new Request(base), config)?.status).toBe(400);
    expect(validateAuthRequest(new Request(`${base}&scope=portfolio:read%20portfolio:sync`), config)).toBeNull();
    expect(validateAuthRequest(new Request(`${base}&scope=portfolio:read%20portfolio:write`), config)?.status).toBe(400);
    expect(validateAuthRequest(new Request(`${base}&scope=portfolio:read&scope=portfolio:sync`), config)?.status).toBe(400);
  });
  it('makes transaction recording a separate optional permission with no automatic sync grant', () => {
    expect(AUTH_SCOPES).not.toContain('portfolio:transactions');
    expect(MCP_ALLOWED_SCOPES).toContain('portfolio:transactions');
    const base = `${config.issuer}/oauth2/authorize?client_id=${config.mcpClientId}&resource=${encodeURIComponent(config.mcpAudience)}`;
    expect(validateAuthRequest(new Request(`${base}&scope=portfolio:read%20portfolio:transactions`), config)).toBeNull();
    expect(validateAuthRequest(new Request(`${base}&scope=portfolio:transactions`), config)?.status).toBe(400);
    expect(mcpRegistrationScopes()).toEqual(AUTH_SCOPES);
    expect(mcpRegistrationScopes(AUTH_SCOPES, { enablePortfolioSync: true })).toEqual([...AUTH_SCOPES, 'portfolio:sync']);
    expect(mcpRegistrationScopes(AUTH_SCOPES, { enablePortfolioTransactions: true })).toEqual([...AUTH_SCOPES, 'portfolio:transactions']);
    expect(mcpRegistrationScopes([...AUTH_SCOPES, 'portfolio:sync'], { enablePortfolioTransactions: true })).toEqual(MCP_ALLOWED_SCOPES);
    expect(mcpRegistrationScopes(MCP_ALLOWED_SCOPES, { enablePortfolioSync: true })).toEqual(MCP_ALLOWED_SCOPES);
    for (const current of [[...AUTH_SCOPES, 'portfolio:write'], [...AUTH_SCOPES, 'portfolio:sync:all'], ['portfolio:transactions'], [...AUTH_SCOPES, 'portfolio:read']]) {
      expect(() => mcpRegistrationScopes(current, { enablePortfolioTransactions: true })).toThrow('requires review');
    }
  });
  it('requires an exact origin for browser mutations including first login', () => {
    for (const headers of [{}, { origin: 'https://evil.example' }, { origin, 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      expect(validateAuthRequest(new Request(`${config.issuer}/sign-in/social`, { method: 'POST', headers }), config)?.status).toBe(403);
    }
    expect(validateAuthRequest(new Request(`${config.issuer}/sign-in/social`, { method: 'POST', headers: { origin } }), config)).toBeNull();
  });
  it('does not require browser Origin on protocol token requests', () => {
    expect(validateAuthRequest(new Request(`${config.issuer}/oauth2/token`, { method: 'POST' }), config)).toBeNull();
  });
});

describe('authentication email delivery', () => {
  it.each(['', 'smtp', '0', '-1', '65536', '587.5', '5.87e2', '0x24b'])('does not advertise delivery or create a transport with invalid SMTP port %s', async port => {
    configured();
    for (const [key, value] of Object.entries({ SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: port, SMTP_FROM: 'no-reply@example.invalid', SMTP_USER: 'dummy', SMTP_PASSWORD: 'private-test-value' })) vi.stubEnv(key, value);
    expect(getAuthPublicOptions().emailDeliveryConfigured).toBe(false);
    await expect(sendAuthEmail('dummy@example.invalid', 'https://example.invalid/verify', 'verify')).rejects.toBeInstanceOf(AuthEmailUnavailable);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it.each(['465', '587', ' 587 ', '65535'])('recognizes a configured SMTP port %s', port => {
    configured();
    for (const [key, value] of Object.entries({ SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: port, SMTP_FROM: 'no-reply@example.invalid', SMTP_USER: 'dummy', SMTP_PASSWORD: 'private-test-value' })) vi.stubEnv(key, value);
    expect(getAuthPublicOptions().emailDeliveryConfigured).toBe(true);
  });
  it('fails before transport creation when SMTP is absent', async () => {
    vi.stubEnv('SMTP_HOST', ''); await expect(sendAuthEmail('dummy@example.invalid', 'https://example.invalid/verify', 'verify')).rejects.toBeInstanceOf(AuthEmailUnavailable);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it('requires verified TLS and reports a delivery failure instead of success', async () => {
    vi.stubEnv('PASSWORD_AUTH_ENABLED', 'true');
    for (const [key, value] of Object.entries({ SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_FROM: 'no-reply@example.invalid', SMTP_USER: 'dummy', SMTP_PASSWORD: 'private-test-value', SMTP_SECURE: 'false' })) vi.stubEnv(key, value);
    const close = vi.fn(); const sendMail = vi.fn().mockRejectedValue(new Error('private-test-value'));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, close } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await expect(sendAuthEmail('dummy@example.invalid', 'https://example.invalid/verify', 'verify')).rejects.toThrow('Email delivery is unavailable');
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, tls: { rejectUnauthorized: true } }));
    expect(close).toHaveBeenCalledOnce();
  });
});
