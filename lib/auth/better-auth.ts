import 'server-only';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { randomUUID } from 'node:crypto';
import { betterAuthConfiguration, getAuthPublicOptions, isPasswordAuthEnabled, PASSWORD_AUTH_PATHS, type BetterAuthConfiguration } from './better-auth-config';
import { requireAuthEmailConfiguration, sendAuthEmail } from './auth-email';
import { methodUserValidator } from './sign-in-method-guard';

export { betterAuthConfiguration, getAuthPublicOptions };
export const AUTH_SCHEMA = 'livestocks_auth';
export const AUTH_BACKEND_ROLE = 'livestocks_auth_backend';
export const AUTH_SCOPES = ['openid', 'email', 'profile', 'offline_access', 'portfolio:read'] as const;
/** Optional bookkeeping capabilities require an explicit request and fresh consent. */
export const MCP_SYNC_SCOPE = 'portfolio:sync' as const;
export const MCP_TRANSACTION_SCOPE = 'portfolio:transactions' as const;
export const MCP_OPTIONAL_SCOPES = [MCP_SYNC_SCOPE, MCP_TRANSACTION_SCOPE] as const;
export const MCP_ALLOWED_SCOPES = [...AUTH_SCOPES, ...MCP_OPTIONAL_SCOPES] as const;
export type McpScopeOptions = { enablePortfolioSync?: boolean; enablePortfolioTransactions?: boolean };
/** Operator ceilings are additive; changing them never edits a user's consent or tokens. */
export function mcpRegistrationScopes(current: readonly string[] = AUTH_SCOPES, options: McpScopeOptions = {}): string[] {
  const actual = [...current].sort();
  const known = [...AUTH_SCOPES, ...MCP_OPTIONAL_SCOPES.filter(scope => current.includes(scope))].sort();
  if (JSON.stringify(actual) !== JSON.stringify(known)) throw new Error('Existing MCP scope policy requires review');
  return [...AUTH_SCOPES, ...MCP_OPTIONAL_SCOPES.filter(scope => current.includes(scope)
    || (scope === MCP_SYNC_SCOPE && options.enablePortfolioSync === true)
    || (scope === MCP_TRANSACTION_SCOPE && options.enablePortfolioTransactions === true))];
}
const NAMESPACE = 'https://livestocks.app/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageError(): APIError {
  return new APIError('SERVICE_UNAVAILABLE', { code: 'AUTH_STORAGE_UNAVAILABLE', message: 'Authentication storage is unavailable' });
}
function deniedGrant(): APIError {
  return new APIError('BAD_REQUEST', { error: 'invalid_grant', error_description: 'An active verified LiveStocks session and approval are required' });
}

/** PostgreSQL credentials have rights only in the private authentication schema. */
export function createAuthPool(config: BetterAuthConfiguration): Pool {
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.has('options')) throw new Error('Invalid authentication database configuration');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (decodeURIComponent(url.username) !== AUTH_BACKEND_ROLE && !decodeURIComponent(url.username).startsWith(`${AUTH_BACKEND_ROLE}.`)) {
    throw new Error('Authentication requires its dedicated database role');
  }
  // pg connection-string SSL query options can replace explicit TLS options.
  // Remove them and enforce certificate validation here instead.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new Pool({ connectionString: url.href, max: 2, idleTimeoutMillis: 5_000, maxLifetimeSeconds: 60, allowExitOnIdle: true, connectionTimeoutMillis: 10_000,
    options: `-c search_path=${AUTH_SCHEMA} -c statement_timeout=15000`,
    ssl: local && process.env.NODE_ENV !== 'production' ? false
      : { rejectUnauthorized: true, ...(process.env.BETTER_AUTH_DATABASE_CA ? { ca: process.env.BETTER_AUTH_DATABASE_CA.replace(/\\n/g, '\n') } : {}) },
  });
  attachDatabasePool(pool);
  // pg removes a failed idle client before emitting this event. Without a
  // listener Node throws the error, which may contain the client/credentials.
  // Do not log it or retry active queries; those still reject to their caller.
  pool.on('error', () => {});
  return pool;
}

