// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { getAuth0 } = vi.hoisted(() => ({ getAuth0: vi.fn() }));
vi.mock('@/lib/auth/auth0', () => ({ getAuth0 }));
import { proxy } from '@/proxy';
import { getPublicPublisher } from '@/lib/public-publisher';

describe('public information route boundary', () => {
  beforeEach(() => {
    getAuth0.mockReset().mockReturnValue(null);
    vi.stubEnv('PUBLISHER_NAME', 'Example Operator');
    vi.stubEnv('PUBLIC_SUPPORT_EMAIL', 'support@example.test');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['/about', '/privacy', '/terms'])('allows anonymous %s without invoking authentication', async (path) => {
    const response = await proxy(new NextRequest(`https://portfolio.example${path}?lang=en`));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(getAuth0).not.toHaveBeenCalled();
  });

  it.each(['PUBLISHER_NAME', 'PUBLIC_SUPPORT_EMAIL'])('returns 503 if approved %s is absent', async (name) => {
    vi.stubEnv(name, '');
    const response = await proxy(new NextRequest('https://portfolio.example/privacy'));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(await response.text()).not.toContain('support@example.test');
    expect(getAuth0).not.toHaveBeenCalled();
  });

  it.each(['/settings', '/portfolio', '/privacy/export', '/about-private'])('keeps %s behind sign-in', async (path) => {
    const response = await proxy(new NextRequest(`https://portfolio.example${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://portfolio.example/sign-in');
  });

  it('still verifies configured sessions for private pages', async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    getAuth0.mockReturnValue({ middleware: vi.fn().mockResolvedValue(NextResponse.next()), getSession });
    const response = await proxy(new NextRequest('https://portfolio.example/settings'));
    expect(getSession).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('Location')!).searchParams.get('returnTo')).toBe('/settings');
  });

  it('does not infer public contact details from identity-provider environment variables', () => {
    vi.stubEnv('PUBLIC_SUPPORT_EMAIL', '');
    vi.stubEnv('AUTH0_SUPPORT_EMAIL', 'private@example.test');
    expect(getPublicPublisher()).toBeNull();
  });

  it.each(['support@example.test?subject=unapproved', 'support@example.test\r\nBcc:other@example.test'])('rejects invalid public email configuration', (email) => {
    for (const value of [email, 'support?subject=unapproved@example.test', 'support%3Fsubject@example.test']) {
      vi.stubEnv('PUBLIC_SUPPORT_EMAIL', value);
      expect(getPublicPublisher()).toBeNull();
    }
  });
});
