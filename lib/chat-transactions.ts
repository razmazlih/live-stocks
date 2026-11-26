import { z } from 'zod';
import { orderPositionLots, summarizeLots } from '@/lib/positions';
import type { Position, PositionLot } from '@/types';

const amount = (digits: number) => z.number().finite().nonnegative().max(1_000_000_000).refine(value => Math.abs(value * 10 ** digits - Math.round(value * 10 ** digits)) < 0.00001, `At most ${digits} decimal places are supported`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return value >= '1900-01-01' && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}, 'An actual execution date, no later than today, is required');
export const chatTransactionInputSchema = z.object({
  location: z.string().uuid(), side: z.enum(['BUY', 'SELL']),
  symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9.^=:-]*$/).transform(value => value.toUpperCase()),
  quantity: amount(4).refine(value => value > 0), priceUsd: amount(4).refine(value => value > 0),
  executedOn: date, commissionUsd: amount(2).nullable(),
}).strict();
export type ChatTransactionInput = z.infer<typeof chatTransactionInputSchema>;
export const MAX_CHAT_TRANSACTIONS = 25;
export const chatTransactionBatchSchema = z.object({
  transactions: z.array(chatTransactionInputSchema).min(1).max(MAX_CHAT_TRANSACTIONS),
}).strict();
export const chatTransactionProposalInputSchema = z.union([chatTransactionInputSchema, chatTransactionBatchSchema]);
export class ChatTransactionPlanError extends Error {}

/** Simulate the recorded ledger, including historical inserts and checkpoints. */
function simulateTransaction(input: ChatTransactionInput, positions: Position[], sourceName: string) {
  if (input.commissionUsd === null) throw new ChatTransactionPlanError('כדי לשמור עסקה רגילה עם רווח נטו ותחזית, צריך לציין את העמלה בדולרים או לאשר שלא הייתה עמלה (0).');
  const matching = positions.filter(position => position.location === input.location && position.symbol.trim().toUpperCase() === input.symbol);
  const open = matching.filter(position => position.quantity > 0);
  if (open.length > 1) throw new ChatTransactionPlanError('המניה מפוצלת לכמה רשומות בחשבון הזה. צריך לאחד אותן באתר לפני שמוסיפים פעולה.');
  const position = open[0] ?? matching[0];
  const baseline: PositionLot[] = position?.lots?.length ? position.lots : position && position.quantity > 0 ? [{ type: 'BUY', price: position.entryPrice, quantity: position.quantity, executedAt: position.entryDate, hasCommission: false, commissionAmount: 0 }] : [];
  if (baseline.some(lot => !Number.isFinite(lot.price) || !Number.isFinite(lot.quantity) || lot.price < 0 || lot.quantity < 0 || !Number.isFinite(Date.parse(lot.executedAt)))) throw new ChatTransactionPlanError('חלק מהנתונים הקיימים בתיק לא תקינים. צריך לבדוק אותם לפני שמוסיפים פעולה.');
  const createdAt = new Date(baseline.reduce((latest, lot) => {
    const recorded = Date.parse(lot.createdAt ?? '');
    return Number.isFinite(recorded) ? Math.max(latest, recorded + 1) : latest;
  }, Date.now())).toISOString();
  const added: PositionLot = { type: input.side, price: input.priceUsd, quantity: input.quantity, executedAt: input.executedOn, createdAt, hasCommission: input.commissionUsd > 0, commissionAmount: input.commissionUsd };
  const lots = [...baseline, added];
  let running = 0;
  for (const lot of orderPositionLots(lots)) {
    running = lot.type === 'RECONCILE' ? lot.quantity : running + (lot.type === 'BUY' ? lot.quantity : -lot.quantity);
    if (running < -0.00001) throw new ChatTransactionPlanError('בתאריך הזה אין בתיק מספיק מניות למכירה הזו. כדאי לבדוק את הכמות או להוסיף קודם קנייה שחסרה.');
  }
  const before = summarizeLots(baseline), after = summarizeLots(lots);
  const hasUnknownFees = baseline.some(lot => lot.commissionKnown === false);
  const laterCheckpoint = baseline.some(lot => lot.type === 'RECONCILE' && lot.executedAt.slice(0, 10) > input.executedOn);
  const duplicate = baseline.some(lot => lot.type === input.side && lot.executedAt.slice(0, 10) === input.executedOn && lot.quantity === input.quantity && lot.price === input.priceUsd);
  const grossAmountUsd = input.quantity * input.priceUsd;
  const plan = { location: input.location, sourceName, observedAt: input.executedOn, transaction: input,
    commissionKnown: true, costComplete: !hasUnknownFees, grossAmountUsd,
    cashAmountUsd: grossAmountUsd + (input.side === 'BUY' ? input.commissionUsd : -input.commissionUsd),
    warnings: [ ...(laterCheckpoint ? ['הפעולה מוקדמת מצילום מצב שכבר נשמר. היא תתווסף להיסטוריה; היתרה היום מחושבת לפי צילום המצב המאוחר.'] : []), ...(duplicate ? ['כבר קיימת פעולה באותו תאריך, מחיר וכמות. כדאי לבדוק שלא מוסיפים אותה פעמיים.'] : []) ],
    changes: [{ symbol: input.symbol, previousQuantity: before.totalQuantity, quantity: after.totalQuantity,
      previousAverageCostUsd: before.totalQuantity > 0 ? before.averageEntryPrice : null,
      averageCostUsd: after.totalQuantity > 0 ? after.averageEntryPrice : 0,
      acquiredOn: after.earliestEntryDate?.slice(0, 10) || null, kind: input.side === 'BUY' ? 'buy' : 'sell' }],
    unchanged: [], blocked: [], canApply: true as const };
  const updatedPosition: Position = {
    ...position, symbol: input.symbol, display: position?.display ?? input.symbol, imageUrl: position?.imageUrl ?? '',
    location: input.location, lots, quantity: after.totalQuantity, entryPrice: after.averageEntryPrice,
    entryDate: after.earliestEntryDate ?? input.executedOn,
  };
  return { plan, position, updatedPosition };
}

export function buildChatTransactionPlan(raw: ChatTransactionInput, positions: Position[], sourceName: string) {
  return simulateTransaction(chatTransactionInputSchema.parse(raw), positions, sourceName).plan;
}
export type ChatTransactionPlan = ReturnType<typeof buildChatTransactionPlan>;

export function buildChatTransactionBatchPlan(transactions: ChatTransactionInput[], positions: Position[], sourceName: (location: string) => string) {
  const ledger = [...positions];
  const plans = transactions.map(input => {
    try {
      const { plan, position, updatedPosition } = simulateTransaction(input, ledger, sourceName(input.location));
      if (position) ledger[ledger.indexOf(position)] = updatedPosition;
      else ledger.push(updatedPosition);
      return plan;
    } catch (failure) {
      if (failure instanceof ChatTransactionPlanError) throw new ChatTransactionPlanError(`${input.symbol}: ${failure.message}`);
      throw failure;
    }
  });
  return { canApply: true as const, transactions: plans };
}
