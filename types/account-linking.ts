/** Provider-independent public DTO. No email, subjects or portfolio counts in candidates. */
export type AccountLinkCandidate = { id: string };
export type LinkedSignInMethod = 'google' | 'password' | 'other';
export type AccountLinkCounts = {
  positions: number;
  lots: number;
  plans: number;
  watchlistGroups: number;
  watchlistTickers: number;
};
export type AccountLinkReview = {
  version: number;
  hash: string;
  canonicalAccountId: string;
  accounts: [{ id: string; method: LinkedSignInMethod; counts: AccountLinkCounts }, { id: string; method: LinkedSignInMethod; counts: AccountLinkCounts }];
  settings: { conflict: boolean; choices: { accountId: string; currency: string; refreshInterval: number; annualGrowthRate: number }[] };
  credential: { conflict: boolean; choices: { accountId: string; configured: boolean }[] };
};

export type AccountLinkOperation =
  | { id: string; phase: 'proofs_pending'; nextStep: 'current' | 'other'; proofsCompleted: 0 | 1; canCancel: true; expiresAt: string }
  | { id: string; phase: 'review_ready'; review: AccountLinkReview; canCancel: true }
  | { id: string; phase: 'frozen' | 'db_prepared' | 'revocation_pending' | 'ready_to_activate' | 'reconcile_required'; canCancel: false; resumable: boolean }
  | { id: string; phase: 'completed'; canCancel: false; signInUrl: string }
  | { id: string; phase: 'cancelled' | 'expired'; canCancel: false };

export type AccountLinkStatus =
  | { available: false }
  | { available: true; linkedMethods: LinkedSignInMethod[]; candidates: AccountLinkCandidate[]; operation: AccountLinkOperation | null };

export type AccountLinkConfirmation = {
  reviewVersion: number;
  reviewHash: string;
  accountIds: [string, string];
  canonicalAccountId: string;
  settingsAccountId?: string;
  credentialAccountId?: string;
  confirmed: true;
};

/** Returned only after a same-origin, CSRF-protected POST. Never contains provider URLs or tokens. */
export type AccountLinkReauthentication = { reauthUrl: string };
export type AccountLinkFailureCode = 'PROOF_EXPIRED' | 'REVIEW_CHANGED' | 'NOT_READY' | 'CONFLICT' | 'UNAVAILABLE';

/**
 * GET /api/account/link/status -> AccountLinkStatus
 * POST /api/account/link/start { candidateId } -> AccountLinkStatus
 * POST /api/account/link/:id/reauth { step: 'current' | 'other' } -> AccountLinkReauthentication
 * POST /api/account/link/:id/confirm AccountLinkConfirmation -> AccountLinkStatus
 * POST /api/account/link/:id/resume {} -> AccountLinkStatus
 * POST /api/account/link/:id/cancel {} -> AccountLinkStatus
 * Failed responses: { code: AccountLinkFailureCode }; never display raw provider errors.
 * The server owns candidate/proof bindings, CSRF checks, permissions, review integrity and idempotency.
 */
