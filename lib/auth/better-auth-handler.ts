import 'server-only';
import { isPasswordAuthEnabled, isPasswordAuthPath } from './better-auth-config';
import { betterAuthConfiguration, getBetterAuth } from './better-auth';

const OAUTH_SERVER_POSTS = new Set(['/oauth2/token', '/oauth2/introspect', '/oauth2/revoke']);
const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

/** Keep the provider's OAuth protocol checks; add this application's narrower client/resource policy. */
export function validateAuthRequest(request: Request, config: { origin: string; issuer: string; mcpClientId: string; mcpAudience: string }): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.slice('/api/auth'.length);
  if (!isPasswordAuthEnabled() && isPasswordAuthPath(path)) return Response.json({ code: 'NOT_FOUND' }, { status: 404, headers: PRIVATE });
  if (path === '/oauth2/authorize') {
    if (request.method !== 'GET') return Response.json({ error: 'invalid_request' }, { status: 405, headers: PRIVATE });
    const resources = url.searchParams.getAll('resource');
    if (url.searchParams.getAll('client_id').length !== 1 || url.searchParams.get('client_id') !== config.mcpClientId) {
      return Response.json({ error: 'invalid_client' }, { status: 400, headers: PRIVATE });
    }
    if (resources.length !== 1 || resources[0] !== config.mcpAudience
      || (url.searchParams.has('audience') && url.searchParams.get('audience') !== config.mcpAudience)) {
      return Response.json({ error: 'invalid_target' }, { status: 400, headers: PRIVATE });
    }
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !OAUTH_SERVER_POSTS.has(path)) {
    if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return Response.json({ code: 'INVALID_ORIGIN', message: 'Request origin is not allowed' }, { status: 403, headers: PRIVATE });
    }
  }
  return null;
}

export async function handleBetterAuthRequest(request: Request): Promise<Response> {
  try {
    const config = betterAuthConfiguration();
    const rejected = validateAuthRequest(request, config);
    if (rejected) return rejected;
    const auth = getBetterAuth();
    if (!auth) return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503, headers: PRIVATE });
    const response = await auth.handler(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return Response.json({ code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable' }, { status: 503, headers: PRIVATE });
  }
}
