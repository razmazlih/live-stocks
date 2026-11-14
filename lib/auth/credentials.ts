import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getAdminSupabase } from '@/lib/auth/admin';

function encryptionKey(): Buffer {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error('Credential encryption is not configured');
  return Buffer.from(value, 'hex');
}

export function encryptCredential(userId: string, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`livestocks:finnhub:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptCredential(userId: string, value: string): string {
  const [version, iv, tag, encrypted, ...extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted || extra.length) throw new Error('Invalid encrypted credential');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(`livestocks:finnhub:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export async function readFinnhubCredential(userId: string): Promise<string | null> {
  const { data, error } = await getAdminSupabase().rpc('server_get_credentials', { p_user_id: userId });
  if (error) throw new Error('Could not read private market-data configuration');
  return typeof data === 'string' && data ? decryptCredential(userId, data) : null;
}

export async function saveFinnhubCredential(userId: string, token: string | null): Promise<void> {
  const { error } = await getAdminSupabase().rpc('server_set_credentials', {
    p_user_id: userId, p_encrypted_value: token === null ? null : encryptCredential(userId, token),
  });
  if (error) throw new Error('Could not save private market-data configuration');
}
