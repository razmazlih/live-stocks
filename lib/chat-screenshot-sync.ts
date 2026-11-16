import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeSourceForSync } from '@/lib/server/investment-source-catalog';
import type { Principal } from '@/lib/auth/server';
import { mapPositionRow } from '@/lib/positions';
import { buildScreenshotSyncPlan, screenshotSyncInputSchema, type ScreenshotSyncPlan } from '@/lib/screenshot-sync';

export class SyncScopeRequiredError extends Error {
  constructor() { super('יש לאשר הרשאת סנכרון מוגבלת ל־LiveStocks כדי להמשיך.'); }
}
export class ChatSyncUnavailableError extends Error {
  constructor() { super('ההצעה אינה זמינה או שהתיק השתנה. הכינו סקירה חדשה בצ׳אט.'); }
}
export const chatProposalIdSchema = z.object({ proposalId: z.string().uuid() }).strict();
export const chatConfirmationSchema = z.object({ proposalId: z.string().uuid(), confirmationSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
// Validate the optional previous ID separately because the existing holding input is strict.
export function parseChatPrepare(raw: unknown) {
  const wrapper = z.object({ previousProposalId: z.string().uuid().optional() }).passthrough().parse(raw);
  const { previousProposalId, ...input } = wrapper;
  return { input: screenshotSyncInputSchema.parse(input), previousProposalId };
}
function requireChat(principal: Principal, sync = false) {
  if (principal.kind !== 'mcp' || !principal.authSessionId || !principal.rawSubject) throw new ChatSyncUnavailableError();
  if (sync && !principal.portfolioSync) throw new SyncScopeRequiredError();
}
async function rpc(principal: Principal, name: string, args: Record<string, unknown>) {
  const { data, error } = await principal.supabase.rpc(name, args);
  if (error || data == null) throw new ChatSyncUnavailableError();
  return data;
}
const storedSchema = z.object({
  id: z.string().uuid(), status: z.enum(['pending', 'applied', 'cancelled', 'superseded']),
  expiresAt: z.string().datetime({ offset: true }),
  review: z.object({ input: screenshotSyncInputSchema, plan: z.object({
    location: z.string().uuid(), sourceName: z.string().trim().min(1), observedAt: z.string(), changes: z.array(z.unknown()), unchanged: z.array(z.unknown()), blocked: z.array(z.unknown()), canApply: z.boolean(),
  }).passthrough() }).passthrough(),
  receipt: z.unknown().optional(),
});
export function publicChatReview(raw: unknown) {
  const stored = storedSchema.parse(raw);
  return { proposalId: stored.id, input: stored.review.input, plan: stored.review.plan as ScreenshotSyncPlan,
    status: stored.status, expiresAt: stored.expiresAt, ...(stored.receipt ? { receipt: stored.receipt } : {}) };
}

/** Only the opaque one-use capability goes to host _meta, never model-visible output. */
export async function prepareChatScreenshotSync(principal: Principal, raw: unknown) {
  requireChat(principal, true);
  const { input, previousProposalId } = parseChatPrepare(raw);
  const snapshot = await rpc(principal, 'screenshot_sync_snapshot', {});
  if (!Array.isArray(snapshot.positions) || !Array.isArray(snapshot.lots) || !/^[a-f0-9]{32}$/.test(snapshot.fingerprint)) throw new ChatSyncUnavailableError();
  const positions = snapshot.positions.map((row: Parameters<typeof mapPositionRow>[0]) =>
    mapPositionRow({ ...row, position_lots: snapshot.lots.filter((lot: { position_id: string }) => lot.position_id === row.id) }));
  const source = activeSourceForSync(snapshot.sources, input.location);
  const plan = { ...buildScreenshotSyncPlan(input, positions), sourceName: source.name };
  if (!plan.canApply && previousProposalId) await rpc(principal, 'supersede_chat_sync_proposal', { p_id: previousProposalId });
  if (!plan.canApply) return { value: { input, plan, status: plan.blocked.length ? 'needs_details' : 'unchanged', instructions: plan.blocked.length ? 'יש להשלים רק את הפרטים החסרים. תאריך רכישה אינו חובה.' : 'היתרות כבר תואמות; לא נדרש שינוי.' } };
  const proposalId = randomUUID(), confirmationSecret = randomBytes(32).toString('base64url');
  const symbols = new Set(plan.changes.map(row => row.symbol));
  const rows = input.rows.filter(row => symbols.has(row.symbol)).map(row => ({ ...row,
    averageCostUsd: row.quantity === 0 ? 0 : row.averageCostUsd, estimatedAcquiredOn: row.estimatedAcquiredOn ?? null,
    observedAt: input.observedAt, location: input.location, lotId: randomUUID() }));
  const data = await rpc(principal, 'create_chat_sync_proposal', {
    p_id: proposalId, p_expected: snapshot.fingerprint, p_rows: rows, p_review: { input, plan },
    p_confirmation_hash: createHash('sha256').update(confirmationSecret).digest('hex'), p_previous_id: previousProposalId ?? null,
  });
  return { value: { ...publicChatReview(data), instructions: 'בדקו את השינויים ולחצו ״אישור סנכרון״ בכרטיס כאן בצ׳אט. אין צורך לפתוח אתר. תאריך חסר אינו מעכב.' },
    meta: { confirmationSecret } };
}
export async function reviewChatScreenshotSync(principal: Principal, raw: unknown) {
  requireChat(principal);
  const { proposalId } = chatProposalIdSchema.parse(raw);
  return publicChatReview(await rpc(principal, 'read_chat_sync_proposal', { p_id: proposalId }));
}
export async function confirmChatScreenshotSync(principal: Principal, raw: unknown) {
  requireChat(principal, true);
  const input = chatConfirmationSchema.parse(raw);
  const receipt = await rpc(principal, 'confirm_chat_sync_proposal', { p_id: input.proposalId, p_confirmation_secret: input.confirmationSecret });
  return { ...receipt, proposalId: input.proposalId, status: 'applied' as const };
}
export async function cancelChatScreenshotSync(principal: Principal, raw: unknown) {
  requireChat(principal);
  const input = chatConfirmationSchema.parse(raw);
  return publicChatReview(await rpc(principal, 'cancel_chat_sync_proposal', { p_id: input.proposalId, p_confirmation_secret: input.confirmationSecret }));
}