async function ensureApproval(pool: Pool, userId: string, sessionId: string, clientId: string): Promise<string> {
  try {
    const { rows } = await pool.query<{ id: string }>('select private.ensure_oauth_approval($1,$2,$3)::text as id', [userId, sessionId, clientId]);
    if (!rows[0]?.id || !UUID.test(rows[0].id)) throw deniedGrant();
    return rows[0].id;
  } catch (error) { if (error instanceof APIError) throw error; throw storageError(); }
}

export async function checkOAuthApproval(pool: Pool, id: string, userId: string, sessionId: string, clientId: string) {
  if (!UUID.test(id)) throw deniedGrant();
  let result;
  try {
    const { rows } = await pool.query<{ approval: { valid: boolean; auth_session_created_at: number; profile_id: string } }>(
      'select private.check_oauth_approval($1::uuid,$2,$3,$4) as approval', [id, userId, sessionId, clientId]);
    result = rows[0]?.approval;
  } catch { throw storageError(); }
  if (result?.valid !== true || !Number.isSafeInteger(Number(result.auth_session_created_at)) || Number(result.auth_session_created_at) <= 0) throw deniedGrant();
  return { ...result, auth_session_created_at: Number(result.auth_session_created_at) };
}

function providerOptions(config: BetterAuthConfiguration, pool: Pool, bootstrapUserId?: string) {
  return {
    loginPage: '/sign-in', consentPage: '/oauth/consent',
    scopes: [...MCP_ALLOWED_SCOPES], clientRegistrationDefaultScopes: [...AUTH_SCOPES], clientRegistrationAllowedScopes: [...MCP_OPTIONAL_SCOPES], grantTypes: ['authorization_code', 'refresh_token'] as ('authorization_code' | 'refresh_token')[],
    accessTokenExpiresIn: 300, refreshTokenExpiresIn: 7 * 24 * 60 * 60, codeExpiresIn: 120, refreshTokenReuseInterval: 0,
    allowDynamicClientRegistration: false, allowUnauthenticatedClientRegistration: false,
    allowInsecureRedirectUri: (url: URL) => process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.origin).hostname)
      && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    enforcePerClientResources: true,
    clientPrivileges: ({ user }: { user?: { id: string } }) => Boolean(bootstrapUserId && user?.id === bootstrapUserId),
    resourcePrivileges: ({ user }: { user?: { id: string } }) => Boolean(bootstrapUserId && user?.id === bootstrapUserId),
    generateClientId: () => config.mcpClientId,
    ...(bootstrapUserId ? { generateClientSecret: () => {
      const secret = process.env.BETTER_AUTH_MCP_CLIENT_SECRET;
      if (!secret || secret.length < 32) throw new Error('MCP client secret is not configured');
      return secret;
    } } : {}),
    resources: [{ identifier: config.mcpAudience, allowedScopes: [...MCP_ALLOWED_SCOPES], accessTokenTtl: 300, signingAlgorithm: 'ES256' as const }],
    postLogin: {
      page: '/oauth/consent', shouldRedirect: async () => false,
      consentReferenceId: async ({ user, session }: { user: { id: string; emailVerified: boolean }; session: { id: string } }) => {
        if (!user.emailVerified || !session.id) throw deniedGrant();
        return ensureApproval(pool, user.id, session.id, config.mcpClientId);
      },
    },
  };
}

