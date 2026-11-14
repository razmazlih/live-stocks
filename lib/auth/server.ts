import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet } from 'jose';
import { getAuth0 } from '@/lib/auth/auth0';
import { createAuth0TokenVerifier } from '@/lib/auth/auth0-token';
import { getAdminSupabase } from '@/lib/auth/admin';

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie, Authorization' };
export class AuthenticationError extends Error {
  constructor(public readonly status = 401, message = 'Authentication required') { super(message); }
}
export type Principal = {
  userId: string; clientId: string; issuedAt: number; expiresAt: number;
  kind: 'web' | 'mcp'; accessToken: string; supabase: SupabaseClient;
};

let verifierCache: { key: string; verify: ReturnType<typeof createAuth0TokenVerifier> } | undefined;
export function auth0Configuration() {
  const domain = process.env.AUTH0_DOMAIN;
  const websiteClientId = process.env.AUTH0_CLIENT_ID;
  const mcpClientId = process.env.AUTH0_MCP_CLIENT_ID;
  const websiteAudience = process.env.AUTH0_WEB_AUDIENCE;
  const mcpAudience = process.env.AUTH0_MCP_AUDIENCE;
  if (!domain || !websiteClientId || !mcpClientId || !websiteAudience || !mcpAudience) {
    throw new AuthenticationError(503, 'Authentication is not configured');
  }
  const issuer = new URL(domain.startsWith('https://') ? domain : `https://${domain}`);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/') {
    throw new AuthenticationError(503, 'Authentication is not configured');
  }
  return { issuer: issuer.href, websiteClientId, mcpClientId, websiteAudience, mcpAudience };
}

async function verifyToken(token: string, kind: 'web' | 'mcp'): Promise<Principal> {
  const config = auth0Configuration();
  const key = JSON.stringify(config);
  if (!verifierCache || verifierCache.key !== key) {
    verifierCache = { key, verify: createAuth0TokenVerifier({ ...config, jwks: createRemoteJWKSet(new URL('.well-known/jwks.json', config.issuer)) }) };
  }
  let identity;
  try { identity = await verifierCache.verify(token, kind); }
  catch { throw new AuthenticationError(); }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) throw new AuthenticationError(503, 'Database is not configured');
  const supabase = createClient(url, publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { ...identity, accessToken: token, supabase };
}

export async function requireWebPrincipal(): Promise<Principal> {
  const auth0 = getAuth0();
  if (!auth0) throw new AuthenticationError(503, 'Authentication is not configured');
  try {
    const session = await auth0.getSession();
    if (!session?.user?.sub) throw new AuthenticationError();
    if (session.user.email_verified !== true) throw new AuthenticationError(403, 'Verify your email before continuing');
    const { token } = await auth0.getAccessToken();
    const principal = await verifyToken(token, 'web');
    if (principal.userId !== session.user.sub) throw new AuthenticationError();
    return principal;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError();
  }
}

export async function bootstrapWebAccount(principal: Principal): Promise<void> {
  if (principal.kind !== 'web') throw new AuthenticationError(403);
  const profile = await principal.supabase.from('user_profiles').upsert({ id: principal.userId }, { onConflict: 'id', ignoreDuplicates: true });
  if (profile.error) throw new AuthenticationError(503, 'Account storage is not ready');
  const settings = await principal.supabase.from('settings').upsert({ user_id: principal.userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (settings.error) throw new AuthenticationError(503, 'Account storage is not ready');
}

export async function requireMcpPrincipal(request: Request): Promise<Principal> {
  const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!bearer) throw new AuthenticationError();
  const principal = await verifyToken(bearer[1], 'mcp');
  const admin = getAdminSupabase();
  const profile = await admin.from('user_profiles').upsert({ id: principal.userId }, { onConflict: 'id', ignoreDuplicates: true });
  if (profile.error) throw new AuthenticationError(503, 'Account storage is not ready');
  const { data, error } = await admin.rpc('server_mcp_connection', {
    p_user_id: principal.userId, p_action: 'bootstrap', p_valid_after: principal.issuedAt,
  });
  if (error) throw new AuthenticationError(503, 'Connection storage is not ready');
  if (!data?.enabled || principal.issuedAt <= Number(data.valid_after)) throw new AuthenticationError(401, 'Reconnect LiveStocks from account settings');
  return principal;
}

export async function requireApiPrincipal(request?: Request): Promise<Principal> {
  // Invalid bearer credentials must never silently fall back to another cookie account.
  return request?.headers.has('authorization') ? requireMcpPrincipal(request) : requireWebPrincipal();
}

export function authenticationResponse(error: unknown): Response | null {
  return error instanceof AuthenticationError
    ? Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_HEADERS }) : null;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_BASE_URL;
  if (!expected || !origin || origin !== new URL(expected).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AuthenticationError(403, 'Request origin is not allowed');
  }
}
