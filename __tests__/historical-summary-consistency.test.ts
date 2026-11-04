import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculatePositionMetrics, calculateRealizedPortfolioTotals } from '@/lib/calculations';
import { computeRealizedSalesWithFx } from '@/lib/positions';
import type { Position, PositionLot } from '@/types';

const year = 365.25 * 86400000;
const buyAt = Date.parse('2024-01-01T12:00:00Z');
const lot = (type: 'BUY' | 'SELL', price: number, quantity: number, timestamp: number, commissionAmount = 0): PositionLot => ({
  type, price, quantity, executedAt: new Date(timestamp).toISOString(), hasCommission: commissionAmount > 0, commissionAmount,
});
const position = (lots: PositionLot[]): Position => ({ symbol: 'TEST', display: 'Test', imageUrl: '', location: 'bank_one', entryDate: new Date(buyAt).toISOString(), entryPrice: 100, quantity: 10, lots });
afterEach(() => vi.useRealTimers());

describe('historical cost and current summary consistency', () => {
  it('keeps historical ILS cost and target while marking open value at current FX', () => {
    vi.useFakeTimers(); vi.setSystemTime(buyAt + year);
    const metrics = calculatePositionMetrics(position([lot('BUY', 100, 10, buyAt, 20)]), 120, 3, .1, undefined, () => 4);
    expect(metrics.positionPnLUsd).toBeCloseTo(180);
    expect(metrics.positionPnLIls).toBeCloseTo(1200 * 3 - 1020 * 4);
    expect(metrics.projectedPnLUsd).toBeCloseTo(102);
    expect(metrics.projectedPnLIls).toBeCloseTo(408);
    expect(metrics.combinedIls).toBeCloseTo(metrics.positionPnLIls - 408);
  });

  it('computes realized targets per matched buy, using its own holding period and purchase FX', () => {
    const secondBuy = buyAt + year;
    const sellAt = buyAt + 2 * year;
    const p = position([lot('BUY', 100, 2, buyAt, 10), lot('BUY', 200, 1, secondBuy, 5), lot('SELL', 300, 3, sellAt, 8)]);
    const rateAt = (timestamp: number) => timestamp === buyAt ? 4 : timestamp === secondBuy ? 3.5 : 3;
    const sales = computeRealizedSalesWithFx(p, rateAt);
    const totals = calculateRealizedPortfolioTotals(sales, .1, 3, rateAt);
    const firstTarget = 210 * (.1 * 2 + .1 ** 2);
    const secondTarget = 205 * .1;
    expect(totals.expectedProfitUsd).toBeCloseTo(firstTarget + secondTarget);
    expect(totals.expectedProfitIls).toBeCloseTo(firstTarget * 4 + secondTarget * 3.5);
    expect(totals.profitUsd).toBeCloseTo(900 - 8 - 415);
    expect(totals.profitIls).toBeCloseTo((900 - 8) * 3 - 210 * 4 - 205 * 3.5);
  });

  it('supports a legacy position without lots without setting its target to minus its principal', () => {
    vi.useFakeTimers(); vi.setSystemTime(buyAt + year);
    const { lots: _lots, ...legacy } = position([]);
    const metrics = calculatePositionMetrics(legacy, 120, 3, .1, undefined, () => 4);
    expect(metrics.projectedPnLUsd).toBeCloseTo(100);
    expect(metrics.projectedPnLIls).toBeCloseTo(400);
  });
});
