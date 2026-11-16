import 'server-only';
import { auth0Configuration } from '@/lib/auth/server';

let cached: { token: string; expiresAt: number; key: string } | undefined;
async function managementToken(): Promise<string> {
  const { issuer } = auth0Configuration();
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Connection management is not configured');
  const key = `${issuer}:${clientId}`;
  if (cached?.key === key && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const response = await fetch(new URL('oauth/token', issuer), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
      audience: new URL('api/v2/', issuer).href, scope: 'read:grants delete:grants' }),
  });
  if (!response.ok) throw new Error('Connection management is unavailable');
  const data = await response.json();
  if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in)) throw new Error('Connection management is unavailable');
  cached = { key, token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

/** Grant deletion removes consent and its refresh tokens; signed JWTs need the DB cutoff too. */
export async function revokeMcpGrants(userId: string): Promise<void> {
  const { issuer, mcpClientId, mcpAudience } = auth0Configuration();
  const token = await managementToken();
  const ids: string[] = [];
  for (let page = 0; ; page++) {
    if (page > 100) throw new Error('Too many connections to revoke safely');
    const url = new URL('api/v2/grants', issuer);
    url.search = new URLSearchParams({ user_id: userId, client_id: mcpClientId, audience: mcpAudience,
      page: String(page), per_page: '100', include_totals: 'true' }).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Could not inspect connected applications');
    const data = await response.json();
    const grants = Array.isArray(data) ? data : data.grants;
    if (!Array.isArray(grants)) throw new Error('Could not inspect connected applications');
    for (const grant of grants) {
      if (grant.user_id === userId && (grant.clientID ?? grant.client_id) === mcpClientId && grant.audience === mcpAudience && typeof grant.id === 'string') ids.push(grant.id);
    }
    if (grants.length < 100) break;
  }
  for (const id of ids) {
    const response = await fetch(new URL(`api/v2/grants/${encodeURIComponent(id)}`, issuer), {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) throw new Error('Could not revoke all connected application grants');
  }
}
