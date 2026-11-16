// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AccountMergeService, type MergeCeremony, type MergeDependencies, type MergeJob, type MergeSession } from '@/lib/account-linking/service';
import type { AccountLinkConfirmation, AccountLinkReview } from '@/types/account-linking';

function fixture() {
  let now = Date.now();
  const records = new Map<string, MergeCeremony>();
  const job: MergeJob = { id: 'job', issuer: 'https://test.invalid/api/auth', actor_subject: 'A', other_subject: 'B', primary_profile_id: 'PA', secondary_profile_id: 'PB',
    state: 'proofs_pending', version: 1, frozen_at: null, data_prepared_at: null, completed_at: null, revocations: [{ subject: 'A', client_id: 'web' }, { subject: 'B', client_id: 'web' }] };
  const review: AccountLinkReview = { version: 3, hash: 'review', canonicalAccountId: 'PA', accounts: ['PA', 'PB'].map(id => ({ id, method: 'google', counts: { positions: 1, lots: 2, plans: 0, watchlistGroups: 0, watchlistTickers: 0 } })) as AccountLinkReview['accounts'],
    settings: { conflict: true, choices: ['PA', 'PB'].map(accountId => ({ accountId, currency: 'USD', annualGrowthRate: .05, refreshInterval: 15 })) },
    credential: { conflict: true, choices: ['PA', 'PB'].map(accountId => ({ accountId, configured: true })) } };
  const rpc = vi.fn(async (name: string) => {
    if (name === 'server_merge_lookup_guarded') return { job: null, expired: false };
    if (name === 'server_merge_candidates') return [{ subject: 'B', profile_id: 'PB' }];
    if (name === 'server_merge_proof') job.version++;
    if (name === 'server_merge_preview') { job.state = 'review_ready'; return { preview_hash: review.hash, version: job.version }; }
    if (name === 'server_merge_freeze') { job.frozen_at = new Date(now).toISOString(); job.state = 'frozen'; }
    if (name === 'server_merge_secret_material') return { selected_ciphertext: 'cipherB', selected_aad_subject: 'PB', canonical_profile_id: 'PA', credential_version: 'version' };
    if (name === 'server_merge_prepare') { job.data_prepared_at = new Date(now).toISOString(); job.state = 'revocation_pending'; }
    if (name === 'server_merge_finish') { job.completed_at = new Date(now).toISOString(); job.state = 'completed'; }
    if (name === 'server_merge_fail') job.state = job.frozen_at ? 'reconcile_required' : 'cancelled';
    if (name === 'server_identity_resolve') return { state: 'active', profile_id: 'PA' };
    return structuredClone(job);
  });
  const deps: MergeDependencies = { issuer: job.issuer, secret: 'synthetic-strong-secret', now: () => now,
    store: { create: async c => { records.set(c.id, structuredClone(c)); }, locked: async (id, action) => {
      const c = structuredClone(records.get(id)!); const result = await action(c); records.delete(id); records.set(id, c); return result;
    }, pending: async n => [...records.values()].filter(c => !c.workerDone).slice(0, n).map(c => c.id) },
    rpc: rpc as MergeDependencies['rpc'], review: async () => structuredClone(review), reencrypt: vi.fn(() => 'new-cipher'),
    revoke: vi.fn(async () => ({ revoked: job.revocations.map(r => ({ ...r, verified_at: new Date(now).toISOString() })) })) };
  const service = new AccountMergeService(deps);
  const session = (subject: string, suffix = ''): MergeSession => ({ subject, sessionId: subject + suffix, emailHash: 'a'.repeat(64), createdAt: now, method: 'google' });
  async function start() {
    const status = await service.status(session('A'));
    if (!status.available) throw Error('Unavailable');
    return (await service.start(session('A'), status.candidates[0].id)).capability;
  }
  async function prove(cap: string, step: 'current' | 'other') {
    const previous = session(step === 'current' ? 'A' : 'B');
    await service.challenge(cap, previous, step); now += 2;
    const fresh = session(previous.subject, String(now)); await service.prove(cap, fresh); return fresh;
  }
  const confirmation: AccountLinkConfirmation = { confirmed: true, reviewVersion: 3, reviewHash: 'review', canonicalAccountId: 'PA', accountIds: ['PA', 'PB'], settingsAccountId: 'PB', credentialAccountId: 'PB' };
  return { service, deps, records, job, review, rpc, session, start, prove, confirmation, advance: (n: number) => { now += n; } };
}

