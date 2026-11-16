// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/admin', () => ({ getAdminSupabase: () => ({ rpc: mocks.rpc }) }));
import { encryptCredential, decryptCredential, readFinnhubCredential, saveFinnhubCredential } from '@/lib/auth/credentials';

const userId = 'auth0|credential-owner';
const otherUserId = 'google-oauth2|different-owner';
const token = 'test-only-finnhub-secret';
const key = 'a5'.repeat(32);
function corruptPart(value: string, index: number): string {
  const parts = value.split('.');
  const bytes = Buffer.from(parts[index], 'base64url');
  bytes[0] ^= 1;
  parts[index] = bytes.toString('base64url');
  return parts.join('.');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', key);
  mocks.rpc.mockResolvedValue({ error: null, data: null });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('private credential authenticated encryption', () => {
  it('round trips with a fresh random IV and authenticated ciphertext for every save', () => {
    const first = encryptCredential(userId, token);
    const second = encryptCredential(userId, token);
    expect(first).not.toBe(second);
    expect(first.split('.')[1]).not.toBe(second.split('.')[1]);
    for (const encrypted of [first, second]) {
      expect(encrypted.split('.')).toHaveLength(4);
      expect(encrypted.split('.')[0]).toBe('v1');
      expect(Buffer.from(encrypted.split('.')[1], 'base64url')).toHaveLength(12);
      expect(Buffer.from(encrypted.split('.')[2], 'base64url')).toHaveLength(16);
      expect(decryptCredential(userId, encrypted)).toBe(token);
      expect(encrypted).not.toContain(token);
      expect(encrypted).not.toContain(key);
    }
  });

  it('rejects copying an encrypted key to a different account via AAD binding', () => {
    const encrypted = encryptCredential(userId, token);
    expect(() => decryptCredential(otherUserId, encrypted)).toThrow();
    expect(decryptCredential(userId, encrypted)).toBe(token);
  });

  it.each([{ index: 1, label: 'IV' }, { index: 2, label: 'authentication tag' }, { index: 3, label: 'ciphertext' }])('rejects a bit-flipped $label', ({ index }) => {
    const encrypted = encryptCredential(userId, token);
    expect(() => decryptCredential(userId, corruptPart(encrypted, index))).toThrow();
  });

  it('rejects ciphertext encrypted with another server key', () => {
    const encrypted = encryptCredential(userId, token);
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', 'b6'.repeat(32));
    expect(() => decryptCredential(userId, encrypted)).toThrow();
  });

  it.each(['', 'v2.a.b.c', 'v1.a.b', 'v1.a.b.c.extra', 'v1..b.c', 'v1.a..c', 'v1.a.b.'])('rejects malformed envelope %j', (encrypted) => {
    expect(() => decryptCredential(userId, encrypted)).toThrow('Invalid encrypted credential');
  });

  it.each(['', 'too-short', 'x'.repeat(64), 'ab'.repeat(31), 'ab'.repeat(33)])('fails closed with invalid key configuration %j', async (invalidKey) => {
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', invalidKey);
    const operation = () => encryptCredential(userId, token);
    expect(operation).toThrow('Credential encryption is not configured');
    try { operation(); } catch (error) {
      expect(String(error)).not.toContain(token);
      if (invalidKey) expect(String(error)).not.toContain(invalidKey);
    }
    await expect(saveFinnhubCredential(userId, token)).rejects.toThrow('Credential encryption is not configured');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('private credential database boundary', () => {
  it('persists only encrypted data with its explicit owner and decrypts only for that owner', async () => {
    await saveFinnhubCredential(userId, token);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe('server_set_credentials');
    expect(args.p_user_id).toBe(userId);
    expect(decryptCredential(userId, args.p_encrypted_value)).toBe(token);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(token);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(key);
    mocks.rpc.mockResolvedValue({ data: args.p_encrypted_value, error: null });
    expect(await readFinnhubCredential(userId)).toBe(token);
    expect(mocks.rpc).toHaveBeenLastCalledWith('server_get_credentials', { p_user_id: userId });
    await expect(readFinnhubCredential(otherUserId)).rejects.toThrow();
  });

  it('removes a key by sending null and does not require decryption material for removal', async () => {
    vi.stubEnv('CREDENTIAL_ENCRYPTION_KEY', '');
    await saveFinnhubCredential(userId, null);
    expect(mocks.rpc).toHaveBeenCalledWith('server_set_credentials', { p_user_id: userId, p_encrypted_value: null });
  });

  it('represents an absent private key as null', async () => {
    expect(await readFinnhubCredential(userId)).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith('server_get_credentials', { p_user_id: userId });
  });

  it('sanitizes storage failures rather than serializing provider key or database details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: `internal query ${token} ${key}` } });
    await expect(readFinnhubCredential(userId)).rejects.toThrow('Could not read private market-data configuration');
    await expect(saveFinnhubCredential(userId, token)).rejects.toThrow('Could not save private market-data configuration');
    try { await readFinnhubCredential(userId); } catch (error) {
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(key);
      expect(String(error)).not.toContain('internal query');
    }
  });
});
