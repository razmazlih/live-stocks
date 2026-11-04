import { describe, expect, it, vi } from 'vitest';
import { buildPortfolioTimelinePointFromSummary, calculatePositionMetrics, calculatePortfolioSummary, calculateRealizedPortfolioTotals, enrichPortfolioSummaryWithRealized } from '@/lib/calculations';
import { computeRealizedSalesWithFx } from '@/lib/positions';
import { buildPositionTimeline } from '@/lib/portfolio-timeline';
import type { Position, PositionLot } from '@/types';
const DAY = 86_400_000;
const start = Date.UTC(2026, 0, 2);
const buy: PositionLot = { type: 'BUY', price: 100, quantity: 10, executedAt: new Date(start + 18 * 3_600_000).toISOString(), hasCommission: true, commissionAmount: 8 };
const position: Position = { symbol: 'TEST', display: 'Test', imageUrl: '', location: 'bank_one', entryPrice: 100, quantity: 10, entryDate: buy.executedAt, lots: [buy] };

describe('daily portfolio timeline', () => {
  it('includes same-day transactions after candle time, commissions and historical acquisition FX', () => {
    const fx = (ts: number) => ts < start + DAY ? 3 : 4;
    const points = buildPositionTimeline(position, [{ timestamp: start + 14 * 3_600_000, close: 110 }], .1, [], fx, start + DAY * 2 - 1);
    expect(points).toHaveLength(2);
    expect(points[0].totalPnLUsd).toBe(92);
    expect(points[0].totalPnLIls).toBe(276);
    expect(points[1].totalPnLIls).toBe(1376);
    expect(points[1].expectedNetPnLUsd).toBeGreaterThan(points[0].expectedNetPnLUsd);
    expect(points[1].expectedNetPnLIls).toBeCloseTo(points[1].expectedNetPnLUsd * 3);
  });
  it('does not use a future price to value a missing historical day', () => {
    const points = buildPositionTimeline(position, [{ timestamp: start + DAY, close: 110 }], .1, [], () => 3, start + DAY * 2 - 1);
    expect(points[0].totalPnLUsd).toBeNaN();
    expect(points[0].expectedNetPnLUsd).toBeGreaterThan(0);
    expect(points[1].totalPnLUsd).toBe(92);
  });
  it('realizes a weekend sale without requiring another candle and freezes the closed return', () => {
    const sale: PositionLot = { ...buy, type: 'SELL', price: 120, executedAt: new Date(start + DAY + 18 * 3_600_000).toISOString() };
    const points = buildPositionTimeline({ ...position, quantity: 0, lots: [buy, sale] }, [{ timestamp: start, close: 110 }], .1, [], () => 3, start + DAY * 3 - 1);
    expect(points[1].totalPnLUsd).toBe(184);
    expect(points[2].totalPnLUsd).toBe(184);
    expect(points[2].expectedNetPnLUsd).toBeCloseTo(points[1].expectedNetPnLUsd);
  });
});


describe('historical/current valuation boundary', () => {
  it('matches today summary with the same prices, time, partial sales, commissions and FX', () => {
    const asOf = start + DAY * 3 - 1;
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
    try {
      const sale: PositionLot = { ...buy, type: 'SELL', quantity: 4, price: 120, executedAt: new Date(start + DAY + 18 * 3_600_000).toISOString() };
      const p = { ...position, quantity: 6, lots: [buy, sale] };
      const fx = (ts: number) => ts < start + DAY ? 3 : 4;
      const prices = [{ timestamp: start, close: 110 }];
      const historical = buildPositionTimeline(p, prices, .1, [], fx, asOf).at(-1)!;
      const metrics = calculatePositionMetrics(p, 110, 4, .1, undefined, fx);
      const realized = calculateRealizedPortfolioTotals(computeRealizedSalesWithFx(p, fx), .1, 4, fx);
      const summary = enrichPortfolioSummaryWithRealized(calculatePortfolioSummary([metrics], 4), realized, { taxUsd: 0, taxIls: 0 });
      const current = buildPortfolioTimelinePointFromSummary(summary, asOf);
      expect(historical.totalPnLUsd).toBeCloseTo(current.totalPnLUsd);
      expect(historical.totalPnLIls).toBeCloseTo(current.totalPnLIls);
      expect(historical.expectedNetPnLUsd).toBeCloseTo(current.expectedNetPnLUsd);
      expect(historical.expectedNetPnLIls).toBeCloseTo(current.expectedNetPnLIls);
    } finally { vi.useRealTimers(); }
  });
});