describe('dual-proof merge orchestration', () => {
  it('returns opaque caller-bound suggestions, never raw subjects, email or counts', async () => {
    const f = fixture(), status = await f.service.status(f.session('A'));
    expect(status).toMatchObject({ operation: null, candidates: [{ id: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }] });
    expect(JSON.stringify(status)).not.toContain('profile_id');
    await expect(f.service.start(f.session('A'), 'B')).rejects.toMatchObject({ status: 403 });
    const other = await f.service.status(f.session('C'));
    expect(other.available && status.available && other.candidates[0].id).not.toBe(status.available && status.candidates[0].id);
  });
  it('requires two different exact subjects and new sessions, and never authorizes from matching email alone', async () => {
    const f = fixture(), cap = await f.start();
    await expect(f.service.prove(cap, f.session('B'))).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
    await f.service.challenge(cap, f.session('A'), 'current');
    await expect(f.service.prove(cap, f.session('A'))).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
    f.advance(2);
    await expect(f.service.prove(cap, f.session('B', 'new'))).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
    await f.service.prove(cap, f.session('A', 'new'));
    await expect(f.service.confirm(cap, f.session('A', 'new'), f.confirmation)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
    expect(f.rpc.mock.calls.filter(([name]) => name === 'server_merge_freeze')).toHaveLength(0);
  });
  it('rejects tampered capabilities, wrong browser operation and a switched third account', async () => {
    const f = fixture(), cap = await f.start();
    await expect(f.service.status(f.session('A'), cap.slice(0, -1) + (cap.endsWith('A') ? 'B' : 'A'))).rejects.toMatchObject({ status: 403 });
    await expect(f.service.status(f.session('C'), cap)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.challenge(cap, f.session('C'), 'current')).rejects.toMatchObject({ status: 403 });
  });
  it('consumes proof challenges, rejects callback replay and expired control proofs', async () => {
    const f = fixture(), cap = await f.start(), first = await f.prove(cap, 'current');
    await expect(f.service.prove(cap, first)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
    await f.prove(cap, 'other'); f.advance(300001);
    await expect(f.service.confirm(cap, f.session('B'), f.confirmation)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
  });
  it('allows a new dual-proof ceremony after expiry without reusing the stale other proof', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); await f.prove(cap, 'other');
    f.advance(300001);
    await f.prove(cap, 'current');
    const status = await f.service.status(f.session('A'), cap);
    expect(status).toMatchObject({ operation: { phase: 'proofs_pending', nextStep: 'other', proofsCompleted: 1 } });
  });
  it('rejects blocked or origin-stale identities before discovery, creation or proof writes', async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ state: 'reauthentication_required' } as never);
    await expect(f.service.status(f.session('A'))).rejects.toMatchObject({ code: 'PROOF_EXPIRED', status: 401 });
    expect(f.rpc.mock.calls.some(([name]) => name === 'server_merge_candidates')).toBe(false);
  });
  it('checks exact pair, review version/hash, canonical owner and explicit choices before freezing', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); const b = await f.prove(cap, 'other');
    for (const patch of [{ reviewHash: 'other' }, { reviewVersion: 0 }, { canonicalAccountId: 'PB' }, { accountIds: ['PA', 'PA'] }]) {
      await expect(f.service.confirm(cap, b, { ...f.confirmation, ...patch } as AccountLinkConfirmation)).rejects.toMatchObject({ code: 'REVIEW_CHANGED' });
    }
    for (const patch of [{ settingsAccountId: undefined }, { credentialAccountId: undefined }, { settingsAccountId: 'foreign' }]) {
      await expect(f.service.confirm(cap, b, { ...f.confirmation, ...patch })).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    expect(f.rpc.mock.calls.some(([name]) => name === 'server_merge_freeze')).toBe(false);
  });
  it('orders freeze, credential re-encryption, prepare, durable revocation and finish; retries do not duplicate transfer', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); const b = await f.prove(cap, 'other');
    const result = await f.service.confirm(cap, b, f.confirmation);
    expect(result.available && result.operation?.phase).toBe('completed');
    expect(f.deps.reencrypt).toHaveBeenCalledWith('PB', 'cipherB', 'PA');
    const names = f.rpc.mock.calls.map(([name]) => name);
    expect(names.indexOf('server_merge_freeze')).toBeLessThan(names.indexOf('server_merge_prepare'));
    expect(names.indexOf('server_merge_prepare')).toBeLessThan(names.indexOf('server_merge_finish'));
    await f.service.resume(cap);
    expect(f.rpc.mock.calls.filter(([name]) => name === 'server_merge_prepare')).toHaveLength(1);
  });
  it('keeps a failed prepared job fenced and resumes after process restart without another proof or ciphertext rewrite', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); const b = await f.prove(cap, 'other');
    vi.mocked(f.deps.revoke).mockRejectedValueOnce(Error('provider unavailable'));
    await expect(f.service.confirm(cap, b, f.confirmation)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(f.job.state).toBe('reconcile_required'); expect(f.job.frozen_at).not.toBeNull();
    await expect(f.service.cancel(cap, null)).rejects.toMatchObject({ code: 'CONFLICT' });
    const restarted = new AccountMergeService(f.deps);
    const status = await restarted.resume(cap);
    expect(status.available && status.operation?.phase).toBe('completed');
    expect(f.deps.reencrypt).toHaveBeenCalledTimes(1);
  });
  it('persists the authorized creation intent before SQL, and reconciles a lost creation acknowledgement', async () => {
    const f = fixture();
    const original = f.rpc.getMockImplementation()!;
    let lose = true;
    f.rpc.mockImplementation(async name => {
      if (name === 'server_merge_create_guarded' && lose) { lose = false; throw Error('Unknown create outcome'); }
      return original(name);
    });
    const cap = await f.start();
    expect([...f.records.values()][0].jobId).toBe('');
    await f.service.runPending();
    expect([...f.records.values()][0].jobId).toBe('job');
    expect(f.job.frozen_at).toBeNull();
    f.advance(24 * 60 * 60_000 + 1);
    await f.service.runPending();
    expect(f.job.state).toBe('cancelled');
    expect([...f.records.values()][0].workerDone).toBe(true);
    await expect(f.service.resume(cap)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
  });
  it('does not create a SQL job when durable intent storage fails', async () => {
    const f = fixture(); f.deps.store.create = async () => { throw Error('Storage unavailable'); };
    await expect(f.start()).rejects.toThrow('Storage unavailable');
    expect(f.rpc.mock.calls.some(([name]) => name === 'server_merge_create_guarded')).toBe(false);
  });
  it('a worker can complete a frozen job after browser capability expiry without unfreezing a failure', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); const b = await f.prove(cap, 'other');
    vi.mocked(f.deps.revoke).mockRejectedValueOnce(Error('temporary'));
    await expect(f.service.confirm(cap, b, f.confirmation)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    f.advance(24 * 60 * 60_000 + 1);
    await expect(f.service.resume(cap)).rejects.toMatchObject({ code: 'PROOF_EXPIRED' });
    await f.service.runPending();
    expect(f.job.state).toBe('completed');
  });
  it('abandons an expired never-created intent only after authoritative DB absence and expiry', async () => {
    const f = fixture(); const original = f.deps.rpc; let expired = false;
    f.deps.rpc = async (name, args) => {
      if (name === 'server_merge_create_guarded') throw Error('Creation rejected');
      if (name === 'server_merge_lookup_guarded') return { job: null, expired } as never;
      return original(name, args);
    };
    await f.start();
    await f.service.runPending(); expect([...f.records.values()][0].workerDone).not.toBe(true);
    expired = true; f.advance(24 * 60 * 60_000 + 1);
    await f.service.runPending();
    expect([...f.records.values()][0]).toMatchObject({ workerDone: true, creationAbandoned: true, jobId: '' });
    expect(f.rpc.mock.calls.some(([name]) => name === 'server_merge_freeze')).toBe(false);
  });
  it('rotates five failed creation intents so a later frozen job still completes', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); const b = await f.prove(cap, 'other');
    vi.mocked(f.deps.revoke).mockRejectedValueOnce(Error('temporary'));
    await expect(f.service.confirm(cap, b, f.confirmation)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const actual = [...f.records.values()][0]; f.records.clear();
    for (let n = 0; n < 5; n++) f.records.set('bad-' + n, { ...structuredClone(actual), id: 'bad-' + n, actor: 'bad-' + n, jobId: '' });
    f.records.set(actual.id, actual);
    const rpc = f.deps.rpc;
    f.deps.rpc = async (name, args) => { if (name === 'server_merge_create_guarded') throw Error('Conflicting participant'); return rpc(name, args); };
    expect(await f.service.runPending(5)).toMatchObject({ pending: 5, deferred: 1 });
    await f.service.runPending(5);
    expect(f.job.state).toBe('completed');
  });
  it('worker cannot freeze an unconfirmed job and never merges on discovery', async () => {
    const f = fixture(); await f.start();
    await f.service.runPending();
    expect(f.job.frozen_at).toBeNull();
    expect(f.rpc.mock.calls.some(([name]) => name === 'server_merge_prepare' || name === 'server_merge_freeze')).toBe(false);
  });
  it('stops completion redirect after a fresh canonical login', async () => {
    const f = fixture(), cap = await f.start(); await f.prove(cap, 'current'); const b = await f.prove(cap, 'other');
    await f.service.confirm(cap, b, f.confirmation); f.advance(3000);
    expect(await f.service.status(f.session('B', 'new-login'), cap)).toMatchObject({ operation: null });
  });
});