/** A bootstrap instance is never exposed as an HTTP handler. */
export function createBetterAuth(config: BetterAuthConfiguration, pool: Pool, bootstrapUserId?: string) {
  return betterAuth({
    baseURL: config.origin, basePath: '/api/auth', secret: config.secret, database: pool,
    trustedOrigins: [config.origin], telemetry: { enabled: false }, logger: { disabled: true },
    user: { validateUserInfo: methodUserValidator(pool, config) },
    disabledPaths: ['/token', '/link-social', '/unlink-account', '/delete-user', '/set-password', '/verify-password', ...(!isPasswordAuthEnabled() ? [...PASSWORD_AUTH_PATHS, '/reset-password/:token'] : [])],
    emailAndPassword: { enabled: isPasswordAuthEnabled(), requireEmailVerification: true, autoSignIn: false, minPasswordLength: 8, maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendAuthEmail(user.email, url, 'reset'),
    },
    emailVerification: { sendOnSignUp: isPasswordAuthEnabled(), sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => sendAuthEmail(user.email, url, 'verify'),
    },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false } },
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 8 }, '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 }, '/send-verification-email': { window: 60, max: 3 } },
    },
    socialProviders: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
      google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        scope: ['openid', 'email', 'profile'], prompt: 'select_account' },
    } : {},
    hooks: { before: createAuthMiddleware(async ctx => {
      if (['/sign-up/email', '/send-verification-email', '/request-password-reset'].includes(ctx.path)) {
        try { requireAuthEmailConfiguration(); }
        catch { throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_DELIVERY_UNAVAILABLE', message: 'Email delivery is unavailable' }); }
      }
    }) },
    plugins: [
      jwt({ disableSettingJwtHeader: true, jwks: { keyPairConfig: { alg: 'ES256' }, gracePeriod: 30 * 24 * 60 * 60 }, jwt: { issuer: config.issuer } }),
      oauthProvider({ ...providerOptions(config, pool, bootstrapUserId),
        extensions: [{ claims: { accessToken: async ({ client, user, sessionId, referenceId, resources, scopes }) => {
          if (client.clientId !== config.mcpClientId || !user?.emailVerified || !sessionId || !referenceId
            || !resources?.includes(config.mcpAudience) || resources.some(value => value !== config.mcpAudience)
            || scopes.some(scope => !(MCP_ALLOWED_SCOPES as readonly string[]).includes(scope)) || !scopes.includes('portfolio:read')) throw deniedGrant();
          const approval = await checkOAuthApproval(pool, referenceId, user.id, sessionId, client.clientId);
          return { azp: client.clientId, role: 'authenticated', [`${NAMESPACE}read_only`]: true, [`${NAMESPACE}email_verified`]: true,
            [`${NAMESPACE}auth_session_id`]: sessionId, [`${NAMESPACE}auth_session_created_at`]: approval.auth_session_created_at,
            [`${NAMESPACE}grant_id`]: referenceId, [`${NAMESPACE}email`]: user.email };
        } } }],
      }),
    ],
  });
}

let singleton: { key: string; auth: ReturnType<typeof createBetterAuth>; pool: Pool } | undefined;
function closeAuthPool(pool: Pool): void {
  try { void pool.end().catch(() => {}); } catch { /* Cleanup must not mask an authentication failure. */ }
}
export function getBetterAuth(): ReturnType<typeof createBetterAuth> | null {
  let config: BetterAuthConfiguration;
  try { config = betterAuthConfiguration(); } catch { return null; }
  const key = JSON.stringify([config.origin, config.databaseUrl, config.secret, config.websiteClientId, config.mcpClientId, isPasswordAuthEnabled(), process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET]);
  if (!singleton || singleton.key !== key) {
    const previous = singleton;
    singleton = undefined;
    if (previous) closeAuthPool(previous.pool);
    const pool = createAuthPool(config);
    let auth: ReturnType<typeof createBetterAuth>;
    try { auth = createBetterAuth(config, pool); }
    catch (error) { closeAuthPool(pool); throw error; }
    const candidate = { key, pool, auth };
    singleton = candidate;
    // The SDK retains a rejected initialization promise. Discard only this
    // instance so a later independent request may initialize again. Never
    // replay a request or reset an instance for an ordinary handler failure.
    void auth.$context.catch(() => {
      if (singleton === candidate) singleton = undefined;
      closeAuthPool(pool);
    });
  }
  return singleton.auth;
}

export async function getBetterAuthSession(headers: Headers) {
  const auth = getBetterAuth();
  if (!auth) return null;
  return auth.api.getSession({ headers, query: { disableCookieCache: true } });
}

