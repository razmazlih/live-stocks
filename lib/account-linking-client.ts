'use client';

import { z } from 'zod';
import { resetSupabaseClient } from '@/lib/supabase';
import type { AccountLinkFailureCode, AccountLinkStatus } from '@/types/account-linking';

const id = z.string().min(1).max(256);
const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const method = z.enum(['google', 'password', 'other']);
const count = z.number().int().nonnegative();
const counts = z.object({ positions: count, lots: count, plans: count, watchlistGroups: count, watchlistTickers: count });
const account = z.object({ id, method, counts });
const review = z.object({
  version: z.number().int().nonnegative(), hash: z.string().min(1).max(256), canonicalAccountId: id,
  accounts: z.tuple([account, account]),
  settings: z.object({ conflict: z.boolean(), choices: z.array(z.object({ accountId: id, currency: z.string().max(12), refreshInterval: z.number().int().nonnegative(), annualGrowthRate: z.number().finite() })).max(2) }),
  credential: z.object({ conflict: z.boolean(), choices: z.array(z.object({ accountId: id, configured: z.boolean() })).max(2) }),
}).refine((value) => {
  const accounts = new Set(value.accounts.map((item) => item.id));
  return accounts.size === 2 && accounts.has(value.canonicalAccountId)
    && value.settings.choices.every((choice) => accounts.has(choice.accountId))
    && value.credential.choices.every((choice) => accounts.has(choice.accountId))
    && (!value.settings.conflict || new Set(value.settings.choices.map((choice) => choice.accountId)).size === 2)
    && (!value.credential.conflict || new Set(value.credential.choices.map((choice) => choice.accountId)).size === 2);
});
const operation = z.union([
  z.object({ id: opaqueId, phase: z.literal('proofs_pending'), nextStep: z.enum(['current', 'other']), proofsCompleted: z.union([z.literal(0), z.literal(1)]), canCancel: z.literal(true), expiresAt: z.string().datetime() }),
  z.object({ id: opaqueId, phase: z.literal('review_ready'), review, canCancel: z.literal(true) }),
  z.object({ id: opaqueId, phase: z.enum(['frozen', 'db_prepared', 'revocation_pending', 'ready_to_activate', 'reconcile_required']), canCancel: z.literal(false), resumable: z.boolean() }),
  z.object({ id: opaqueId, phase: z.literal('completed'), canCancel: z.literal(false), signInUrl: z.string().min(1).max(2048) }),
  z.object({ id: opaqueId, phase: z.enum(['cancelled', 'expired']), canCancel: z.literal(false) }),
]);
const statusSchema = z.union([
  z.object({ available: z.literal(false) }),
  z.object({ available: z.literal(true), linkedMethods: z.array(method).max(10), candidates: z.array(z.object({ id: opaqueId })).max(20), operation: operation.nullable() }),
]);

export class AccountLinkRequestError extends Error {
  constructor(public readonly code: AccountLinkFailureCode | 'INVALID_RESPONSE' | 'INVALID_NAVIGATION') {
    super(code);
  }
}

async function request(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/account/link/${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal,
    // Reject unexpected redirects instead of forwarding a mutation or following a provider URL.
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (path === 'status' && [404, 501].includes(response.status)) return { available: false };
  const value = await response.json().catch(() => null);
  if (path === 'status' && response.status === 503 && value?.code === 'NOT_READY') return { available: false };
  if (!response.ok) {
    const codes = ['PROOF_EXPIRED', 'REVIEW_CHANGED', 'NOT_READY', 'CONFLICT', 'UNAVAILABLE'];
    throw new AccountLinkRequestError(codes.includes(value?.code) ? value.code : 'UNAVAILABLE');
  }
  return value;
}

export async function requestAccountLinkStatus(path: string, signal: AbortSignal, body?: unknown): Promise<AccountLinkStatus> {
  const parsed = statusSchema.safeParse(await request(path, signal, body));
  if (!parsed.success) throw new AccountLinkRequestError('INVALID_RESPONSE');
  return parsed.data;
}

export async function requestAccountLinkReauthentication(operationId: string, step: 'current' | 'other', signal: AbortSignal): Promise<string> {
  const parsed = z.object({ reauthUrl: z.string().min(1).max(2048) }).safeParse(await request(`${encodeURIComponent(operationId)}/reauth`, signal, { step }));
  if (!parsed.success) throw new AccountLinkRequestError('INVALID_RESPONSE');
  return parsed.data.reauthUrl;
}

export function resolveAccountLinkDestination(value: string, origin: string): string {
  if (!value || value.trim() !== value || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) throw new AccountLinkRequestError('INVALID_NAVIGATION');
  if (!value.startsWith('/') && !/^https?:\/\//.test(value)) throw new AccountLinkRequestError('INVALID_NAVIGATION');
  const url = new URL(value, origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new AccountLinkRequestError('INVALID_NAVIGATION');
  // Do not permit encoded authority/backslash forms to become a later redirect escape.
  const decodedPath = decodeURIComponent(url.pathname);
  if (decodedPath.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) throw new AccountLinkRequestError('INVALID_NAVIGATION');
  return `${url.pathname}${url.search}${url.hash}`;
}

export const accountLinkNavigation = { assign: (destination: string) => window.location.assign(destination) };

export function navigateAccountLink(value: string, completed = false): void {
  const destination = resolveAccountLinkDestination(value, window.location.origin);
  if (completed) {
    resetSupabaseClient();
    try { localStorage.setItem('livestocks:account-change', `logout:${Date.now()}`); } catch { /* Storage may be unavailable. */ }
    window.dispatchEvent(new Event('livestocks:session-invalid'));
  }
  accountLinkNavigation.assign(destination);
}
