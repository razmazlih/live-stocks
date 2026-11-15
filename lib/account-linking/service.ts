import 'server-only';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AccountLinkConfirmation, AccountLinkReview, AccountLinkStatus, LinkedSignInMethod } from '@/types/account-linking';

export class AccountMergeError extends Error {
  constructor(public code: 'PROOF_EXPIRED' | 'REVIEW_CHANGED' | 'NOT_READY' | 'CONFLICT' | 'UNAVAILABLE', public status = 409) { super(code); }
}
export type MergeSession = { subject: string; sessionId: string; createdAt: number; emailHash: string; method: LinkedSignInMethod };
export type MergeJob = {
  id: string; issuer: string; actor_subject: string; other_subject: string; primary_profile_id: string; secondary_profile_id: string;
  state: 'proofs_pending' | 'review_ready' | 'frozen' | 'prepared' | 'revocation_pending' | 'reconcile_required' | 'completed' | 'cancelled';
  version: number; frozen_at: string | null; data_prepared_at: string | null; completed_at: string | null;
  revocations: { subject: string; client_id: string }[];
};
export type MergeCeremony = {
  id: string; jobId: string; issuer: string; actor: string; other: string; actorProfileId: string; capabilityHash: string; createdAt: number; expiresAt: number;
  proofs: Partial<Record<'current' | 'other', MergeSession>>;
  challenge?: { step: 'current' | 'other'; nonce: string; createdAt: number; priorSessionId?: string };
  review?: AccountLinkReview; workerDone?: boolean; creationAbandoned?: boolean; workerReady?: boolean;
};
export type MergeStore = {
  create(value: MergeCeremony): Promise<void>;
  locked<T>(id: string, operation: (value: MergeCeremony) => Promise<T>): Promise<T>;
  pending(limit: number): Promise<string[]>;
};
export type MergeDependencies = {
  issuer: string; secret: string; now(): number; store: MergeStore;
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>;
  review(job: MergeJob, preview: Record<string, unknown>, proofs: MergeCeremony['proofs']): Promise<AccountLinkReview>;
  reencrypt(aad: string, ciphertext: string, canonical: string): string;
  revoke(job: MergeJob): Promise<{ revoked: { subject: string; client_id: string; verified_at: string }[] }>;
};
export const MERGE_PROOF_LIFETIME = 5 * 60_000;
export const MERGE_CAPABILITY_LIFETIME = 24 * 60 * 60_000;
export const hashMergeCapability = (value: string) => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function parseMergeCapability(value: string | undefined): { id: string; secret: string } | null {
  const parts = value?.split('.') ?? [];
  return parts.length === 2 && uuid.test(parts[0]) && /^[A-Za-z0-9_-]{43}$/.test(parts[1]) ? { id: parts[0], secret: parts[1] } : null;
}

