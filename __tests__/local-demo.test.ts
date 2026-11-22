// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hasLocalDemoSession, demoApiResponse } from '@/lib/demo/server';
import { POST, DELETE } from '@/app/api/local-demo/route';
import { demoDashboard } from '@/lib/demo/data';

afterEach(() => vi.unstubAllEnvs());
const request = (url: string, method = 'GET', origin?: string) => new NextRequest(url, { method, headers: { cookie: 'livestocks-local-demo=1', ...(origin ? { origin } : {}) } });
describe('isolated local demo', () => {
  it('never accepts the demo cookie in production or on non-loopback hosts', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(hasLocalDemoSession(request('http://localhost:3001/'))).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    expect(hasLocalDemoSession(request('https://livestocks.example/'))).toBe(false);
    expect(hasLocalDemoSession(request('http://localhost:3001/'))).toBe(true);
  });
  it('requires an explicit same-origin local action and expires demo access on sign-out', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect((await POST(request('http://localhost:3001/api/local-demo', 'POST', 'https://foreign.example'))).status).toBe(403);
    const response = await POST(request('http://localhost:3001/api/local-demo', 'POST', 'http://localhost:3001'));
    expect(response.cookies.get('livestocks-local-demo')?.value).toBe('1');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect((await DELETE(request('http://localhost:3001/api/local-demo', 'DELETE', 'http://localhost:3001'))).cookies.get('livestocks-local-demo')?.value).toBe('');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await POST(request('http://localhost:3001/api/local-demo', 'POST', 'http://localhost:3001'))).status).toBe(404);
  });
  it('accepts numeric loopback authority normalized by Next while keeping host, port and origin paired', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const action = (host: string, origin: string, site = 'same-origin') => POST(new NextRequest('http://localhost:3983/api/local-demo', {
      method: 'POST', headers: { host, origin, 'sec-fetch-site': site },
    }));
    expect((await action('127.0.0.1:3983', 'http://127.0.0.1:3983')).ok).toBe(true);
    expect((await action('[::1]:3983', 'http://[::1]:3983')).ok).toBe(true);
    expect((await action('127.0.0.1:3983', 'http://localhost:3983')).status).toBe(403);
    expect((await action('127.0.0.1:3983', 'http://127.0.0.1:3984')).status).toBe(403);
    expect((await action('127.0.0.1:3983', 'http://127.0.0.1:3983','cross-site')).status).toBe(403);
    expect((await action('foreign.example:3983', 'http://foreign.example:3983')).status).toBe(404);
  });
  it('serves synthetic asset lookup and price suggestions without an external provider', async () => {
    const assets = await demoApiResponse(request('http://localhost:3001/api/assets?q=Tesla')).json();
    expect(assets.results).toContainEqual({ symbol: 'TSLA', display: 'Tesla', imageUrl: '' });
    const quote = await demoApiResponse(request('http://localhost:3001/api/quote?symbol=TSLA')).json();
    expect(quote.c).toBe(260);
    expect(demoApiResponse(request('http://localhost:3001/api/quote?symbol=UNKNOWN')).status).toBe(404);
  });
  it('returns only synthetic portfolio rows and rejects all write/token endpoints', async () => {
    const dashboard = demoDashboard();
    expect(dashboard.positions).toHaveLength(3);
    expect(dashboard.quotes.AAPL.c).toBe(212);
    for (const path of ['/api/account/database-token', '/api/mcp', '/api/account/oauth/consent']) {
      expect(demoApiResponse(request(`http://localhost:3001${path}`)).status).toBe(403);
    }
    for (const method of ['POST', 'PATCH', 'DELETE']) for (const table of ['positions', 'settings']) {
      const response = demoApiResponse(request(`http://localhost:3001/api/local-demo/rest/v1/${table}`, method));
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('DEMO_READ_ONLY');
    }
    const rows = await demoApiResponse(request('http://localhost:3001/api/local-demo/rest/v1/investment_sources')).json();
    expect(rows[0].name).toBe('תיק הדגמה');
  });
});
