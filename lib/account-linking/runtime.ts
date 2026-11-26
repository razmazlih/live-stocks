import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { createAuthPool, getAuthDatabasePool, getBetterAuthSession } from '@/lib/auth/better-auth';
import { betterAuthConfiguration } from '@/lib/auth/better-auth-config';
import { isMcpClientId } from '@/lib/auth/mcp-clients';
import { getAdminSupabase } from '@/lib/auth/admin';
import { decryptCredential, encryptCredential } from '@/lib/auth/credentials';
import { verifiedEmailDigest } from '@/lib/auth/identity';
import { AccountMergeError, AccountMergeService, type MergeDependencies, type MergeSession } from './service';
import { PostgresMergeStore } from './store';
import type { AccountLinkReview } from '@/types/account-linking';

export function accountMergeEnabled() { return process.env.ACCOUNT_LINKING_ENABLED === 'true'; }
export async function mergeSession(headers: Headers): Promise<MergeSession | null> {
  const s = await getBetterAuthSession(headers);
  if (!s?.user.emailVerified || new Date(s.session.expiresAt).getTime() <= Date.now()) return null;
  const emailHash = verifiedEmailDigest(betterAuthConfiguration().issuer, s.user.email);
  if (!emailHash) return null;
  const { rows } = await getAuthDatabasePool().query('select "providerId" from livestocks_auth.account where "userId"=$1', [s.user.id]);
  return { subject: s.user.id, sessionId: s.session.id, createdAt: new Date(s.session.createdAt).getTime(), emailHash,
    method: rows.some(r => r.providerId === 'google') ? 'google' : rows.some(r => r.providerId === 'credential') ? 'password' : 'other' };
}
let lockPoolCache: { key: string; pool: Pool } | undefined;
function mergeLockPool(config: ReturnType<typeof betterAuthConfiguration>) {
  const key = JSON.stringify(config);
  if (!lockPoolCache || lockPoolCache.key !== key) {
    void lockPoolCache?.pool.end().catch(() => {});
    const pool = createAuthPool(config);
    pool.options.max = 2;
    lockPoolCache = { key, pool };
  }
  return lockPoolCache.pool;
}
export async function shutdownAccountMergeRuntime() {
  const previous = lockPoolCache; lockPoolCache = undefined; await previous?.pool.end();
}
export function createAccountMergeRuntime(overrides: { admin?: SupabaseClient; pool?: Pool; lockPool?: Pool } = {}): AccountMergeService {
  if (!accountMergeEnabled()) throw new AccountMergeError('NOT_READY', 503);
  const config = betterAuthConfiguration(), pool = overrides.pool ?? getAuthDatabasePool(), admin = overrides.admin ?? getAdminSupabase();
  const dependencies: MergeDependencies = {
    issuer: config.issuer, secret: config.secret, now: Date.now, store: new PostgresMergeStore(overrides.lockPool ?? mergeLockPool(config)),
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await admin.rpc(name, args).abortSignal(AbortSignal.timeout(8000));
      if (error) throw new AccountMergeError('CONFLICT');
      return data as T;
    },
    async review(job, preview, proofs): Promise<AccountLinkReview> {
      const ids = [job.primary_profile_id, job.secondary_profile_id] as const;
      const accounts = await Promise.all(ids.map(async id => {
        const counts = await Promise.all(['positions', 'position_lots', 'position_plans', 'watchlist_groups', 'watchlist_tickers'].map(async table => {
          const result = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', id).abortSignal(AbortSignal.timeout(8000));
          if (result.error || result.count === null) throw new AccountMergeError('UNAVAILABLE', 503);
          return result.count;
        }));
        // This data is read only after both SQL-validated proofs. No unscoped service reads.
        const subject = id === job.primary_profile_id ? job.actor_subject : job.other_subject;
        const resolved = await dependencies.rpc<{ profile_id: string }>('server_identity_resolve', { p_issuer: job.issuer, p_subject: subject });
        const proof = resolved.profile_id === id ? (subject === job.actor_subject ? proofs.current : proofs.other) : (subject === job.actor_subject ? proofs.other : proofs.current);
        return { id, method: proof?.method ?? 'other' as const, counts: { positions: counts[0], lots: counts[1], plans: counts[2], watchlistGroups: counts[3], watchlistTickers: counts[4] } };
      }));
      const { data: settings, error } = await admin.from('settings').select('user_id,currency,refresh_interval,annual_growth_rate').in('user_id', [...ids]).eq('is_active', true).abortSignal(AbortSignal.timeout(8000));
      if (error || !settings) throw new AccountMergeError('UNAVAILABLE', 503);
      const versions = preview.credential_versions as Record<string, string>;
      return { version: Number(preview.version), hash: String(preview.preview_hash), canonicalAccountId: job.primary_profile_id,
        accounts: accounts as AccountLinkReview['accounts'],
        settings: { conflict: settings.length > 1, choices: settings.map(s => ({ accountId: s.user_id, currency: s.currency, refreshInterval: s.refresh_interval, annualGrowthRate: s.annual_growth_rate })) },
        credential: { conflict: Object.keys(versions).length > 1, choices: ids.map(id => ({ accountId: id, configured: Boolean(versions[id]) })) } };
    },
    reencrypt: (aad, ciphertext, canonical) => encryptCredential(canonical, decryptCredential(aad, ciphertext)),
    async revoke(job) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query("set local lock_timeout='3s';set local statement_timeout='15s'");
        const subjects = [...new Set(job.revocations.map(r => r.subject))];
        if (!subjects.includes(job.actor_subject) || !subjects.includes(job.other_subject)
          || job.revocations.some(r => r.client_id !== config.websiteClientId && !isMcpClientId(config, r.client_id))) throw new AccountMergeError('CONFLICT');
        for (const subject of subjects) {
          await client.query('select private.revoke_oauth_approvals($1)', [subject]);
          await client.query('delete from livestocks_auth.session where "userId"=$1', [subject]);
          await client.query('update livestocks_auth."oauthRefreshToken" set revoked=coalesce(revoked,clock_timestamp()) where "userId"=$1', [subject]);
          await client.query('update livestocks_auth."oauthAccessToken" set revoked=coalesce(revoked,clock_timestamp()) where "userId"=$1', [subject]);
        }
        const { rows } = await client.query('select clock_timestamp() as now');
        await client.query('commit');
        return { revoked: job.revocations.map(r => ({ ...r, verified_at: new Date(rows[0].now).toISOString() })) };
      } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
      finally { client.release(); }
    },
  };
  return new AccountMergeService(dependencies);
}