export async function getWebsiteDatabaseToken(headers: Headers) {
  const auth = getBetterAuth();
  if (!auth) throw storageError();
  const session = await getBetterAuthSession(headers);
  if (!session?.user.emailVerified || !session.session.id || new Date(session.session.expiresAt).getTime() <= Date.now()) throw deniedGrant();
  const config = betterAuthConfiguration();
  const issuedAt = Math.floor(Date.now() / 1000);
  const createdAt = Math.floor(new Date(session.session.createdAt).getTime() / 1000);
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0 || createdAt > issuedAt) throw deniedGrant();
  const { token } = await auth.api.signJWT({ body: { payload: {
    sub: session.user.id, sid: session.session.id, iss: config.issuer, aud: config.websiteAudience,
    azp: config.websiteClientId, client_id: config.websiteClientId, role: 'authenticated',
    scope: 'portfolio:read portfolio:write', iat: issuedAt, exp: Math.min(issuedAt + 300, Math.floor(new Date(session.session.expiresAt).getTime() / 1000)), jti: randomUUID(),
    [`${NAMESPACE}read_only`]: false, [`${NAMESPACE}email_verified`]: true, [`${NAMESPACE}email`]: session.user.email,
    [`${NAMESPACE}auth_session_id`]: session.session.id, [`${NAMESPACE}auth_session_created_at`]: createdAt,
  } } });
  return { token, session };
}

export async function signOutBetterAuth(headers: Headers): Promise<Response> {
  const auth = getBetterAuth();
  if (!auth) throw storageError();
  return auth.api.signOut({ headers, asResponse: true });
}

/** Operator processes/tests only: release the shared pool after their work. */
export async function shutdownBetterAuth(): Promise<void> {
  const previous = singleton;
  singleton = undefined;
  await previous?.pool.end();
}

/** Dedicated authentication storage only; this role cannot read financial tables. */
export function getAuthDatabasePool(): Pool {
  if (!getBetterAuth() || !singleton) throw storageError();
  return singleton.pool;
}

/** Explicit operator opt-in repairs both capability ceilings, never user grants.
 * The provider seeds resources insert-only: changing config cannot upgrade an
 * existing resource row, and issuance silently intersects scopes with that row.
 */
