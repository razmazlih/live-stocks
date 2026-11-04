import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCommissionTotals } from '@/lib/positions';
import { buildPositionTimeline } from '@/lib/portfolio-timeline';
import { buildPortfolioTimelinePointFromSummary, calculatePortfolioSummary, calculatePositionMetrics } from '@/lib/calculations';
import type { Position, PositionLot } from '@/types';
const day = 86400000;
const start = Date.UTC(2026, 0, 2);
const buy: PositionLot = { type: 'BUY', price: 100, quantity: 10, executedAt: new Date(start).toISOString(), hasCommission: true, commissionAmount: 8 };
const sell: PositionLot = { ...buy, type: 'SELL', quantity: 4, price: 110, commissionAmount: 6, executedAt: new Date(start + day).toISOString() };
const position: Position = { symbol: 'TEST', display: 'Test', imageUrl: '', location: 'bank_one', quantity: 6, entryPrice: 100, entryDate: buy.executedAt, lots: [buy, sell] };
const fx = (timestamp: number) => timestamp < start + day ? 3 : 4;
afterEach(() => vi.useRealTimers());

describe('paid transaction commissions', () => {
  it('records buy fees immediately, adds sale fees only on execution, and uses each transaction FX', () => {
    const points = buildPositionTimeline(position, [{ timestamp: start, close: 110 }], .1, [], fx, start + 2 * day - 1);
    expect(points[0].commissionUsd).toBe(8);
    expect(points[0].commissionIls).toBe(24);
    expect(points[1].commissionUsd).toBe(14);
    expect(points[1].commissionIls).toBe(48);
    expect(points[0].totalPnLUsd + points[0].commissionUsd!).toBeCloseTo(100);
    // Gross P/L: sold four at 110 and retain six marked at 110.
    expect(points[1].totalPnLUsd + points[1].commissionUsd!).toBeCloseTo(100);
    expect(points[1].totalPnLIls + points[1].commissionIls!).toBeCloseTo(1400);
  });

  it('carries current fee totals into summaries and the current chart point without allocating them twice on a partial sale', () => {
    vi.useFakeTimers(); vi.setSystemTime(start + 2 * day - 1);
    const metric = calculatePositionMetrics(position, 110, 4, .1, undefined, fx);
    const summary = calculatePortfolioSummary([metric], 4);
    expect(summary.totalCommissionsUsd).toBe(14);
    expect(summary.totalCommissionsIls).toBe(48);
    expect(buildPortfolioTimelinePointFromSummary(summary, Date.now()).commissionUsd).toBe(14);
  });

  it('can include closed positions fees in a summary with only open market exposures', () => {
    vi.useFakeTimers(); vi.setSystemTime(start + 2 * day);
    const summary = calculatePortfolioSummary([], 4, [position], fx);
    expect(summary.totalCommissionsUsd).toBe(14);
    expect(summary.totalCommissionsIls).toBe(48);
  });

  it('does not include future or disabled fees and does not need FX for zero fees', () => {
    const future = { ...buy, executedAt: new Date(start + 3 * day).toISOString() };
    expect(calculateCommissionTotals([buy, future, { ...sell, hasCommission: false }], fx, start + day).commissionUsd).toBe(8);
    expect(calculateCommissionTotals([{ ...buy, commissionAmount: 0 }], () => Number.NaN, start)).toEqual({ commissionUsd: 0, commissionIls: 0 });
  });
});
