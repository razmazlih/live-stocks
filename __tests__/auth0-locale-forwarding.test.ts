// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextRequest } from 'next/server';

describe('Auth0 SDK locale forwarding', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['he', 'en'])('passes %s through the actual login route for login and signup', async (locale) => {
    const issuer = 'https://locale-test.auth0.com/';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      issuer, authorization_endpoint: `${issuer}authorize`, token_endpoint: `${issuer}oauth/token`, jwks_uri: `${issuer}.well-known/jwks.json`,
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    }), { headers: { 'Content-Type': 'application/json' } })));
    const client = new Auth0Client({ domain: 'locale-test.auth0.com', clientId: 'synthetic-client', clientSecret: 'synthetic-secret', secret: 'a'.repeat(64),
      appBaseUrl: 'https://portfolio.example', authorizationParameters: { audience: 'https://portfolio.example/api/web', scope: 'openid profile email', ui_locales: 'he' } });
    for (const signup of [false, true]) {
      const response = await client.middleware(new NextRequest(`https://portfolio.example/auth/login?ui_locales=${locale}&returnTo=%2Fpositions${signup ? '&screen_hint=signup' : ''}`));
      expect(response.status).toBe(307);
      const redirect = new URL(response.headers.get('Location')!);
      expect(redirect.origin).toBe('https://locale-test.auth0.com');
      expect(redirect.searchParams.get('ui_locales')).toBe(locale);
      expect(redirect.searchParams.get('screen_hint')).toBe(signup ? 'signup' : null);
      expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
      expect(redirect.searchParams.has('returnTo')).toBe(false);
    }
  });
});
