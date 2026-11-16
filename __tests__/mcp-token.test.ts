// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { CompactSign, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { createMcpTokenVerifier, InvalidMcpTokenError } from '@/lib/auth/mcp-token';

const issuer = 'https://project.supabase.co/auth/v1';
const audience = 'https://stocks.example.com/api/mcp';
const approvedClientId = 'approved-chatgpt-client';
const userId = 'a35dd9e0-0d20-4ba9-985a-dc448580cd2e';
const sessionId = 'c8e6cc9a-f924-4903-b195-28bab963b935';
type Algorithm = 'RS256' | 'ES256';
let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
let ec: Awaited<ReturnType<typeof generateKeyPair>>;
let verify: ReturnType<typeof createMcpTokenVerifier>;

const claims = (): JWTPayload => ({
  iss: issuer, aud: audience, sub: userId, exp: Math.floor(Date.now() / 1000) + 300,
  session_id: sessionId, client_id: approvedClientId, read_only: true,
});

async function sign(payload: JWTPayload = claims(), algorithm: Algorithm = 'ES256') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm, kid: algorithm, typ: 'JWT' })
    .sign(algorithm === 'ES256' ? ec.privateKey : rsa.privateKey);
}

beforeAll(async () => {
  [rsa, ec] = await Promise.all([generateKeyPair('RS256'), generateKeyPair('ES256')]);
  const keys = await Promise.all(([['RS256', rsa], ['ES256', ec]] as const).map(async ([alg, pair]) => ({
    ...await exportJWK(pair.publicKey), alg, kid: alg, use: 'sig',
  })));
  verify = createMcpTokenVerifier({ issuer, audience, approvedClientId, jwks: createLocalJWKSet({ keys }) });
});

