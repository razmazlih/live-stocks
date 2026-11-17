import { describe, expect, it, vi } from 'vitest';
import { buildChatTransactionPlan, chatTransactionInputSchema } from '@/lib/chat-transactions';
import type { Position } from '@/types';
const location = '10000000-0000-4000-8000-000000000001';
const input = { location, side: 'BUY' as const, symbol: 'AAPL', quantity: 2, priceUsd: 150, executedOn: '2026-01-02', commissionUsd: 1 };
const position = (extra: Partial<Position> = {}): Position => ({ id: 'p', symbol: 'AAPL', display: 'Apple', imageUrl: '', quantity: 8, entryPrice: 100, entryDate: '2026-01-01', location, lots: [{ type: 'BUY', quantity: 8, price: 100, executedAt: '2026-01-01', hasCommission: false, commissionAmount: 0 }], ...extra });
describe('recording an already executed trade', () => {
  it('adds a real purchase to an existing holding and includes disclosed commission', () => {
    const plan = buildChatTransactionPlan(input, [position()], 'חשבון שלי');
    expect(plan.changes[0]).toMatchObject({ previousQuantity: 8, quantity: 10, previousAverageCostUsd: 100, averageCostUsd: 110.1 });
    expect(plan).toMatchObject({ grossAmountUsd: 300, cashAmountUsd: 301, commissionKnown: true, costComplete: true });
  });
  it('records a partial sale using FIFO rather than scaling the average purchase price', () => {
    const p = position({ quantity: 10, lots: [{ type: 'BUY', quantity: 5, price: 100, executedAt: '2026-01-01', hasCommission: false, commissionAmount: 0 }, { type: 'BUY', quantity: 5, price: 200, executedAt: '2026-01-02', hasCommission: false, commissionAmount: 0 }] });
    const plan = buildChatTransactionPlan({ ...input, side: 'SELL', quantity: 6, executedOn: '2026-01-03' }, [p], 'חשבון');
    expect(plan.changes[0]).toMatchObject({ previousQuantity: 10, quantity: 4, averageCostUsd: 200 });
    expect(plan.cashAmountUsd).toBe(899);
  });
  it('allows a full sale and a new purchase in an empty portfolio', () => {
    expect(buildChatTransactionPlan({ ...input, side: 'SELL', quantity: 8 }, [position()], 'חשבון').changes[0].quantity).toBe(0);
    expect(buildChatTransactionPlan(input, [], 'חשבון').changes[0]).toMatchObject({ previousQuantity: 0, quantity: 2, averageCostUsd: 150.5 });
  });
  it('rejects overselling today or at any historical point', () => {
    expect(() => buildChatTransactionPlan({ ...input, side: 'SELL', quantity: 9 }, [position()], 'חשבון')).toThrow('מספיק מניות');
    expect(() => buildChatTransactionPlan({ ...input, side: 'SELL', quantity: 1, executedOn: '2025-12-31' }, [position()], 'חשבון')).toThrow('מספיק מניות');
    expect(() => buildChatTransactionPlan({ ...input, side: 'SELL' }, [], 'חשבון')).toThrow('מספיק מניות');
  });
  it('accepts historical buys and explicitly explains a later checkpoint', () => {
    const p = position({ quantity: 4, lots: [{ type: 'RECONCILE', quantity: 4, price: 120, executedAt: '2026-01-10', createdAt: '2026-01-10T10:00:00Z', hasCommission: false, commissionAmount: 0 }] });
    const plan = buildChatTransactionPlan(input, [p], 'חשבון');
    expect(plan.changes[0]).toMatchObject({ quantity: 4, averageCostUsd: 120 });
    expect(plan.warnings.join(' ')).toContain('צילום מצב');
  });
  it('requires an explicit fee or confirmed zero so new trades retain net profit and forecasts', () => {
    for (const side of ['BUY', 'SELL'] as const) {
      expect(() => buildChatTransactionPlan({ ...input, side, commissionUsd: null }, [position()], 'חשבון')).toThrow('לאשר שלא הייתה עמלה');
      const plan = buildChatTransactionPlan({ ...input, side, commissionUsd: 0 }, [position()], 'חשבון');
      expect(plan.commissionKnown).toBe(true);
      expect(plan.costComplete).toBe(true);
      expect(plan.cashAmountUsd).toBe(300);
    }
  });
  it('warns about a possible duplicate and never chooses an ambiguous source', () => {
    const plan = buildChatTransactionPlan({ ...input, quantity: 8, priceUsd: 100, executedOn: '2026-01-01', commissionUsd: 0 }, [position()], 'חשבון');
    expect(plan.warnings.join(' ')).toContain('פעמיים');
    const other = position({ id: 'p2' });
    expect(() => buildChatTransactionPlan(input, [position(), other], 'חשבון')).toThrow('מפוצלת');
  });
  it('accepts today in Jerusalem after local midnight while UTC is still yesterday', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T22:30:00Z'));
      expect(chatTransactionInputSchema.safeParse({ ...input, executedOn: '2026-01-02' }).success).toBe(true);
      expect(chatTransactionInputSchema.safeParse({ ...input, executedOn: '2026-01-03' }).success).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it.each([{ quantity: 0 }, { priceUsd: 0 }, { quantity: 0.00001 }, { commissionUsd: 0.001 }, { quantity: Infinity }, { executedOn: '2099-01-01' }, { executedOn: '2026-02-30' }, { ownerId: 'other' }, { confirmed: true }])('rejects invalid or editable authorization input %j', patch => {
    expect(chatTransactionInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
});
