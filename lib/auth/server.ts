import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet } from 'jose';
import { logAuthFailure, type AuthFailurePhase } from '@/lib/auth/diagnostics';
import { headers } from 'next/headers';
import { getBetterAuthSession, getWebsiteDatabaseToken } from '@/lib/auth/better-auth';
import { betterAuthConfiguration } from '@/lib/auth/better-auth-config';
import { createAuth0TokenVerifier, Auth0TokenVerificationError } from '@/lib/auth/auth0-token';
import { getAdminSupabase } from '@/lib/auth/admin';
import { parseResolvedIdentity, verifiedEmailDigest } from '@/lib/auth/identity';

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie, Authorization' };
export class AuthenticationError extends Error {
  constructor(public readonly status = 401, message = 'Authentication required',
    public readonly code: 'invalid_token' | 'token_expired' | 'authorization_revoked' | 'forbidden' | 'auth_unavailable' =
      status === 503 ? 'auth_unavailable' : status === 403 ? 'forbidden' : 'invalid_token') { super(message); }
}
export type Principal = {
  userId: string; portfolioSync: boolean; scopes: readonly string[]; clientId: string; issuedAt: number; expiresAt: number;
  kind: 'web' | 'mcp'; accessToken: string; supabase: SupabaseClient;
  /** Provider identity is used for session checks; userId is the canonical portfolio owner. */
  rawSubject: string; issuer: string; identityVersion: number; authSessionCreatedAt?: number; authSessionId?: string;
  accountEmail?: string; accountName?: string;
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

export function authenticationConfiguration() {
  try {
    const { issuer, websiteAudience, mcpAudience, websiteClientId, mcpClientId } = betterAuthConfiguration();
    return { issuer, websiteAudience, mcpAudience, websiteClientId, mcpClientId };
  } catch { throw new AuthenticationError(503, 'Authentication is not configured'); }
}

async function verifyToken(token: string, kind: 'web' | 'mcp'): Promise<Principal> {
  const config = authenticationConfiguration();
  const key = JSON.stringify(config);
  if (!verifierCache || verifierCache.key !== key) {
    verifierCache = { key, verify: createAuth0TokenVerifier({ ...config, requireLiveSessionEvidence: true,
      companionAudience: `${config.issuer}/oauth2/userinfo`, jwks: createRemoteJWKSet(new URL(`${config.issuer}/jwks`)) }) };
  }
  let identity;
  try { identity = await verifierCache.verify(token, kind); }
  catch (error) {
    if (error instanceof Auth0TokenVerificationError) throw new AuthenticationError(401, 'Authentication required', error.reason);
    logAuthFailure('token-verification', error);
    throw new AuthenticationError(503, 'Authentication is temporarily unavailable');
  }
  const rawSubject = identity.userId;
  const live = await getAdminSupabase().rpc('server_better_auth_token_valid', {
    p_subject: rawSubject, p_session_id: identity.authSessionId, p_client_id: identity.clientId,
    p_grant_id: identity.grantId ?? null,
  });
  if (live.error) { logAuthFailure('account-storage', live.error); throw new AuthenticationError(503, 'Account storage is not ready'); }
  if (live.data !== true) throw new AuthenticationError(401, 'Sign in again to access this account', 'authorization_revoked');
  const resolved = await getAdminSupabase().rpc('server_identity_resolve', {
    p_issuer: config.issuer, p_subject: rawSubject,
    p_email_hash: verifiedEmailDigest(config.issuer, identity.verifiedEmail),
    p_auth_session_created_at: identity.authSessionCreatedAt ?? null,
  });
  if (resolved.error) { logAuthFailure('account-storage', resolved.error); throw new AuthenticationError(503, 'Account storage is not ready'); }
  const owner = parseResolvedIdentity(resolved.data, rawSubject);
  if (!owner) throw new AuthenticationError(503, 'Account storage is not ready');
  if (owner.state !== 'active') throw new AuthenticationError(401, 'Sign in again to access this account', 'authorization_revoked');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) throw new AuthenticationError(503, 'Database is not configured');
  const supabase = createClient(url, publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { ...identity, userId: owner.profile_id, rawSubject, issuer: config.issuer,
    identityVersion: owner.identity_version, accessToken: token, supabase };
}

export async function requireWebPrincipal(): Promise<Principal> {
  let phase: AuthFailurePhase = 'configuration';
  try {
    authenticationConfiguration();
    phase = 'session';
    const requestHeaders = new Headers(await headers());
    const existing = await getBetterAuthSession(requestHeaders);
    if (!existing?.user?.id) throw new AuthenticationError();
    if (existing.user.emailVerified !== true) throw new AuthenticationError(403, 'Verify your email before continuing');
    phase = 'website-token';
    const { token, session } = await getWebsiteDatabaseToken(requestHeaders);
    phase = 'token-verification';
    const principal = await verifyToken(token, 'web');
    if (principal.rawSubject !== session.user.id || principal.authSessionId !== session.session.id
      || principal.authSessionCreatedAt !== Math.floor(new Date(session.session.createdAt).getTime() / 1000)) throw new AuthenticationError();
    return { ...principal, accountEmail: session.user.email, accountName: session.user.name };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    logAuthFailure(phase, error);
    throw new AuthenticationError(503, 'Authentication is temporarily unavailable');
  }
}

export async function bootstrapWebAccount(principal: Principal): Promise<void> {
  if (principal.kind !== 'web') throw new AuthenticationError(403);
  const result = await getAdminSupabase().rpc('server_bootstrap_web_account', {
    p_issuer: principal.issuer, p_subject: principal.rawSubject,
    p_auth_session_created_at: principal.authSessionCreatedAt ?? null,
  });
  const identity = parseResolvedIdentity(result.data, principal.rawSubject);
  if (result.error || !identity) throw new AuthenticationError(503, 'Account storage is not ready');
  if (identity.state !== 'active' || identity.profile_id !== principal.userId || identity.identity_version !== principal.identityVersion) {
    throw new AuthenticationError(401, 'Sign in again to access this account');
  }
}

export async function requireMcpPrincipal(request: Request): Promise<Principal> {
  const bearer = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!bearer) throw new AuthenticationError();
  const principal = await verifyToken(bearer[1], 'mcp');
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('server_mcp_connection', {
    p_user_id: principal.userId, p_action: 'bootstrap', p_valid_after: principal.issuedAt,
  });
  if (error) throw new AuthenticationError(503, 'Connection storage is not ready');
  if (!data?.enabled || principal.issuedAt <= Number(data.valid_after)) throw new AuthenticationError(401, 'Reconnect LiveStocks from account settings', 'authorization_revoked');
  return principal;
}

export async function requireApiPrincipal(request?: Request): Promise<Principal> {
  // Invalid bearer credentials must never silently fall back to another cookie account.
  return request?.headers.has('authorization') ? requireMcpPrincipal(request) : requireWebPrincipal();
}

export function authenticationResponse(error: unknown): Response | null {
  return error instanceof AuthenticationError
    ? Response.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS }) : null;
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_BASE_URL;
  if (!expected || !origin || origin !== new URL(expected).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AuthenticationError(403, 'Request origin is not allowed');
  }
}
