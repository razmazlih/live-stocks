import 'server-only';
import { isPasswordAuthEnabled, isPasswordAuthPath } from './better-auth-config';
import { betterAuthConfiguration, getBetterAuth, MCP_ALLOWED_SCOPES } from './better-auth';

const OAUTH_SERVER_POSTS = new Set(['/oauth2/token', '/oauth2/introspect', '/oauth2/revoke']);
// Exact allowlists only: even error names/codes may contain credential material.
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'APIError', 'DatabaseError', 'error', 'BetterAuthError', 'ZodError', 'AggregateError']);
const SQL_CODES = new Set(['08000', '08001', '08003', '08004', '08006', '08007', '08P01', '22001', '22023', '22P02', '23502', '23503', '23505', '23514', '28000', '28P01', '3D000', '3F000', '40001', '40P01', '42501', '42601', '42703', '42883', '42P01', '53300', '53400', '55000', '57014', '57P01', '57P02', '57P03', '0A000', '25006', '25P02', '26000', '53000', '53100', '53200', 'XX000']);
const NODE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ERR_INVALID_URL', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_REQUIRE_ESM', 'ERR_CRYPTO_INVALID_KEYLEN', 'ERR_CRYPTO_INVALID_IV', 'ERR_OSSL_EVP_UNSUPPORTED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_SIGNATURE_FAILURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
type AuthFailurePhase = 'configuration' | 'initialization' | 'request';

function safeErrorFields(error: unknown): { name: string; category: string; code: string } {
  // Never pass through error objects, messages, stacks, URLs or unrecognized strings.
  let name: unknown, code: unknown;
  try {
    if (error && typeof error === 'object') {
      name = (error as { name?: unknown }).name;
      code = (error as { code?: unknown }).code;
    }
  } catch { /* Untrusted getters are not diagnostic data. */ }
  const safeName = typeof name === 'string' && ERROR_NAMES.has(name) ? name : 'UnknownError';
  if (typeof code === 'string' && SQL_CODES.has(code)) return { name: safeName, category: 'postgres', code };
  if (typeof code === 'string' && NODE_CODES.has(code)) return { name: safeName, category: code.includes('CERT') || code.startsWith('ERR_TLS_') || code.startsWith('UNABLE_TO_') ? 'tls' : 'node', code };
  return { name: safeName, category: 'unknown', code: 'UNRECOGNIZED' };
}

function logAuthFailure(phase: AuthFailurePhase, error: unknown) {
  let cause: unknown;
  try { if (error && typeof error === 'object') cause = (error as { cause?: unknown }).cause; } catch { /* Ignore unsafe accessors. */ }
  console.error('Authentication request failed', { phase, error: safeErrorFields(error), ...(cause === undefined ? {} : { cause: safeErrorFields(cause) }) });
}

const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

/** Keep the provider's OAuth protocol checks; add this application's narrower client/resource policy. */
export function validateAuthRequest(request: Request, config: { origin: string; issuer: string; mcpClientId: string; mcpAudience: string }): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.slice('/api/auth'.length);
  if (!isPasswordAuthEnabled() && isPasswordAuthPath(path)) return Response.json({ code: 'NOT_FOUND' }, { status: 404, headers: PRIVATE });
  if (path === '/oauth2/authorize') {
    if (request.method !== 'GET') return Response.json({ error: 'invalid_request' }, { status: 405, headers: PRIVATE });
    const resources = url.searchParams.getAll('resource');
    // Never let omitted scopes fall back to all scopes permitted on the client.
    const scopeValues = url.searchParams.getAll('scope');
    const scopes = scopeValues[0]?.split(/\s+/).filter(Boolean) ?? [];
    if (scopeValues.length !== 1 || !scopes.includes('portfolio:read') || scopes.some(scope => !(MCP_ALLOWED_SCOPES as readonly string[]).includes(scope))) {
      return Response.json({ error: 'invalid_scope' }, { status: 400, headers: PRIVATE });
    }
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
  let phase: AuthFailurePhase = 'configuration';
  try {
    const config = betterAuthConfiguration();
    const rejected = validateAuthRequest(request, config);
    if (rejected) return rejected;
    phase = 'initialization';
    const auth = getBetterAuth();
    if (!auth) return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503, headers: PRIVATE });
    await auth.$context;
    phase = 'request';
    const response = await auth.handler(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    logAuthFailure(phase, error);
    return Response.json({ code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable' }, { status: 503, headers: PRIVATE });
  }
}