/** Browser inputs identify an operation; they never identify an authorized owner. */
export class AccountMergeService {
  constructor(private readonly d: MergeDependencies) {}
  private candidate(subject: string, other: string): string {
    return createHmac('sha256', this.d.secret).update(JSON.stringify(['livestocks:merge-candidate:v1', this.d.issuer, subject, other])).digest('base64url');
  }
  private async active(session: MergeSession) {
    const identity = await this.d.rpc<{ state: string; profile_id: string }>('server_identity_resolve', {
      p_issuer: this.d.issuer, p_subject: session.subject, p_auth_session_created_at: Math.floor(session.createdAt / 1000),
    });
    if (identity?.state !== 'active') throw new AccountMergeError('PROOF_EXPIRED', 401);
    return identity;
  }
  private async candidates(session: MergeSession) {
    return this.d.rpc<{ subject: string; profile_id: string }[]>('server_merge_candidates', { p_issuer: this.d.issuer, p_subject: session.subject });
  }
  private authorized(c: MergeCeremony, capability: string) {
    const parsed = parseMergeCapability(capability);
    if (!parsed || parsed.id !== c.id || c.issuer !== this.d.issuer
      || !timingSafeEqual(Buffer.from(hashMergeCapability(parsed.secret)), Buffer.from(c.capabilityHash))) throw new AccountMergeError('CONFLICT', 403);
    if (c.expiresAt <= this.d.now()) throw new AccountMergeError('PROOF_EXPIRED', 403);
  }
  private participant(c: MergeCeremony, session: MergeSession | null) {
    if (session && ![c.actor, c.other].includes(session.subject)) throw new AccountMergeError('CONFLICT', 403);
  }
  private async recoverCreation(c: MergeCeremony): Promise<boolean> {
    if (c.jobId) return true;
    if (c.creationAbandoned) return false;
    // The request/pair was persisted by an authorized start before this idempotent call.
    const args = { p_issuer: c.issuer, p_actor_subject: c.actor, p_other_subject: c.other, p_request_id: c.id,
      p_expires_at: new Date(c.expiresAt).toISOString() };
    let created: MergeJob & { already_merged?: boolean };
    try { created = await this.d.rpc('server_merge_create_guarded', args); }
    catch {
      // Same request lock waits for an in-flight creation. DB expiry also rejects any late request.
      const observed = await this.d.rpc<{ job: MergeJob | null; expired: boolean }>('server_merge_lookup_guarded', args);
      if (observed.job) created = observed.job;
      else if (observed.expired === true) { c.workerDone = true; c.creationAbandoned = true; return false; }
      else throw new AccountMergeError('UNAVAILABLE', 503);
    }
    if (created.already_merged) { c.workerDone = true; c.creationAbandoned = true; return false; }
    if (!created.id || created.issuer !== c.issuer || created.actor_subject !== c.actor || created.other_subject !== c.other) throw new AccountMergeError('CONFLICT');
    c.jobId = created.id;
    return true;
  }
  private async job(c: MergeCeremony) {
    const j = await this.d.rpc<MergeJob>('server_merge_read', { p_job_id: c.jobId });
    if (!j || j.issuer !== c.issuer || j.actor_subject !== c.actor || j.other_subject !== c.other) throw new AccountMergeError('CONFLICT', 403);
    return j;
  }
  private locked<T>(capability: string, operation: (c: MergeCeremony) => Promise<T>) {
    const parsed = parseMergeCapability(capability);
    if (!parsed) throw new AccountMergeError('CONFLICT', 403);
    return this.d.store.locked(parsed.id, async c => { this.authorized(c, capability); return operation(c); });
  }
  private async view(c: MergeCeremony, session: MergeSession | null): Promise<AccountLinkStatus> {
    this.participant(c, session);
    const base = { available: true as const, linkedMethods: session ? [session.method] : [], candidates: [] };
    if (!c.jobId) return { ...base, operation: c.creationAbandoned
      ? { id: c.id, phase: 'cancelled', canCancel: false }
      : { id: c.id, phase: 'proofs_pending', nextStep: 'current', proofsCompleted: 0, canCancel: true, expiresAt: new Date(c.expiresAt).toISOString() } };
    const j = await this.job(c);
    if (j.state === 'completed') {
      c.workerDone = true;
      // A new authenticated session must not be sent back into a completion/sign-in loop.
      if (session) {
        const resolved = await this.d.rpc<{ state: string; profile_id: string }>('server_identity_resolve', {
          p_issuer: c.issuer, p_subject: session.subject, p_auth_session_created_at: Math.floor(session.createdAt / 1000),
        });
        if (resolved.state === 'active' && resolved.profile_id === j.primary_profile_id) return { ...base, operation: null };
      }
      return { ...base, operation: { id: c.id, phase: 'completed', canCancel: false, signInUrl: '/sign-in?returnTo=%2Fsettings' } };
    }
    if (j.state === 'cancelled') { c.workerDone = true; return { ...base, operation: { id: c.id, phase: 'cancelled', canCancel: false } }; }
    if (j.frozen_at) return { ...base, operation: { id: c.id, phase: j.state === 'prepared' ? 'db_prepared' : j.state as 'frozen' | 'revocation_pending' | 'reconcile_required', canCancel: false, resumable: true } };
    const fresh = (proof?: MergeSession) => proof && proof.createdAt > this.d.now() - MERGE_PROOF_LIFETIME;
    if (c.review && fresh(c.proofs.current) && fresh(c.proofs.other) && c.review.version === j.version) {
      return { ...base, operation: { id: c.id, phase: 'review_ready', canCancel: true, review: c.review } };
    }
    const current = Boolean(fresh(c.proofs.current));
    return { ...base, operation: { id: c.id, phase: 'proofs_pending', nextStep: current ? 'other' : 'current', proofsCompleted: current ? 1 : 0,
      canCancel: true, expiresAt: new Date(Math.min(c.expiresAt, this.d.now() + MERGE_PROOF_LIFETIME)).toISOString() } };
  }
  async recoverable(capability: string): Promise<boolean> {
    return this.locked(capability, async c => c.jobId ? Boolean((await this.job(c)).frozen_at) : false);
  }
  async status(session: MergeSession | null, capability?: string): Promise<AccountLinkStatus> {
    if (capability) return this.locked(capability, c => this.view(c, session));
    if (!session) throw new AccountMergeError('CONFLICT', 401);
    await this.active(session);
    return { available: true, linkedMethods: [session.method], candidates: (await this.candidates(session)).slice(0, 20).map(c => ({ id: this.candidate(session.subject, c.subject) })), operation: null };
  }
  async start(session: MergeSession, candidateId: string) {
    const identity = await this.active(session);
    const candidate = (await this.candidates(session)).find(c => this.candidate(session.subject, c.subject) === candidateId);
    if (!candidate) throw new AccountMergeError('CONFLICT', 403);
    const id = randomUUID(), secret = randomBytes(32).toString('base64url');
    const c: MergeCeremony = { id, jobId: '', issuer: this.d.issuer, actor: session.subject, other: candidate.subject, actorProfileId: identity.profile_id,
      capabilityHash: hashMergeCapability(secret), createdAt: this.d.now(), expiresAt: this.d.now() + MERGE_CAPABILITY_LIFETIME, proofs: {} };
    // Persist the intent first. A failed/lost SQL response is now discoverable by the worker.
    await this.d.store.create(c);
    const status = await this.d.store.locked(id, async value => {
      try { await this.recoverCreation(value); } catch { /* The durable intent remains pending, with no financial changes. */ }
      return this.view(value, session);
    });
    return { capability: `${id}.${secret}`, status };
  }

