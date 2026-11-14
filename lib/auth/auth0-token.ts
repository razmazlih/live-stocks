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
}

export interface Auth0TokenIdentity {
  readonly userId: string;
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
        || typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 255 || payload.sub.trim() !== payload.sub
        || payload.azp !== expectedClient
        // If a provider adds the RFC 9068 claim, it must agree with Auth0's azp.
        || (payload.client_id !== undefined && payload.client_id !== expectedClient)
        || payload.role !== 'authenticated'
        || payload[READ_ONLY_CLAIM] !== (kind === 'mcp') || payload[VERIFIED_EMAIL_CLAIM] !== true
        || !scopes.has('portfolio:read') || (kind === 'web' && !scopes.has('portfolio:write'))
        || (kind === 'mcp' && scopes.has('portfolio:write'))
        || typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || payload.iat < 0 || payload.iat > now + 5
        || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat
      ) {
        throw new Auth0TokenVerificationError();
      }
      return { userId: payload.sub, clientId: expectedClient, issuedAt: payload.iat, expiresAt: payload.exp, kind };
    } catch {
      // Do not reveal tokens, untrusted claims, or JWKS/network error details.
      throw new Auth0TokenVerificationError();
    }
  };
}
