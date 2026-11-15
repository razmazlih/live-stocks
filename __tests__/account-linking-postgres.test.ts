// @vitest-environment node
/** Synthetic imported identities; actual SDK session cookies, auth role, merge RPCs and ledger calculations. */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serializeSignedCookie } from 'better-call';
vi.mock('server-only', () => ({}));
import { getBetterAuth, getAuthDatabasePool, shutdownBetterAuth } from '@/lib/auth/better-auth';
import { createAccountMergeRuntime, mergeSession, shutdownAccountMergeRuntime } from '@/lib/account-linking/runtime';
import { verifiedEmailDigest } from '@/lib/auth/identity';
import { encryptCredential, decryptCredential } from '@/lib/auth/credentials';
import { computeRealizedSalesWithFx, mapPositionRow } from '@/lib/positions';
import { calculatePortfolioSummary, calculatePositionMetrics } from '@/lib/calculations';
import fixture from './fixtures/account-merge-ledgers.json';
import type { AccountLinkConfirmation, AccountLinkReview } from '@/types/account-linking';
import { MERGE_RECORD_PREFIX } from '@/lib/account-linking/store';

describe.skipIf(!process.env.ACCOUNT_LINKING_LOCAL_TEST_STATE)('native durable account merge', () => {
  it('proves both live cookies, rolls back an injected transfer failure, resumes after restart and preserves all ledgers', async () => {
    const state = JSON.parse(readFileSync(process.env.ACCOUNT_LINKING_LOCAL_TEST_STATE!, 'utf8'));
    if (state.productionAccess !== false || ![state.adminDatabaseUrl, state.backendDatabaseUrl, state.origin].every(value => ['127.0.0.1', 'localhost'].includes(new URL(value).hostname))) throw Error('Disposable local runtime required');
    const issuer = state.origin + '/api/auth';
    const env = { ACCOUNT_LINKING_ENABLED: 'true', APP_BASE_URL: state.origin, BETTER_AUTH_SECRET: 'synthetic-local-test-secret-32-characters', BETTER_AUTH_DATABASE_URL: state.backendDatabaseUrl,
      BETTER_AUTH_WEBSITE_CLIENT_ID: state.websiteClientId, BETTER_AUTH_MCP_CLIENT_ID: state.mcpClientId, PASSWORD_AUTH_ENABLED: 'false', CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64) };
    Object.entries(env).forEach(([k, v]) => vi.stubEnv(k, String(v)));
    const admin = new Pool({ connectionString: state.adminDatabaseUrl });
    let injectRollback = true, losePrepareAcknowledgement = false, loseCreateAcknowledgement = false;
    const rpc = async (name: string, args: Record<string, unknown>) => {
      if (!/^server_(merge_[a-z_]+|identity_resolve)$/.test(name) || Object.keys(args).some(k => !/^p_[a-z_]+$/.test(k))) throw Error('Unexpected fixture RPC');
      const client = await admin.connect();
      try {
        await client.query('begin'); await client.query('set local role service_role');
        const entries = Object.entries(args);
        const result = await client.query(`select public.${name}(${entries.map(([k], i) => `${k} => $${i + 1}`).join(',')}) data`, entries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v));
        if (name === 'server_merge_prepare' && injectRollback) { injectRollback = false; throw Error('Synthetic failure after complete transfer before commit'); }
        await client.query('commit');
        if (name === 'server_merge_create_guarded' && loseCreateAcknowledgement) { loseCreateAcknowledgement = false; return { data: null, error: { code: 'synthetic_create_acknowledgement_lost' } }; }
        if (name === 'server_merge_prepare' && losePrepareAcknowledgement) { losePrepareAcknowledgement = false; return { data: null, error: { code: 'synthetic_acknowledgement_lost' } }; }
        return { data: result.rows[0].data, error: null };
      } catch (error) { await client.query('rollback'); return { data: null, error }; }
      finally { client.release(); }
    };
    // In-process transport adapter only: queries below execute against the real local schema.
    const from = (table: string) => {
      if (!['positions', 'position_lots', 'position_plans', 'settings', 'watchlist_groups', 'watchlist_tickers'].includes(table)) throw Error('Unexpected fixture table');
      let columns = 'id', head = false; const values: unknown[] = [], conditions: string[] = [];
      const query = {
        select(value: string, options?: { head?: boolean }) { columns = value; head = Boolean(options?.head); return query; },
        eq(key: string, value: unknown) { if (!['user_id', 'is_active'].includes(key)) throw Error('Unsafe fixture column'); values.push(value); conditions.push(`${key}=$${values.length}`); return query; },
        in(key: string, value: unknown[]) { if (key !== 'user_id') throw Error('Unsafe fixture column'); values.push(value); conditions.push(`${key}=any($${values.length}::text[])`); return query; },
        abortSignal() { return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          if (!conditions.length || !/^[a-z_,]+$/.test(columns)) throw Error('Unscoped fixture query');
          return admin.query(`select ${head ? 'count(*)::int as n' : columns} from public.${table} where ${conditions.join(' and ')}`, values)
            .then(r => resolve({ data: head ? null : r.rows, count: head ? r.rows[0].n : null, error: null }), reject);
        },
      }; return query;
    };
    const transport = { rpc: (name: string, args: Record<string, unknown>) => ({ abortSignal: () => rpc(name, args) }), from } as unknown as SupabaseClient;
    async function snapshot() {
      const result: Record<string, unknown[]> = {};
      for (const t of ['positions', 'position_lots', 'position_plans', 'settings', 'watchlist_groups', 'watchlist_tickers']) {
        result[t] = (await admin.query(`select to_jsonb(r)-array['user_id','consolidated_into_position_id','is_active'] row from public.${t} r order by id`)).rows.map(r => r.row);
      }
      return result;
    }
    async function accounting() {
      const rows = (await admin.query('select p.*,coalesce((select jsonb_agg(l order by l.id) from public.position_lots l where l.position_id=p.id),\'[]\') position_lots from public.positions p order by p.id')).rows;
      const positions = rows.map(row => mapPositionRow(row)), fx = () => 3.5;
      vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
      try {
        const metrics = positions.map(p => calculatePositionMetrics(p, 42, 3.5, .05, 0, fx));
        return { sales: positions.flatMap(p => computeRealizedSalesWithFx(p, fx)), totals: calculatePortfolioSummary(metrics, 3.5, positions, fx) };
      } finally { vi.useRealTimers(); }
    }
    try {
      const effectiveDefinerGrants = async () => (await admin.query("select p.oid::regprocedure::text signature,actor from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated','livestocks_auth_backend']) actor where n.nspname='public' and p.prosecdef and has_function_privilege(actor,p.oid,'EXECUTE') order by 1,2")).rows;
      expect(await effectiveDefinerGrants()).toEqual([]);
      for (const [id, email] of [['merge-import-a', 'Same@example.invalid'], ['merge-import-b', 'same@example.invalid']]) {
        await admin.query('insert into livestocks_auth."user"(id,name,email,"emailVerified") values($1,$1,$2,true)', [id, email]);
        await admin.query('insert into livestocks_auth.account(id,"accountId","providerId","userId","updatedAt") values($1,$1,\'google\',$2,now())', [randomUUID(), id]);
        await admin.query('select public.server_identity_resolve($1,$2,$3)', [issuer, id, verifiedEmailDigest(issuer, email)]);
        await admin.query('select public.server_bootstrap_web_account($1,$2)', [issuer, id]);
      }
      await admin.query("update public.user_profiles set primary_pinned=true where id='merge-import-a'");
      for (const row of fixture.before.positions) {
        await admin.query('insert into public.positions(id,user_id,symbol,display,image_url,entry_price,quantity,entry_date,location,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [row.id, row.user_id === 'auth0|merge-a' ? 'merge-import-a' : 'merge-import-b', row.symbol, row.display, row.image_url, row.entry_price, row.quantity, row.entry_date, row.location, row.created_at, row.updated_at]);
      }
      for (const row of fixture.before.position_lots) {
        await admin.query('insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [row.id, row.user_id === 'auth0|merge-a' ? 'merge-import-a' : 'merge-import-b', row.position_id, row.side, row.price, row.quantity, row.executed_at, row.created_at, row.updated_at]);
      }
      await admin.query("insert into public.position_plans(user_id,position_id,symbol,target_price,target_quantity,target_date) values('merge-import-b','b0000000-0000-4000-8000-000000000001','SAME',50,1,'2030-01-01')");
      for (const id of ['merge-import-a', 'merge-import-b']) {
        const group = (await admin.query('insert into public.watchlist_groups(user_id,name) values($1,\'Same group\') returning id', [id])).rows[0].id;
        await admin.query('insert into public.watchlist_tickers(user_id,group_id,symbol) values($1,$2,\'SAME\')', [id, group]);
        await admin.query('select public.server_set_credentials($1,$2)', [id, encryptCredential(id, 'synthetic-key-' + id)]);
      }
      const auth = getBetterAuth()!, context = await auth.$context, backend = getAuthDatabasePool();
      backend.options.max = 1;
      await expect(backend.query('select * from public.positions')).rejects.toThrow();
      async function login(subject: string) {
        const session = await context.internalAdapter.createSession(subject);
        const cookie = (await serializeSignedCookie(context.authCookies.sessionToken.name, session.token, env.BETTER_AUTH_SECRET, context.authCookies.sessionToken.attributes)).split(';')[0];
        const headers = new Headers({ cookie }); const verified = await mergeSession(headers);
        expect(verified?.subject).toBe(subject); return { session: verified!, headers };
      }
      const service = createAccountMergeRuntime({ admin: transport, pool: backend });
      const a = await login('merge-import-a'), discovered = await service.status(a.session);
      expect(discovered.available && discovered.candidates).toHaveLength(1);
      if (!discovered.available) throw Error('Unavailable');
      const started = await service.start(a.session, discovered.candidates[0].id), cap = started.capability;
      await expect(service.confirm(cap, a.session, {} as AccountLinkConfirmation)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
      await service.challenge(cap, a.session, 'current');
      await expect(service.prove(cap, a.session)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
      const freshA = await login('merge-import-a'); await service.prove(cap, freshA.session);
      await service.challenge(cap, freshA.session, 'other');
      await expect(service.prove(cap, (await login('merge-import-a')).session)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
      const b = await login('merge-import-b'); const ready = await service.prove(cap, b.session);
      if (!ready.available || ready.operation?.phase !== 'review_ready') throw Error('Expected reviewed pair');
      const review: AccountLinkReview = ready.operation.review;
      expect(review.canonicalAccountId).toBe('merge-import-a'); expect(review.accounts.map(a => a.counts.positions).reduce((a, b) => a + b)).toBe(3);
      expect(JSON.stringify(review)).not.toContain('synthetic-key');
      await admin.query("insert into livestocks_auth.\"oauthClient\"(id,\"clientId\",\"redirectUris\") values($1,$2,'[]')", [randomUUID(), state.mcpClientId]);
      for (const proof of [freshA.session, b.session]) {
        const approval = (await backend.query('select private.ensure_oauth_approval($1,$2,$3) id', [proof.subject, proof.sessionId, state.mcpClientId])).rows[0].id;
        await admin.query("insert into livestocks_auth.\"oauthRefreshToken\"(id,token,\"clientId\",\"sessionId\",\"userId\",\"referenceId\",\"expiresAt\",\"createdAt\",scopes) values($1,$2,$3,$4,$5,$6,now()+interval '1 hour',now(),'[\"portfolio:read\"]')", [randomUUID(), randomUUID(), state.mcpClientId, proof.sessionId, proof.subject, approval]);
      }
      const confirm: AccountLinkConfirmation = { confirmed: true, accountIds: ['merge-import-a', 'merge-import-b'], canonicalAccountId: 'merge-import-a', reviewHash: review.hash, reviewVersion: review.version,
        settingsAccountId: 'merge-import-b', credentialAccountId: 'merge-import-b' };
      await admin.query("update public.positions set display='Changed during review' where user_id='merge-import-b'");
      await expect(service.confirm(cap, b.session, confirm)).rejects.toMatchObject({ code: 'REVIEW_CHANGED' });
      expect((await admin.query("select count(*)::int n from public.user_profiles where merge_state='frozen'")).rows[0].n).toBe(0);
      const refreshed = await service.status(b.session, cap);
      if (!refreshed.available || refreshed.operation?.phase !== 'review_ready') throw Error('Updated review required');
      confirm.reviewHash = refreshed.operation.review.hash; confirm.reviewVersion = refreshed.operation.review.version;
      const before = await snapshot(), ledgerBefore = await accounting();
      await expect(service.confirm(cap, b.session, confirm)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(await snapshot()).toEqual(before);
      expect((await admin.query('select count(*)::int n from private.account_merge_row_history')).rows[0].n).toBe(0);
      expect((await admin.query("select count(*)::int n from public.user_profiles where merge_state='frozen'")).rows[0].n).toBe(2);
      expect(await mergeSession(b.headers)).toBeNull();
      expect(await mergeSession(freshA.headers)).toBeNull();
      await expect(service.cancel(cap, null)).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(admin.query("update public.positions set quantity=999 where user_id='merge-import-b'")).rejects.toThrow('unavailable');
      // Commit succeeds but response is lost. Restart must recognize preparation and avoid re-encrypting a removed source key.
      losePrepareAcknowledgement = true;
      await expect(service.resume(cap)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect((await admin.query('select data_prepared_at is not null prepared from private.account_merge_jobs')).rows[0].prepared).toBe(true);
      const restarted = createAccountMergeRuntime({ admin: transport, pool: backend });
      expect(await restarted.resume(cap)).toMatchObject({ operation: { phase: 'completed' } });
      expect(await snapshot()).toEqual(before);
      expect(await accounting()).toEqual(ledgerBefore);
      expect((await admin.query('select count(*)::int n from private.oauth_approvals where revoked_at is null')).rows[0].n).toBe(0);
      expect((await admin.query('select count(*)::int n from livestocks_auth.\"oauthRefreshToken\" where revoked is null')).rows[0].n).toBe(0);
      const owners = (await admin.query('select distinct user_id from public.positions')).rows;
      expect(owners).toEqual([{ user_id: 'merge-import-a' }]);
      expect((await admin.query('select count(*)::int n from public.settings')).rows[0].n).toBe(2);
      expect((await admin.query('select count(*)::int n from public.settings where is_active')).rows[0].n).toBe(1);
      expect((await admin.query('select count(*)::int n from private.account_merge_row_history')).rows[0].n).toBe(Object.values(before).reduce((n, rows) => n + rows.length, 0));
      const credential = (await admin.query("select encrypted_value from private.user_credentials where user_id='merge-import-a'")).rows[0].encrypted_value;
      expect(decryptCredential('merge-import-a', credential)).toBe('synthetic-key-merge-import-b');
      await expect(Promise.resolve().then(() => decryptCredential('merge-import-b', credential))).rejects.toThrow();
      expect((await admin.query('select count(*)::int n from private.account_merge_credential_history')).rows[0].n).toBe(2);
      const history = (await admin.query('select count(*)::int n from private.account_merge_row_history')).rows[0].n;
      await restarted.resume(cap); expect((await admin.query('select count(*)::int n from private.account_merge_row_history')).rows[0].n).toBe(history);
      const stored = (await backend.query('select value from livestocks_auth.verification where id=$1', [MERGE_RECORD_PREFIX + cap.split('.')[0]])).rows[0].value;
      expect(stored).not.toContain(cap.split('.')[1]); expect(stored).not.toContain('synthetic-key');
      expect(createHash('sha256').update(JSON.stringify(await snapshot())).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(before)).digest('hex'));
      // Imported second pair: lost creation acknowledgement survives, expires safely, and releases both participants.
      for (const [id, email] of [['expiry-a', 'Expiry@example.invalid'], ['expiry-b', 'expiry@example.invalid']]) {
        await admin.query('insert into livestocks_auth."user"(id,name,email,"emailVerified") values($1,$1,$2,true)', [id, email]);
        await admin.query('select public.server_identity_resolve($1,$2,$3)', [issuer, id, verifiedEmailDigest(issuer, email)]);
        await admin.query('select public.server_bootstrap_web_account($1,$2)', [issuer, id]);
      }
      const expirySession = (await login('expiry-a')).session, expirySuggestions = await restarted.status(expirySession);
      if (!expirySuggestions.available) throw Error('Expected synthetic suggestion');
      const expiryBefore = await snapshot(); loseCreateAcknowledgement = true;
      const lost = await restarted.start(expirySession, expirySuggestions.candidates[0].id);
      const intentId = lost.capability.split('.')[0];
      expect(JSON.parse((await backend.query('select value from livestocks_auth.verification where id=$1', [MERGE_RECORD_PREFIX + intentId])).rows[0].value).jobId).not.toBe('');
      await backend.query("update livestocks_auth.verification set value=jsonb_set(value::jsonb,'{expiresAt}',to_jsonb($2::bigint))::text where id=$1", [MERGE_RECORD_PREFIX + intentId, Date.now() - 1]);
      await restarted.runPending();
      expect((await admin.query('select state from private.account_merge_jobs where request_id=$1', [intentId])).rows[0].state).toBe('cancelled');
      expect((await admin.query("select count(*)::int n from private.account_merge_participants where released_at is null")).rows[0].n).toBe(0);
      expect(await snapshot()).toEqual(expiryBefore);
      const replacement = await restarted.start(expirySession, expirySuggestions.candidates[0].id);
      expect(replacement.status).toMatchObject({ operation: { phase: 'proofs_pending' } });
      await restarted.cancel(replacement.capability, expirySession);
      const immediateRestart = await restarted.start(expirySession, expirySuggestions.candidates[0].id);
      await restarted.cancel(immediateRestart.capability, expirySession);
      // A definitively rejected creation must not lock the initiating profile forever after expiry.
      const conflicted = await restarted.start(expirySession, expirySuggestions.candidates[0].id);
      await restarted.cancel(conflicted.capability, expirySession);
      const neverId = randomUUID(), neverExpiry = new Date(Date.now() - 1000).toISOString();
      const neverArgs = { p_issuer: issuer, p_actor_subject: 'expiry-a', p_other_subject: 'expiry-b', p_request_id: neverId, p_expires_at: neverExpiry };
      expect((await rpc('server_merge_lookup_guarded', neverArgs)).data).toEqual({ job: null, expired: true });
      expect((await rpc('server_merge_create_guarded', neverArgs)).error).not.toBeNull();
      expect((await admin.query('select count(*)::int n from private.account_merge_jobs where request_id=$1', [neverId])).rows[0].n).toBe(0);
      await expect(backend.query('select public.server_merge_lookup_guarded($1,$2,$3,$4,$5)', [issuer, 'expiry-a', 'expiry-b', neverId, neverExpiry])).rejects.toThrow('permission denied');
      // A request that began before expiry but waited on its request lock must use the post-wait DB clock.
      const delayedId = randomUUID(), holder = await admin.connect();
      await holder.query('begin');
      await holder.query("select pg_advisory_xact_lock(hashtextextended('livestocks:merge-request:'||$1,0))", [delayedId]);
      const delayedArgs = { ...neverArgs, p_request_id: delayedId, p_expires_at: new Date(Date.now() + 150).toISOString() };
      const delayed = rpc('server_merge_create_guarded', delayedArgs);
      try {
        let waiting = false;
        for (let n = 0; n < 50; n++) {
          waiting = (await admin.query("select exists(select 1 from pg_stat_activity where wait_event='advisory' and query like 'select public.server_merge_create_guarded%') waiting")).rows[0].waiting;
          if (waiting) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        await new Promise(resolve => setTimeout(resolve, 180));
      } finally { await holder.query('commit'); holder.release(); }
      expect((await delayed).error).not.toBeNull();
      expect((await rpc('server_merge_lookup_guarded', delayedArgs)).data).toEqual({ job: null, expired: true });
      const pairJob = (await admin.query("select request_id from private.account_merge_jobs where actor_subject='expiry-a' limit 1")).rows[0].request_id;
      expect((await rpc('server_merge_lookup_guarded', { ...neverArgs, p_request_id: pairJob, p_other_subject: 'wrong' })).error).not.toBeNull();
      expect(await effectiveDefinerGrants()).toEqual([]);


      // Managed PostgreSQL: SET-only membership gives no inherited owner ACL authority.
      const beforeHardening = await snapshot();
      await admin.query('create role managed_operator login noinherit createrole nosuperuser nobypassrls');
      await admin.query('grant livestocks_merge_executor to managed_operator with admin true, inherit false, set true');
      for (const table of ['positions', 'position_lots', 'position_plans', 'settings', 'watchlist_groups', 'watchlist_tickers']) {
        await admin.query(`alter function public.set_${table}_updated_at() owner to managed_operator`);
      }
      await admin.query('grant execute on function public.server_merge_prepare(uuid,text,text) to public');
      expect((await effectiveDefinerGrants()).filter(r => r.signature.startsWith('server_merge_prepare('))).toHaveLength(3);
      const managedUrl = new URL(state.adminDatabaseUrl); managedUrl.username = 'managed_operator';
      const managed = new Pool({ connectionString: managedUrl.href });
      try {
        const actor = (await managed.query('select current_user name,rolsuper,rolinherit,rolcreaterole from pg_roles where rolname=current_user')).rows[0];
        expect(actor).toMatchObject({ name: 'managed_operator', rolsuper: false, rolinherit: false, rolcreaterole: true });
        const hardening = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(name => name.endsWith('_harden_account_merge_function_access.sql'));
        expect(hardening).toHaveLength(1);
        await managed.query(readFileSync(new URL('../supabase/migrations/' + hardening[0], import.meta.url), 'utf8'));
      } finally { await managed.end(); }
      expect(await effectiveDefinerGrants()).toEqual([]);
      expect(await snapshot()).toEqual(beforeHardening);
    } finally { await shutdownAccountMergeRuntime(); await shutdownBetterAuth(); await admin.end(); vi.unstubAllEnvs(); }
  }, 30000);
});
