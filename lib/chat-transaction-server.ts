import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Principal } from '@/lib/auth/server';
import { activeSourceForSync } from '@/lib/server/investment-source-catalog';
import { mapPositionRow } from '@/lib/positions';
import { chatConfirmationSchema, chatProposalIdSchema, refreshedPortfolio } from '@/lib/chat-screenshot-sync';
import { buildChatTransactionBatchPlan, buildChatTransactionPlan, chatTransactionProposalInputSchema, ChatTransactionPlanError } from '@/lib/chat-transactions';

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
const stored = z.object({ id: z.string().uuid(), status: z.enum(['pending', 'applied', 'cancelled', 'superseded']), expiresAt: z.string().datetime({ offset: true }), review: z.object({ input: chatTransactionProposalInputSchema, plan: z.object({ canApply: z.literal(true) }).passthrough() }), receipt: z.unknown().optional() });
export function publicChatTransaction(raw: unknown) {
  const saved = stored.parse(raw);
  return { proposalId: saved.id, kind: 'transaction' as const, status: saved.status, expiresAt: saved.expiresAt, input: saved.review.input, plan: saved.review.plan, ...(saved.receipt ? { receipt: saved.receipt } : {}) };
}
export async function prepareChatTransaction(principal: Principal, raw: unknown) {
  requireChat(principal, true);
  const parsed = chatTransactionProposalInputSchema.parse(raw);
  const input = 'transactions' in parsed
    ? { transactions: parsed.transactions.sort((a, b) => a.executedOn.localeCompare(b.executedOn)) }
    : parsed;
  const transactions = 'transactions' in input ? input.transactions : [input];
  const snapshot = await rpc(principal, 'screenshot_sync_snapshot', {});
  if (!Array.isArray(snapshot.positions) || !Array.isArray(snapshot.lots) || !/^[a-f0-9]{32}$/.test(snapshot.fingerprint)) throw new ChatTransactionUnavailableError();
  const rows: (Parameters<typeof mapPositionRow>[0] & { consolidated_into_position_id?: string | null })[] = snapshot.positions;
  const mapped = rows.map(row => ({ row, position: mapPositionRow({ ...row, position_lots: snapshot.lots.filter((lot: { position_id: string }) => lot.position_id === row.id) }) }));
  const positions = mapped.filter(({ row }) => !row.consolidated_into_position_id).map(({ position }) => position);
  for (const transaction of transactions) {
    if (mapped.some(({ row, position }) => row.consolidated_into_position_id && position.location === transaction.location && position.symbol.trim().toUpperCase() === transaction.symbol && position.quantity > 0)) {
      throw new ChatTransactionPlanError(`${transaction.symbol}: המניה מפוצלת לכמה רשומות בחשבון הזה. צריך לאחד אותן באתר לפני שמוסיפים פעולה.`);
    }
  }
  const sourceName = (location: string) => activeSourceForSync(snapshot.sources, location).name;
  const plan = 'transactions' in input
    ? buildChatTransactionBatchPlan(input.transactions, positions, sourceName)
    : buildChatTransactionPlan(input, positions, sourceName(input.location));
  const proposalId = randomUUID(), confirmationSecret = randomBytes(32).toString('base64url');
  const saved = await rpc(principal, 'create_chat_transaction_proposal', { p_id: proposalId, p_expected: snapshot.fingerprint, p_input: input, p_review: { input, plan }, p_confirmation_hash: createHash('sha256').update(confirmationSecret).digest('hex') });
  const instructions = 'transactions' in input
    ? 'העסקאות ממתינות לאישור. בדקו את כל הפרטים ולחצו על האישור בכרטיס כדי לשמור את העסקאות יחד.'
    : 'הפעולה עדיין לא נשמרה. יש לבדוק את הפרטים וללחוץ על כפתור האישור בכרטיס. זו רשומה של עסקה שכבר בוצעה, לא הוראת מסחר.';
  return { value: { ...publicChatTransaction(saved), instructions }, meta: { confirmationSecret } };
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
