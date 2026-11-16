/** Strict allowlist-only auth observations for the disposable host fixture. */
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
const scopes = new Set(['openid', 'email', 'profile', 'offline_access', 'portfolio:read', 'portfolio:sync']);
const methods = new Set(['initialize', 'server/discover', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'resources/templates/list', 'ping']);
const tools = new Set(['get_profile', 'get_portfolio_snapshot', 'prepare_screenshot_sync', 'review_screenshot_sync', 'confirm_screenshot_sync', 'cancel_screenshot_sync']);
const versions = new Set(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
const scopeNames = value => typeof value === 'string' ? [...new Set(value.split(' ').filter(name => scopes.has(name)))].sort() : [];
export function authTrace({ productionAccess, requestUrl, rpc, protocol, status, headers, body, requestBody = Buffer.alloc(0) }) {
  if (productionAccess !== false) throw Error('Auth tracing is isolated-fixture only');
  const url = new URL(requestUrl, 'https://isolated.invalid');
  const path = url.pathname;
  if (!['/api/auth/oauth2/authorize', '/api/auth/oauth2/token', '/api/account/oauth/consent', '/api/mcp', '/.well-known/oauth-protected-resource'].includes(path)) return null;
  const observation = { at: new Date().toISOString(), path, status };
  if (path.endsWith('/authorize')) observation.requestedScopes = scopeNames(url.searchParams.get('scope'));
  if (rpc && path === '/api/mcp') {
    if (methods.has(rpc.method)) observation.method = rpc.method;
    if (tools.has(rpc.params?.name)) observation.tool = rpc.params.name;
    const revision = protocol ?? rpc.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    if (versions.has(revision)) observation.protocol = revision;
  }
  let data;
  try {
    const encoding = String(headers['content-encoding'] || '').toLowerCase();
    const decoded = encoding === 'gzip' ? gunzipSync(body) : encoding === 'br' ? brotliDecompressSync(body) : encoding === 'deflate' ? inflateSync(body) : body;
    data = JSON.parse(decoded.toString('utf8'));
  } catch { /* Non-JSON responses contain nothing this trace needs. */ }
  if (path.endsWith('/token')) {
    observation.issuedScopes = scopeNames(data?.scope);
    // Read one standard enum from the form, never copy or retain its credentials.
    const grantType = new URLSearchParams(requestBody?.toString('utf8')).get('grant_type');
    if (['authorization_code', 'refresh_token'].includes(grantType)) observation.grantType = grantType;
  }
  const rawChallenge = headers['www-authenticate'] ?? data?.result?._meta?.['mcp/www_authenticate']?.[0];
  if (typeof rawChallenge === 'string') {
    const error = /(?:^|[, ])error="([^"]+)"/.exec(rawChallenge)?.[1];
    if (['invalid_token', 'insufficient_scope', 'invalid_request'].includes(error)) observation.challengeError = error;
    observation.challengeScopes = scopeNames(/(?:^|[, ])scope="([^"]+)"/.exec(rawChallenge)?.[1]);
  }
  return observation;
}
