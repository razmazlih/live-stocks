import { afterEach, describe, expect, it, vi } from 'vitest';
import { maintenanceResponse } from '@/lib/maintenance';

afterEach(() => vi.unstubAllEnvs());
describe('issuer preparation maintenance gate', () => {
  it('does not change ordinary deployments', () => {
    vi.stubEnv('LIVESTOCKS_MAINTENANCE', 'false');
    expect(maintenanceResponse(new Request('https://example.com/api/portfolio'))).toBeNull();
  });
  it('allows only read-only discovery, public information and static assets', () => {
    vi.stubEnv('LIVESTOCKS_MAINTENANCE', 'true');
    for (const path of ['/api/auth/jwks', '/api/auth/.well-known/openid-configuration', '/.well-known/oauth-authorization-server/api/auth', '/privacy', '/_next/static/chunk.js']) {
      expect(maintenanceResponse(new Request(`https://example.com${path}`))).toBeNull();
      expect(maintenanceResponse(new Request(`https://example.com${path}`, { method: 'POST' }))?.status).toBe(503);
    }
  });
  it('blocks data, login, signup and unknown discovery paths without caching', async () => {
    vi.stubEnv('LIVESTOCKS_MAINTENANCE', 'true');
    for (const path of ['/', '/api/portfolio/ai?format=html', '/api/auth/sign-in/social', '/api/auth/sign-up/email', '/api/account/session', '/api/mcp', '/api/auth/jwks/extra', '/.well-known/unknown']) {
      const response = maintenanceResponse(new Request(`https://example.com${path}`));
      expect(response?.status).toBe(503);
      expect(response?.headers.get('Cache-Control')).toContain('no-store');
      expect(response?.headers.get('Retry-After')).toBe('60');
      if (path.startsWith('/api/')) expect(await response?.json()).toEqual({ code: 'MAINTENANCE', message: 'LiveStocks is temporarily unavailable' });
    }
  });
});
