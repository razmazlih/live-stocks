// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const redirected = vi.hoisted(() => vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }));
vi.mock('next/navigation', () => ({ redirect: redirected }));
vi.mock('@/components/auth/sign-in', () => ({ SignIn: () => null }));
import { AuthPage } from '@/components/auth/auth-page';
import { POST as passwordPost } from '@/app/api/account/sign-in-methods/password/route';
import { POST as googlePost } from '@/app/api/account/sign-in-methods/google/route';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('Google-only launch boundary', () => {
  it.each(['sign-up', 'forgot-password', 'reset-password', 'verify-email'] as const)('redirects %s without exposing email/password forms or reset tokens', async mode => {
    vi.stubEnv('PASSWORD_AUTH_ENABLED', 'false');
    await expect(AuthPage({ mode, searchParams: Promise.resolve({ token: 'secret-reset-token', lang: 'en', returnTo: '/settings' }) })).rejects.toThrow('REDIRECT:/sign-in?');
    const path = redirected.mock.calls[0][0];
    expect(path).not.toContain('secret-reset-token');
    expect(new URL(path, 'https://example.invalid').searchParams.get('returnTo')).toBe('/settings');
  });
  it('preserves the provider-signed continuation when redirecting a disabled auth page', async () => {
    vi.stubEnv('PASSWORD_AUTH_ENABLED', 'false');
    await expect(AuthPage({ mode: 'sign-up', searchParams: Promise.resolve({ sig: 'signed-proof', ba_param: ['client_id', 'resource'], client_id: 'client', resource: 'https://example.invalid/api/mcp', token: 'discard' }) })).rejects.toThrow('REDIRECT:');
    const params = new URL(redirected.mock.calls[0][0], 'https://example.invalid').searchParams;
    expect(params.get('sig')).toBe('signed-proof'); expect(params.getAll('ba_param')).toEqual(['client_id', 'resource']);
    expect(params.get('client_id')).toBe('client'); expect(params.get('token')).toBeNull();
  });
  it('blocks both method-add endpoints before reading session or body with no flag configured', async () => {
    vi.stubEnv('PASSWORD_AUTH_ENABLED', '');
    const request = new Request('https://example.invalid/api/account/sign-in-methods/password', { method: 'POST' });
    expect((await passwordPost(request)).status).toBe(404);
    expect((await googlePost(request)).status).toBe(404);
  });
});
