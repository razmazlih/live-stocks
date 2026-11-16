import { jwtVerify, type JWTVerifyGetKey } from 'jose';

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface McpTokenVerifierOptions {
  /** Trusted configuration, never obtained from an unverified token. */
  issuer: string;
  /** The exact canonical MCP resource URI; no URL normalization is applied. */
  audience: string;
  approvedClientId: string;
  /** A trusted jose local/remote JWKS resolver, never a token-supplied key URL. */
  jwks: JWTVerifyGetKey;
}

export interface McpTokenIdentity {
  readonly userId: string;
  readonly sessionId: string;
  readonly clientId: string;
  /** JWT NumericDate, in seconds since the Unix epoch. */
  readonly expiresAt: number;
  readonly readOnly: true;
}

export class InvalidMcpTokenError extends Error {
  constructor() {
    super('Invalid MCP access token');
    this.name = 'InvalidMcpTokenError';
  }
}

/**
 * Candidate verifier only: no route is protected until its caller uses this result.
 * This verifies the signed session ID, not whether that session is still active.
 * Revocation/session checks and database authorization belong at integration time.
 */
export function createMcpTokenVerifier(options: McpTokenVerifierOptions) {
  const { issuer, audience, approvedClientId, jwks } = options;
  if ([issuer, audience, approvedClientId].some(value => !value || value.trim() !== value)) {
    throw new Error('MCP token verifier requires explicit issuer, audience and approved client ID');
  }

  return async function verifyMcpToken(token: string): Promise<McpTokenIdentity> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['RS256', 'ES256'],
        issuer,
        audience,
        requiredClaims: ['iss', 'aud', 'exp', 'sub', 'session_id', 'client_id', 'read_only'],
        clockTolerance: 0,
      });

      // jose accepts a matching audience in either a string or a string array.
      // Additional audiences (e.g. authenticated for PostgREST) do not replace it.
      if (
        !(typeof payload.aud === 'string' ||
          (Array.isArray(payload.aud) && payload.aud.every(value => typeof value === 'string'))) ||
        typeof payload.sub !== 'string' || !CANONICAL_UUID.test(payload.sub) ||
        typeof payload.session_id !== 'string' || !CANONICAL_UUID.test(payload.session_id) ||
        payload.client_id !== approvedClientId || payload.read_only !== true ||
        typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)
      ) {
        throw new InvalidMcpTokenError();
      }

      return {
        userId: payload.sub,
        sessionId: payload.session_id,
        clientId: approvedClientId,
        expiresAt: payload.exp,
        readOnly: true,
      };
    } catch {
      // Do not expose untrusted claims, credentials, or resolver internals in errors.
      throw new InvalidMcpTokenError();
    }
  };
}
