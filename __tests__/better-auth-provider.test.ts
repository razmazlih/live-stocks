// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
import nodemailer from 'nodemailer';
import { betterAuthConfiguration, getAuthPublicOptions } from '@/lib/auth/better-auth-config';
import { createAuthPool } from '@/lib/auth/better-auth';
import { validateAuthRequest } from '@/lib/auth/better-auth-handler';
import { AuthEmailUnavailable, sendAuthEmail } from '@/lib/auth/auth-email';

const origin = 'https://livestocks.example';
const config = { origin, issuer: `${origin}/api/auth`, mcpAudience: `${origin}/api/mcp`, mcpClientId: 'mcp-client-test' };
const env = { APP_BASE_URL: origin, BETTER_AUTH_SECRET: 's'.repeat(48), BETTER_AUTH_DATABASE_URL: 'postgresql://livestocks_auth_backend@127.0.0.1:54998/dummy', BETTER_AUTH_WEBSITE_CLIENT_ID: 'website-test', BETTER_AUTH_MCP_CLIENT_ID: config.mcpClientId };
function configured() { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); }
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('own-origin auth configuration', () => {
  it('uses only the fixed configured origin for issuer and API audiences', () => {
    configured(); const c = betterAuthConfiguration();
    expect(c.issuer).toBe(`${origin}/api/auth`); expect(c.websiteAudience).toBe(`${origin}/api/web`); expect(c.mcpAudience).toBe(config.mcpAudience);
  });
  it.each(['https://name:password@livestocks.example', 'https://livestocks.example/path', 'https://livestocks.example?issuer=evil', 'http://livestocks.example'])('rejects unsafe configured origin %s', value => {
    configured(); vi.stubEnv('APP_BASE_URL', value); expect(() => betterAuthConfiguration()).toThrow();
  });
  it('rejects shared web/MCP client identities', () => { configured(); vi.stubEnv('BETTER_AUTH_WEBSITE_CLIENT_ID', config.mcpClientId); expect(() => betterAuthConfiguration()).toThrow(); });
  it('public options contain booleans only and do not require a database call', () => {
    configured(); vi.stubEnv('SMTP_PASSWORD', ''); vi.stubEnv('GOOGLE_CLIENT_ID', '');
    expect(getAuthPublicOptions()).toEqual({ configured: true, googleEnabled: false, emailDeliveryConfigured: false });
  });
  it('refuses a privileged database role', () => {
    configured(); expect(() => createAuthPool({ ...betterAuthConfiguration(), databaseUrl: 'postgresql://postgres@127.0.0.1/dummy' })).toThrow('dedicated database role');
  });
  it('refuses database URL search_path overrides', () => {
    configured(); expect(() => createAuthPool({ ...betterAuthConfiguration(), databaseUrl: `${env.BETTER_AUTH_DATABASE_URL}?options=-c%20search_path=public` })).toThrow();
  });
});

describe('MCP authorization boundary', () => {
  function authorize(parameters: string) { return new Request(`${config.issuer}/oauth2/authorize?client_id=${config.mcpClientId}&${parameters}`); }
  it('allows only the one canonical resource', () => { expect(validateAuthRequest(authorize(`resource=${encodeURIComponent(config.mcpAudience)}`), config)).toBeNull(); });
  it.each(['', 'resource=https://evil.example/mcp', `resource=${encodeURIComponent(config.mcpAudience)}&resource=${encodeURIComponent(config.mcpAudience)}`, `resource=${encodeURIComponent(config.mcpAudience)}&audience=https://evil.example`])('rejects absent, foreign or duplicate resource %s', parameters => {
    expect(validateAuthRequest(authorize(parameters), config)?.status).toBe(400);
  });
  it('rejects duplicate or unknown clients before redirects', () => {
    expect(validateAuthRequest(authorize(`resource=${config.mcpAudience}&client_id=other`), config)?.status).toBe(400);
    expect(validateAuthRequest(new Request(`${config.issuer}/oauth2/authorize?client_id=other&resource=${config.mcpAudience}`), config)?.status).toBe(400);
  });
  it('requires an exact origin for browser mutations including first login', () => {
    for (const headers of [{}, { origin: 'https://evil.example' }, { origin, 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      expect(validateAuthRequest(new Request(`${config.issuer}/sign-in/email`, { method: 'POST', headers }), config)?.status).toBe(403);
    }
    expect(validateAuthRequest(new Request(`${config.issuer}/sign-in/email`, { method: 'POST', headers: { origin } }), config)).toBeNull();
  });
  it('does not require browser Origin on protocol token requests', () => {
    expect(validateAuthRequest(new Request(`${config.issuer}/oauth2/token`, { method: 'POST' }), config)).toBeNull();
  });
});

describe('authentication email delivery', () => {
  it('fails before transport creation when SMTP is absent', async () => {
    vi.stubEnv('SMTP_HOST', ''); await expect(sendAuthEmail('dummy@example.invalid', 'https://example.invalid/verify', 'verify')).rejects.toBeInstanceOf(AuthEmailUnavailable);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
  it('requires verified TLS and reports a delivery failure instead of success', async () => {
    for (const [key, value] of Object.entries({ SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_FROM: 'no-reply@example.invalid', SMTP_USER: 'dummy', SMTP_PASSWORD: 'private-test-value', SMTP_SECURE: 'false' })) vi.stubEnv(key, value);
    const close = vi.fn(); const sendMail = vi.fn().mockRejectedValue(new Error('private-test-value'));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, close } as unknown as ReturnType<typeof nodemailer.createTransport>);
    await expect(sendAuthEmail('dummy@example.invalid', 'https://example.invalid/verify', 'verify')).rejects.toThrow('Email delivery is unavailable');
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, tls: { rejectUnauthorized: true } }));
    expect(close).toHaveBeenCalledOnce();
  });
});
