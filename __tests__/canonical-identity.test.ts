// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { parseResolvedIdentity, verifiedEmailDigest } from '@/lib/auth/identity';

afterEach(() => vi.unstubAllEnvs());

describe('canonical identity boundaries', () => {
  const valid = { profile_id: 'canonical-owner', raw_subject: 'google|other', state: 'active', min_auth_session_created_at: 0, identity_version: 1 };
  it('keeps the provider subject distinct from the financial owner', () => {
    expect(parseResolvedIdentity(valid, 'google|other')).toEqual(valid);
    expect(parseResolvedIdentity(valid, 'password|another')).toBeNull();
  });
  it.each([null, {}, { ...valid, state: 'merged' }, { ...valid, identity_version: 0 },
    { ...valid, min_auth_session_created_at: -1 }, { ...valid, profile_id: '' }])('rejects an invalid identity result %j', value => {
    expect(parseResolvedIdentity(value, 'google|other')).toBeNull();
  });
  it('preserves blocked and required-reauthentication states for the caller to deny', () => {
    for (const state of ['blocked', 'reauthentication_required']) {
      expect(parseResolvedIdentity({ ...valid, state }, 'google|other')?.state).toBe(state);
    }
  });
  it('indexes only a verified provider email without merging address aliases or issuers', () => {
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', 'ab'.repeat(32));
    const issuer = 'https://tenant.example/';
    const email = verifiedEmailDigest(issuer, 'Person@example.invalid');
    expect(email).toMatch(/^[a-f0-9]{64}$/);
    expect(verifiedEmailDigest(issuer, 'person@EXAMPLE.invalid')).toBe(email);
    expect(verifiedEmailDigest(issuer, 'person+tag@example.invalid')).not.toBe(email);
    expect(verifiedEmailDigest('https://other.example/', 'person@example.invalid')).not.toBe(email);
    expect(verifiedEmailDigest(issuer, undefined)).toBeNull();
  });
  it('never publishes a guessable email digest when indexing is not configured', () => {
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', '');
    expect(() => verifiedEmailDigest('https://tenant.example/', 'person@example.invalid')).toThrow('not configured');
  });
});