describe('candidate MCP access-token verification', () => {
  it.each<Algorithm>(['RS256', 'ES256'])('verifies real %s signatures and returns only the authorized identity', async algorithm => {
    const payload = { ...claims(), email: 'not-an-owner@example.com', user_metadata: { user_id: 'attacker' } };
    await expect(verify(await sign(payload, algorithm))).resolves.toEqual({
      userId, sessionId, clientId: approvedClientId, expiresAt: payload.exp, readOnly: true,
    });
  });

  it('accepts the canonical resource within multiple audiences for PostgREST compatibility', async () => {
    await expect(verify(await sign({ ...claims(), aud: ['authenticated', audience] }))).resolves.toMatchObject({ userId });
  });

  it.each([
    ['a different issuer', { iss: 'https://attacker.example/auth/v1' }],
    ['a normalized-looking issuer', { iss: `${issuer}/` }],
    ['a browser-only audience', { aud: 'authenticated' }],
    ['unrelated multiple audiences', { aud: ['authenticated', 'https://other.example/api/mcp'] }],
    ['a different resource path', { aud: `${audience}/` }],
    ['a resource prefix', { aud: `${audience}/extra` }],
    ['a different OAuth client', { client_id: 'other-client' }],
    ['a padded OAuth client', { client_id: ` ${approvedClientId}` }],
    ['a writable token', { read_only: false }],
    ['a string read-only flag', { read_only: 'true' }],
    ['a numeric read-only flag', { read_only: 1 }],
    ['an email subject', { sub: 'owner@example.com' }],
    ['an uppercase UUID subject', { sub: userId.toUpperCase() }],
    ['a UUID without separators', { sub: userId.replaceAll('-', '') }],
    ['a nil UUID subject', { sub: '00000000-0000-0000-0000-000000000000' }],
    ['a malformed session', { session_id: 'some-session' }],
    ['an uppercase session UUID', { session_id: sessionId.toUpperCase() }],
    ['an expired token', { exp: 1 }],
    ['a token that is not yet valid', { nbf: 9_000_000_000 }],
  ])('rejects %s even with a trusted signature', async (_name, override) => {
    await expect(verify(await sign({ ...claims(), ...override }))).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it.each(['iss', 'aud', 'exp', 'sub', 'session_id', 'client_id', 'read_only'])('requires %s', async field => {
    const payload = claims();
    delete payload[field];
    await expect(verify(await sign(payload))).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it.each(['"tomorrow"', 'null', '1e999'])('rejects invalid expiration %s in a signed raw payload', async rawExp => {
    const payload = JSON.stringify(claims()).replace(/"exp":\d+/, `"exp":${rawExp}`);
    const token = await new CompactSign(new TextEncoder().encode(payload))
      .setProtectedHeader({ alg: 'ES256', kid: 'ES256' }).sign(ec.privateKey);
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects a malformed audience array even if it contains the canonical resource', async () => {
    const payload = { ...claims(), aud: [audience, 123] };
    const token = await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
      .setProtectedHeader({ alg: 'ES256', kid: 'ES256' }).sign(ec.privateKey);
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects a token at its exact expiration time with no grace period', async () => {
    await expect(verify(await sign({ ...claims(), exp: Math.floor(Date.now() / 1000) }))).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects a forged signature even when the attacker reuses a trusted key ID', async () => {
    const attacker = await generateKeyPair('ES256');
    const token = await new SignJWT(claims()).setProtectedHeader({ alg: 'ES256', kid: 'ES256' }).sign(attacker.privateKey);
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects an unknown key ID', async () => {
    const token = await new SignJWT(claims()).setProtectedHeader({ alg: 'ES256', kid: 'unknown' }).sign(ec.privateKey);
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('does not trust an attacker key embedded in a token header', async () => {
    const attacker = await generateKeyPair('ES256');
    const token = await new SignJWT(claims()).setProtectedHeader({
      alg: 'ES256', kid: 'ES256', jwk: await exportJWK(attacker.publicKey), jku: 'https://attacker.example/jwks',
    }).sign(attacker.privateKey);
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects HMAC algorithm confusion using the public verification key as the secret', async () => {
    const publicKeyBytes = new TextEncoder().encode(JSON.stringify(await exportJWK(rsa.publicKey)));
    const token = await new SignJWT(claims()).setProtectedHeader({ alg: 'HS256', kid: 'RS256' }).sign(publicKeyBytes);
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects the unsupported RSA-PSS algorithm even with a matching trusted JWKS', async () => {
    const pair = await generateKeyPair('PS256');
    const jwk = { ...await exportJWK(pair.publicKey), kid: 'pss', alg: 'PS256' };
    const localVerify = createMcpTokenVerifier({ issuer, audience, approvedClientId, jwks: createLocalJWKSet({ keys: [jwk] }) });
    const token = await new SignJWT(claims()).setProtectedHeader({ alg: 'PS256', kid: 'pss' }).sign(pair.privateKey);
    await expect(localVerify(token)).rejects.toBeInstanceOf(InvalidMcpTokenError);
  });

  it('rejects unsigned and malformed JWTs without leaking their contents', async () => {
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims())).toString('base64url')}.`;
    for (const token of [unsigned, '', 'secret-user-token', 'a.b.c', 'Bearer secret-user-token']) {
      await expect(verify(token)).rejects.toThrow('Invalid MCP access token');
    }
  });

  it('fails closed if the trusted JWKS is unavailable', async () => {
    const localVerify = createMcpTokenVerifier({ issuer, audience, approvedClientId, jwks: async () => { throw new Error('secret internal URL'); } });
    await expect(localVerify(await sign())).rejects.toThrow('Invalid MCP access token');
  });

  it.each(['issuer', 'audience', 'approvedClientId'] as const)('requires explicit trusted %s configuration', field => {
    const options = { issuer, audience, approvedClientId, jwks: createLocalJWKSet({ keys: [] }) };
    expect(() => createMcpTokenVerifier({ ...options, [field]: '' })).toThrow('requires explicit');
    expect(() => createMcpTokenVerifier({ ...options, [field]: ' padded ' })).toThrow('requires explicit');
  });
});