async function enableMcpResourceScopes(bootstrap: ReturnType<typeof createBetterAuth>, headers: Headers, identifier: string, requestedScopes: readonly string[]): Promise<void> {
  const resource = await bootstrap.api.adminGetOAuthResource({ headers, params: { identifier } });
  const exactly = (actual: unknown, expected: readonly string[]) => Array.isArray(actual)
    && actual.every(value => typeof value === 'string')
    && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
  if (resource.identifier !== identifier || resource.disabled !== false || resource.accessTokenTtl !== 300
    || resource.signingAlgorithm !== 'ES256' || resource.refreshTokenTtl != null || resource.signingKeyId != null
    || resource.customClaims != null || resource.dpopBoundAccessTokensRequired !== false || !Array.isArray(resource.allowedScopes)) {
    throw new Error('Existing MCP resource policy requires review');
  }
  let allowedScopes: string[];
  try {
    allowedScopes = mcpRegistrationScopes(resource.allowedScopes, {
      enablePortfolioSync: requestedScopes.includes(MCP_SYNC_SCOPE),
      enablePortfolioTransactions: requestedScopes.includes(MCP_TRANSACTION_SCOPE),
    });
  } catch { throw new Error('Existing MCP resource policy requires review'); }
  if (exactly(resource.allowedScopes, allowedScopes)) return;
  const invariant = (value: object) => JSON.stringify(Object.entries(value)
    .filter(([key]) => !['allowedScopes', 'updatedAt'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  const updated = await bootstrap.api.adminUpdateOAuthResource({ headers, params: { identifier }, body: { allowedScopes } });
  if (!exactly(updated.allowedScopes, allowedScopes) || invariant(updated) !== invariant(resource)) {
    throw new Error('MCP resource optional scope update was not confirmed');
  }
}

/** Server/CLI setup only; no HTTP route exposes this function or its privileged instance. */
export async function seedMcpClient(headers: Headers, redirectUris: string[], options: McpScopeOptions = {}): Promise<{ clientId: string; created: boolean }> {
  const config = betterAuthConfiguration();
  const session = await getBetterAuthSession(headers);
  if (!session?.user.emailVerified || !singleton || !process.env.BETTER_AUTH_MCP_CLIENT_SECRET
    || process.env.BETTER_AUTH_MCP_CLIENT_SECRET.length < 32) throw deniedGrant();
  if (!redirectUris.length || redirectUris.length > 3 || new Set(redirectUris).size !== redirectUris.length) throw new Error('Exact MCP callbacks are required');
  for (const uri of redirectUris) {
    const url = new URL(uri);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && process.env.NODE_ENV !== 'production';
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.hash || uri.includes('*')) {
      throw new Error('Invalid MCP callback');
    }
  }
  const registrationScopes = mcpRegistrationScopes(AUTH_SCOPES, options);
  const enableOptionalScope = options.enablePortfolioSync === true || options.enablePortfolioTransactions === true;
  const existing = await singleton.pool.query<{ redirectUris: string[]; requirePKCE: boolean; skipConsent: boolean; disabled: boolean; tokenEndpointAuthMethod: string; scopes: string[]; grantTypes: string[]; resources: string[] }>(
    `select c."redirectUris", c."requirePKCE", c."skipConsent", c.disabled, c."tokenEndpointAuthMethod", c.scopes, c."grantTypes",
      coalesce((select jsonb_agg(r."resourceId") from livestocks_auth."oauthClientResource" r where r."clientId"=c."clientId"),'[]'::jsonb) as resources
      from livestocks_auth."oauthClient" c where c."clientId"=$1`, [config.mcpClientId]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const exactly = (actual: unknown, expected: readonly string[]) => Array.isArray(actual)
      && actual.every(value => typeof value === 'string')
      && JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
    const desiredScopes = mcpRegistrationScopes(row.scopes, options);
    if (row.requirePKCE !== true || row.skipConsent !== false || row.disabled !== false || row.tokenEndpointAuthMethod !== 'client_secret_post'
      || !exactly(row.redirectUris, redirectUris)
      || !exactly(row.grantTypes, ['authorization_code', 'refresh_token']) || !exactly(row.resources, [config.mcpAudience])) throw new Error('Existing MCP registration requires review');
    // Let the provider validate its own stored-secret format. A random nonexistent
    // token must be inactive; this neither issues nor revokes any real token.
    const probe = await singleton.auth.handler(new Request(`${config.issuer}/oauth2/introspect`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.mcpClientId, client_secret: process.env.BETTER_AUTH_MCP_CLIENT_SECRET,
        token: `setup-check-${randomUUID()}` }),
    }));
    const introspection = await probe.json().catch(() => null);
    if (!probe.ok || introspection?.active !== false) throw new Error('Configured MCP client secret requires review');
    if (enableOptionalScope) {
      const bootstrap = createBetterAuth(config, singleton.pool, session.user.id);
      await enableMcpResourceScopes(bootstrap, headers, config.mcpAudience, desiredScopes);
      if (!exactly(row.scopes, desiredScopes)) {
        const updated = await bootstrap.api.adminUpdateOAuthClient({ headers, body: { client_id: config.mcpClientId, update: { scope: desiredScopes.join(' ') } } });
        if (updated.client_id !== config.mcpClientId || typeof updated.scope !== 'string' || !exactly(updated.scope.split(' ').filter(Boolean), desiredScopes)) throw new Error('MCP optional scope update was not confirmed');
      }
    }
    return { clientId: config.mcpClientId, created: false };
  }
  const bootstrap = createBetterAuth(config, singleton.pool, session.user.id);
  if (enableOptionalScope) await enableMcpResourceScopes(bootstrap, headers, config.mcpAudience, registrationScopes);
  const created = await bootstrap.api.adminCreateOAuthClient({ headers, body: {
    client_name: 'LiveStocks ChatGPT', redirect_uris: redirectUris, application_type: 'web',
    token_endpoint_auth_method: 'client_secret_post', grant_types: ['authorization_code', 'refresh_token'],
    scope: registrationScopes.join(' '), resources: [config.mcpAudience], require_pkce: true, skip_consent: false,
  } });
  if (created.client_id !== config.mcpClientId) throw new Error('MCP client registration did not match configuration');
  return { clientId: created.client_id, created: true };
}
