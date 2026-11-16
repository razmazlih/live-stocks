import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Principal } from '@/lib/auth/server';
import { activeSourceForSync } from '@/lib/server/investment-source-catalog';
import { mapPositionRow } from '@/lib/positions';
import { chatConfirmationSchema, chatProposalIdSchema, refreshedPortfolio } from '@/lib/chat-screenshot-sync';
import { buildChatTransactionPlan, chatTransactionInputSchema, ChatTransactionPlanError, type ChatTransactionPlan } from '@/lib/chat-transactions';

export class TransactionScopeRequiredError extends Error {
  constructor() { super('כדי לרשום קנייה או מכירה שכבר ביצעת, צריך לאשר ל־LiveStocks הרשאה נפרדת לרישום עסקאות.'); }
}
export class ChatTransactionUnavailableError extends Error {
  constructor() { super('לא הצלחנו לפתוח את הפעולה הזו, או שהתיק השתנה בינתיים. אפשר להכין כרטיס חדש בצ׳אט.'); }
}
function requireChat(principal: Principal, write = false) {
  if (principal.kind !== 'mcp' || !principal.authSessionId || !principal.rawSubject) throw new ChatTransactionUnavailableError();
  if (write && !principal.scopes.includes('portfolio:transactions')) throw new TransactionScopeRequiredError();
}
async function rpc(principal: Principal, name: string, args: Record<string, unknown>) {
  const { data, error } = await principal.supabase.rpc(name, args);
  if (error || data == null) throw new ChatTransactionUnavailableError();
  return data;
}
const stored = z.object({ id: z.string().uuid(), status: z.enum(['pending', 'applied', 'cancelled', 'superseded']), expiresAt: z.string().datetime({ offset: true }), review: z.object({ input: chatTransactionInputSchema, plan: z.object({ canApply: z.literal(true) }).passthrough() }), receipt: z.unknown().optional() });
export function publicChatTransaction(raw: unknown) {
  const saved = stored.parse(raw);
  return { proposalId: saved.id, kind: 'transaction' as const, status: saved.status, expiresAt: saved.expiresAt, input: saved.review.input, plan: saved.review.plan as ChatTransactionPlan, ...(saved.receipt ? { receipt: saved.receipt } : {}) };
}
export async function prepareChatTransaction(principal: Principal, raw: unknown) {
  requireChat(principal, true);
  const input = chatTransactionInputSchema.parse(raw);
  const snapshot = await rpc(principal, 'screenshot_sync_snapshot', {});
  if (!Array.isArray(snapshot.positions) || !Array.isArray(snapshot.lots) || !/^[a-f0-9]{32}$/.test(snapshot.fingerprint)) throw new ChatTransactionUnavailableError();
  const mapped = snapshot.positions.map((row: Parameters<typeof mapPositionRow>[0] & { consolidated_into_position_id?: string | null }) => ({ row, position: mapPositionRow({ ...row, position_lots: snapshot.lots.filter((lot: { position_id: string }) => lot.position_id === row.id) }) }));
  if (mapped.some(({ row, position }: { row: { consolidated_into_position_id?: string | null }; position: ReturnType<typeof mapPositionRow> }) => row.consolidated_into_position_id && position.location === input.location && position.symbol.trim().toUpperCase() === input.symbol && position.quantity > 0)) throw new ChatTransactionPlanError('המניה מפוצלת לכמה רשומות בחשבון הזה. צריך לאחד אותן באתר לפני שמוסיפים פעולה.');
  const positions = mapped.filter(({ row }: { row: { consolidated_into_position_id?: string | null } }) => !row.consolidated_into_position_id).map(({ position }: { position: ReturnType<typeof mapPositionRow> }) => position);
  const source = activeSourceForSync(snapshot.sources, input.location);
  const plan = buildChatTransactionPlan(input, positions, source.name);
  const proposalId = randomUUID(), confirmationSecret = randomBytes(32).toString('base64url');
  const saved = await rpc(principal, 'create_chat_transaction_proposal', { p_id: proposalId, p_expected: snapshot.fingerprint, p_input: input, p_review: { input, plan }, p_confirmation_hash: createHash('sha256').update(confirmationSecret).digest('hex') });
  return { value: { ...publicChatTransaction(saved), instructions: 'הפעולה עדיין לא נשמרה. יש לבדוק את הפרטים וללחוץ על כפתור האישור בכרטיס. זו רשומה של עסקה שכבר בוצעה, לא הוראת מסחר.' }, meta: { confirmationSecret } };
}
export async function reviewChatTransaction(principal: Principal, raw: unknown) {
  requireChat(principal);
  return publicChatTransaction(await rpc(principal, 'read_chat_transaction_proposal', { p_id: chatProposalIdSchema.parse(raw).proposalId }));
}
export async function confirmChatTransaction(principal: Principal, raw: unknown) {
  requireChat(principal, true);
  const input = chatConfirmationSchema.parse(raw);
  const receipt = await rpc(principal, 'confirm_chat_transaction_proposal', { p_id: input.proposalId, p_confirmation_secret: input.confirmationSecret });
  return { ...receipt, proposalId: input.proposalId, kind: 'transaction' as const, status: 'applied' as const, portfolio: await refreshedPortfolio(principal) };
}
export async function cancelChatTransaction(principal: Principal, raw: unknown) {
  requireChat(principal);
  const input = chatConfirmationSchema.parse(raw);
  return publicChatTransaction(await rpc(principal, 'cancel_chat_transaction_proposal', { p_id: input.proposalId, p_confirmation_secret: input.confirmationSecret }));
}
