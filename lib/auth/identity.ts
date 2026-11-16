import 'server-only';
import { createHmac } from 'node:crypto';

/** Private suggestion index only. This digest never authorizes linking or data access. */
export function verifiedEmailDigest(issuer: string, verifiedEmail: string | undefined): string | null {
  if (!verifiedEmail) return null;
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) throw new Error('Identity indexing is not configured');
  // Do not normalize provider-specific aliases (dots, plus tags): those may be distinct addresses.
  const email = verifiedEmail.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Invalid verified identity');
  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update(JSON.stringify(['livestocks:verified-email:v1', issuer, email])).digest('hex');
}

export type ResolvedIdentity = {
  profile_id: string;
  raw_subject: string;
  state: 'active' | 'blocked' | 'reauthentication_required';
  min_auth_session_created_at: number;
  identity_version: number;
};

/** Validate the service RPC result; never substitute a raw subject on storage failure. */
export function parseResolvedIdentity(data: unknown, expectedSubject: string): ResolvedIdentity | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (typeof value.profile_id !== 'string' || !value.profile_id || value.profile_id.length > 255
    || value.raw_subject !== expectedSubject
    || !['active', 'blocked', 'reauthentication_required'].includes(String(value.state))
    || !Number.isSafeInteger(value.min_auth_session_created_at) || Number(value.min_auth_session_created_at) < 0
    || !Number.isSafeInteger(value.identity_version) || Number(value.identity_version) < 1) return null;
  return value as ResolvedIdentity;
}
