import { describe, expect, it } from 'vitest';
import { authTrace } from '../scripts/lib/chat-sync-auth-trace.mjs';
describe('isolated OAuth gateway trace', () => {
  it('records only known scopes and protocol fields, never credentials, identity or arguments', () => {
    const observation = authTrace({ productionAccess: false,
      requestUrl: '/api/auth/oauth2/token?code=secret-code&state=secret-state',
      rpc: { method: 'tools/call', params: { name: 'prepare_screenshot_sync', arguments: { secret: 'secret-input' } } },
      protocol: '2026-07-28', status: 200,
      headers: { 'set-cookie': 'secret-cookie', 'www-authenticate': 'Bearer error="insufficient_scope", scope="portfolio:read portfolio:sync secret-scope", error_description="secret-description"' },
      body: Buffer.from(JSON.stringify({ scope: 'portfolio:read portfolio:sync secret-scope', access_token: 'secret-token', refresh_token: 'secret-refresh', sub: 'secret-user' })),
    });
    expect(observation).toMatchObject({ path: '/api/auth/oauth2/token', issuedScopes: ['portfolio:read', 'portfolio:sync'], challengeError: 'insufficient_scope', challengeScopes: ['portfolio:read', 'portfolio:sync'] });
    expect(JSON.stringify(observation)).not.toContain('secret');
    expect(observation).not.toHaveProperty('method');
  });
  it('refuses production tracing and ignores unrelated URLs and unrecognized fields', () => {
    const base = { productionAccess: false, requestUrl: '/api/mcp', rpc: null, protocol: undefined, status: 200, headers: {}, body: Buffer.from('{}') };
    expect(() => authTrace({ ...base, productionAccess: true })).toThrow('isolated-fixture only');
    expect(authTrace({ ...base, requestUrl: '/private-account/secret-id' })).toBeNull();
    const observation = authTrace({ productionAccess: false, requestUrl: '/api/mcp', rpc: { method: 'secret-method', params: { name: 'secret-tool' } }, protocol: 'secret-version', headers: {}, body: Buffer.from('{}'), status: 200 });
    expect(JSON.stringify(observation)).not.toContain('secret');
  });
});