  async challenge(capability: string, session: MergeSession | null, step: 'current' | 'other') {
    return this.locked(capability, async c => {
      this.participant(c, session);
      if (!await this.recoverCreation(c)) throw new AccountMergeError('CONFLICT');
      const j = await this.job(c);
      if (j.frozen_at || j.state === 'cancelled') throw new AccountMergeError('CONFLICT');
      if (step === 'other' && (!c.proofs.current || c.proofs.current.createdAt <= this.d.now() - MERGE_PROOF_LIFETIME)) throw new AccountMergeError('PROOF_EXPIRED');
      if (step === 'current') c.proofs = {}; else delete c.proofs.other;
      const nonce = randomBytes(32).toString('base64url');
      c.challenge = { step, nonce, createdAt: this.d.now(), priorSessionId: session?.sessionId };
      delete c.review;
      return { reauthUrl: `/sign-in?returnTo=${encodeURIComponent(`/api/account/link/${c.id}/callback`)}` };
    });
  }
  async prove(capability: string, session: MergeSession) {
    await this.active(session);
    return this.locked(capability, async c => {
      const challenge = c.challenge;
      if (!challenge || challenge.createdAt <= this.d.now() - MERGE_PROOF_LIFETIME || session.createdAt < challenge.createdAt
        || session.createdAt > this.d.now() + 5000 || session.sessionId === challenge.priorSessionId
        || session.subject !== (challenge.step === 'current' ? c.actor : c.other)) throw new AccountMergeError('PROOF_EXPIRED', 403);
      await this.d.rpc('server_merge_proof', { p_job_id: c.jobId, p_subject: session.subject, p_email_hash: session.emailHash,
        p_auth_time: Math.floor(session.createdAt / 1000), p_nonce_hash: hashMergeCapability(challenge.nonce) });
      c.proofs[challenge.step] = session;
      delete c.challenge;
      if (c.proofs.current && c.proofs.other) {
        const j = await this.job(c);
        const preview = await this.d.rpc<Record<string, unknown>>('server_merge_preview', { p_job_id: c.jobId });
        const review = await this.d.review(j, preview, c.proofs);
        const checked = await this.d.rpc<Record<string, unknown>>('server_merge_preview', { p_job_id: c.jobId });
        if (checked.preview_hash !== preview.preview_hash || checked.version !== preview.version) throw new AccountMergeError('REVIEW_CHANGED');
        c.review = review;
      }
      return this.view(c, session);
    });
  }
  async confirm(capability: string, session: MergeSession | null, body: AccountLinkConfirmation) {
    const ready = await this.locked(capability, async c => {
      this.participant(c, session);
      const j = await this.job(c);
      if (j.frozen_at) return true; // A retry resumes the durable choice; never replaces it.
      const r = c.review;
      if (!session || !Object.values(c.proofs).some(p => p.sessionId === session.sessionId) || !r
        || Object.values(c.proofs).length !== 2 || Object.values(c.proofs).some(p => p.createdAt <= this.d.now() - MERGE_PROOF_LIFETIME)) throw new AccountMergeError('PROOF_EXPIRED');
      if (body.confirmed !== true || body.reviewHash !== r.hash || body.reviewVersion !== r.version || body.canonicalAccountId !== r.canonicalAccountId
        || body.accountIds.length !== 2 || new Set(body.accountIds).size !== 2 || !r.accounts.every(a => body.accountIds.includes(a.id))) throw new AccountMergeError('REVIEW_CHANGED');
      const settings = body.settingsAccountId ?? (r.settings.choices.length === 1 ? r.settings.choices[0].accountId : undefined);
      const keys = r.credential.choices.filter(x => x.configured);
      const credential = body.credentialAccountId ?? (keys.length === 1 ? keys[0].accountId : null);
      if (!settings || !r.settings.choices.some(x => x.accountId === settings) || (keys.length > 0 && !keys.some(x => x.accountId === credential))
        || (keys.length === 0 && credential !== null)) throw new AccountMergeError('CONFLICT');
      try {
        await this.d.rpc('server_merge_freeze', { p_job_id: c.jobId, p_expected_version: r.version, p_preview_hash: r.hash,
          p_settings_source_profile_id: settings, p_credential_source_profile_id: credential });
      } catch {
        if ((await this.job(c)).frozen_at) { c.workerReady = true; return true; }
        const preview = await this.d.rpc<Record<string, unknown>>('server_merge_preview', { p_job_id: c.jobId });
        c.review = await this.d.review(j, preview, c.proofs);
        return false;
      }
      c.workerReady = true;
      return true;
    });
    if (!ready) throw new AccountMergeError('REVIEW_CHANGED');
    return this.resume(capability);
  }
  async cancel(capability: string, session: MergeSession | null) {
    return this.locked(capability, async c => {
      this.participant(c, session);
      if (!await this.recoverCreation(c)) return this.view(c, session);
      const j = await this.job(c);
      if (j.frozen_at) throw new AccountMergeError('CONFLICT');
      await this.d.rpc('server_merge_fail', { p_job_id: c.jobId, p_reason: 'user_cancelled' });
      return this.view(c, session);
    });
  }
  async resume(capability: string) {
    return this.locked(capability, async c => { await this.work(c); return this.view(c, null); });
  }
  /** A scheduler can retry stored jobs without a browser cookie; it can replay an authorized creation intent but cannot freeze a job. */
  async runPending(limit = 20, budgetMs = 15_000) {
    const maximum = Math.min(Math.max(Math.floor(limit), 1), 20), deadline = this.d.now() + Math.min(Math.max(budgetMs, 100), 20_000);
    const ids = await this.d.store.pending(maximum + 1);
    let processed = 0, pending = 0, deferred = 0;
    for (let index = 0; index < ids.length; index++) {
      if (index >= maximum || this.d.now() >= deadline) { deferred += ids.length - index; break; }
      try {
        const done = await this.d.store.locked(ids[index], async c => {
          // Commit every attempt's timestamp, including failed creation/lookups, to avoid queue starvation.
          try {
            if (c.workerDone) return true;
            if (c.issuer !== this.d.issuer) throw new AccountMergeError('CONFLICT');
            if (!await this.recoverCreation(c)) return true;
            const job = await this.job(c);
            if (!job.frozen_at && c.expiresAt <= this.d.now()) {
              await this.d.rpc('server_merge_fail', { p_job_id: c.jobId, p_reason: 'proof_ceremony_expired' });
              c.workerDone = true;
              return true;
            }
            if (job.state === 'cancelled') c.workerDone = true;
            else if (job.frozen_at) await this.work(c);
            return true;
          } catch { return false; }
        });
        if (done) processed++; else pending++;
      } catch { pending++; }
    }
    return { processed, pending, deferred };
  }
  private async work(c: MergeCeremony) {
    let j = await this.job(c);
    if (j.state === 'completed') { c.workerDone = true; return; }
    if (!j.frozen_at) throw new AccountMergeError('CONFLICT');
    try {
      if (!j.data_prepared_at) {
        const material = await this.d.rpc<{ selected_ciphertext: string | null; selected_aad_subject: string | null; canonical_profile_id: string; credential_version: string | null }>('server_merge_secret_material', { p_job_id: c.jobId });
        const encrypted = material.selected_ciphertext && material.selected_aad_subject
          ? this.d.reencrypt(material.selected_aad_subject, material.selected_ciphertext, material.canonical_profile_id) : null;
        j = await this.d.rpc<MergeJob>('server_merge_prepare', { p_job_id: c.jobId, p_encrypted_value: encrypted, p_credential_version: material.credential_version });
      }
      const receipt = await this.d.revoke(j);
      await this.d.rpc('server_merge_finish', { p_job_id: c.jobId, p_revocation_receipt: receipt });
      c.workerDone = true;
    } catch {
      // A lost acknowledgement may mean a stage committed. Read on retry; never undo the fence.
      try { await this.d.rpc('server_merge_fail', { p_job_id: c.jobId, p_reason: 'worker_retry_required' }); } catch { /* Preserve the original durable job for reconciliation. */ }
      throw new AccountMergeError('UNAVAILABLE', 503);
    }
  }
}
