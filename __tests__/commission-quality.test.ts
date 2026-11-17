import { describe, expect, it } from 'vitest';
import { mapPositionRow } from '@/lib/positions';
import { reconciliationQuality } from '@/lib/reconciliation-quality';

function mapped(symbol: string, commissionKnown?: boolean) {
  return mapPositionRow({ id: symbol, symbol, display: symbol, image_url: '', location: 'account-one', quantity: 2, entry_price: 100, entry_date: '2026-01-01', position_lots: [
    { id: `${symbol}-buy`, position_id: symbol, side: 'BUY', quantity: 2, price: 100, executed_at: '2026-01-01', has_commission: false, commission_amount: 0, ...(commissionKnown === undefined ? {} : { commission_known: commissionKnown }) },
  ] });
}

describe('recorded commission quality', () => {
  it('distinguishes an omitted fee from a confirmed zero fee', () => {
    const unknown = mapped('ABC', false);
    const zero = mapped('XYZ', true);
    expect(unknown.lots?.[0].commissionKnown).toBe(false);
    expect(zero.lots?.[0].commissionKnown).toBe(true);
    expect(reconciliationQuality([unknown, zero])).toMatchObject({ completeCommissionHistory: false, missingCommissionSymbols: ['ABC'], completeTransactionHistory: true });
  });
  it('retains legacy records as known and deduplicates affected symbols', () => {
    expect(reconciliationQuality([mapped('ABC')])).toMatchObject({ completeCommissionHistory: true, missingCommissionSymbols: [] });
    expect(reconciliationQuality([mapped('XYZ', false), mapped('ABC', false), mapped('XYZ', false)]).missingCommissionSymbols).toEqual(['ABC', 'XYZ']);
  });
});
