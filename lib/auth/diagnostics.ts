import 'server-only';

// Exact allowlists only: even error names/codes may contain credential material.
const ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'APIError', 'DatabaseError', 'error', 'BetterAuthError', 'ZodError', 'AggregateError', 'Auth0TokenInfrastructureError', 'JWKSTimeout', 'JOSEError', 'JWKSInvalid']);
const SQL_CODES = new Set(['08000', '08001', '08003', '08004', '08006', '08007', '08P01', '22001', '22023', '22P02', '23502', '23503', '23505', '23514', '28000', '28P01', '3D000', '3F000', '40001', '40P01', '42501', '42601', '42703', '42883', '42P01', '53300', '53400', '55000', '57014', '57P01', '57P02', '57P03', '0A000', '25006', '25P02', '26000', '53000', '53100', '53200', 'XX000']);
const JWKS_CODES = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC', 'ERR_JWK_INVALID', 'ERR_JWKS_MULTIPLE_MATCHING_KEYS']);
const NODE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ERR_INVALID_URL', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_REQUIRE_ESM', 'ERR_CRYPTO_INVALID_KEYLEN', 'ERR_CRYPTO_INVALID_IV', 'ERR_OSSL_EVP_UNSUPPORTED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_SIGNATURE_FAILURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
export type AuthFailurePhase = 'configuration' | 'initialization' | 'request' | 'session' | 'website-token' | 'token-verification' | 'account-storage';

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
  if (typeof code === 'string' && JWKS_CODES.has(code)) return { name: safeName, category: 'jwks', code };
  if (typeof code === 'string' && SQL_CODES.has(code)) return { name: safeName, category: 'postgres', code };
  if (typeof code === 'string' && NODE_CODES.has(code)) return { name: safeName, category: code.includes('CERT') || code.startsWith('ERR_TLS_') || code.startsWith('UNABLE_TO_') ? 'tls' : 'node', code };
  return { name: safeName, category: 'unknown', code: 'UNRECOGNIZED' };
}

export function logAuthFailure(phase: AuthFailurePhase, error: unknown) {
  let cause: unknown;
  try { if (error && typeof error === 'object') cause = (error as { cause?: unknown }).cause; } catch { /* Ignore unsafe accessors. */ }
  console.error('Authentication request failed', { phase, error: safeErrorFields(error), ...(cause === undefined ? {} : { cause: safeErrorFields(cause) }) });
}

