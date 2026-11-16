import { jwtVerify, type JWTVerifyGetKey } from 'jose';

export type Auth0TokenKind = 'web' | 'mcp';

export interface Auth0TokenVerifierOptions {
  /** Exact trusted issuer, including its configured trailing slash. */
  issuer: string;
  websiteAudience: string;
  mcpAudience: string;
  websiteClientId: string;
  mcpClientId: string;
  /** Trusted local/remote JWKS resolver; never derive this from token headers. */
  jwks: JWTVerifyGetKey;
  requireLiveSessionEvidence?: boolean;
  /** Exact provider-owned UserInfo companion audience, if advertised. */
  companionAudience?: string;
}

export interface Auth0TokenIdentity {
  readonly userId: string;
  readonly scopes: readonly string[];
  /** Narrow checkpoint synchronization only; never general portfolio write permission. */
  readonly portfolioSync: boolean;
  /** Optional signed, provider-owned evidence. Missing origin must never fall back to iat. */
  readonly authSessionId?: string;
  readonly authSessionCreatedAt?: number;
  readonly verifiedEmail?: string;
  readonly grantId?: string;
  readonly clientId: string;
  /** JWT NumericDate values, in seconds. */
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly kind: Auth0TokenKind;
}

export class Auth0TokenVerificationError extends Error {
  constructor() {
    super('Invalid Auth0 access token');
    this.name = 'Auth0TokenVerificationError';
  }
}

const READ_ONLY_CLAIM = 'https://livestocks.app/read_only';
const VERIFIED_EMAIL_CLAIM = 'https://livestocks.app/email_verified';
const EMAIL_CLAIM = 'https://livestocks.app/email';
const SESSION_ID_CLAIM = 'https://livestocks.app/auth_session_id';
const SESSION_CREATED_CLAIM = 'https://livestocks.app/auth_session_created_at';
const GRANT_CLAIM = 'https://livestocks.app/grant_id';

/** Verifies identity only; database ownership and live revocation checks remain mandatory. */
export function createAuth0TokenVerifier(options: Auth0TokenVerifierOptions) {
  const { issuer, websiteAudience, mcpAudience, websiteClientId, mcpClientId, jwks } = options;
  if ([issuer, websiteAudience, mcpAudience, websiteClientId, mcpClientId]
    .some(value => typeof value !== 'string' || !value || value.trim() !== value)
    || websiteAudience === mcpAudience || websiteClientId === mcpClientId || typeof jwks !== 'function') {
    throw new Error('Auth0 verifier requires explicit, distinct trusted website and MCP configuration');
  }

  return async function verifyAuth0Token(token: string, kind: Auth0TokenKind): Promise<Auth0TokenIdentity> {
    try {
      if ((kind !== 'web' && kind !== 'mcp') || typeof token !== 'string' || !token) {
        throw new Auth0TokenVerificationError();
      }
      const expectedAudience = kind === 'web' ? websiteAudience : mcpAudience;
      const expectedClient = kind === 'web' ? websiteClientId : mcpClientId;
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['RS256', 'ES256'], issuer, audience: expectedAudience, clockTolerance: 0,
        requiredClaims: ['iss', 'aud', 'sub', 'azp', 'scope', 'role', 'iat', 'exp', READ_ONLY_CLAIM, VERIFIED_EMAIL_CLAIM],
      });
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      const scopes = typeof payload.scope === 'string' ? new Set(payload.scope.split(/\s+/).filter(Boolean)) : new Set<string>();
      const now = Math.floor(Date.now() / 1000);
      if (
        audiences.some(value => typeof value !== 'string' || !value || value.trim() !== value)
        || (options.requireLiveSessionEvidence && audiences.some(value => value !== expectedAudience && value !== options.companionAudience))
        || typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 255 || payload.sub.trim() !== payload.sub
        || payload.azp !== expectedClient
        // If a provider adds the RFC 9068 claim, it must agree with Auth0's azp.
        || (payload.client_id !== undefined && payload.client_id !== expectedClient)
        || payload.role !== 'authenticated'
        || payload[READ_ONLY_CLAIM] !== (kind === 'mcp') || payload[VERIFIED_EMAIL_CLAIM] !== true
        || !scopes.has('portfolio:read') || (kind === 'web' && !scopes.has('portfolio:write'))
        || (kind === 'mcp' && scopes.has('portfolio:write'))
        || (kind === 'web' && scopes.has('portfolio:sync'))
        || typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || payload.iat < 0 || payload.iat > now + 5
        || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat
      ) {
        throw new Auth0TokenVerificationError();
      }
      const sessionId = payload[SESSION_ID_CLAIM];
      const sessionCreatedAt = payload[SESSION_CREATED_CLAIM];
      const email = payload[EMAIL_CLAIM];
      const grantId = payload[GRANT_CLAIM];
      const hasOrigin = sessionId !== undefined || sessionCreatedAt !== undefined;
      if ((hasOrigin && (typeof sessionId !== 'string' || !sessionId || sessionId.length > 255 || sessionId.trim() !== sessionId
        || typeof sessionCreatedAt !== 'number' || !Number.isSafeInteger(sessionCreatedAt) || sessionCreatedAt <= 0 || sessionCreatedAt > payload.iat))
        || (email !== undefined && (typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email)))) {
        throw new Auth0TokenVerificationError();
      }
      if (options.requireLiveSessionEvidence && (!hasOrigin || !email || payload.sid !== sessionId
        || (kind === 'mcp' && (typeof grantId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(grantId))))) {
        throw new Auth0TokenVerificationError();
      }
      return { userId: payload.sub, scopes: [...scopes], portfolioSync: kind === 'mcp' && scopes.has('portfolio:sync'), clientId: expectedClient, issuedAt: payload.iat, expiresAt: payload.exp, kind,
        ...(hasOrigin ? { authSessionId: sessionId as string, authSessionCreatedAt: sessionCreatedAt as number } : {}),
        ...(typeof email === 'string' ? { verifiedEmail: email } : {}),
        ...(typeof grantId === 'string' ? { grantId } : {}),
      };
    } catch {
      // Do not reveal tokens, untrusted claims, or JWKS/network error details.
      throw new Auth0TokenVerificationError();
    }
  };
}
