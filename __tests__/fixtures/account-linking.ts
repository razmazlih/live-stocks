import type { AccountLinkOperation, AccountLinkReview, AccountLinkStatus } from '@/types/account-linking';

export const linkReview: AccountLinkReview = {
  version: 3, hash: 'synthetic-review-hash', canonicalAccountId: 'account-a',
  accounts: [
    { id: 'account-a', method: 'password', counts: { positions: 4, lots: 8, plans: 1, watchlistGroups: 2, watchlistTickers: 5 } },
    { id: 'account-b', method: 'google', counts: { positions: 2, lots: 3, plans: 0, watchlistGroups: 1, watchlistTickers: 2 } },
  ],
  settings: { conflict: true, choices: [
    { accountId: 'account-a', currency: 'USD', refreshInterval: 15, annualGrowthRate: 0.06 },
    { accountId: 'account-b', currency: 'ILS', refreshInterval: 60, annualGrowthRate: 0.08 },
  ] },
  credential: { conflict: true, choices: [{ accountId: 'account-a', configured: true }, { accountId: 'account-b', configured: true }] },
};

export function linkStatus(operation: AccountLinkOperation | null = null): AccountLinkStatus {
  return { available: true, linkedMethods: ['password'], candidates: [{ id: 'opaque-candidate' }], operation };
}

export const linkProof: AccountLinkOperation = {
  id: 'operation-1', phase: 'proofs_pending', nextStep: 'other', proofsCompleted: 1,
  expiresAt: '2026-11-14T18:00:00.000Z', canCancel: true,
};
export const linkReady = () => linkStatus({ id: 'operation-1', phase: 'review_ready', canCancel: true, review: structuredClone(linkReview) });
