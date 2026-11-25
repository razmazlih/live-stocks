// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Position } from '@/types';
import { buildPositionTimeline } from '@/lib/portfolio-timeline';
const mocks = vi.hoisted(() => ({ candles: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/yahoo-candles', () => ({ fetchYahooCandlesData: mocks.candles }));
import { buildWidgetTargetHistory } from '@/lib/server/widget-target-history';

const day = (date: string) => Date.parse(date + 'T00:00:00Z');
const DAY = 86_400_000;
const position: Position = {
  symbol: 'TEST', display: 'TEST', imageUrl: '', location: 'bank_one', quantity: 1,
  entryDate: '2026-06-01', entryPrice: 100,
  lots: [
    { type: 'BUY', quantity: 2, price: 100, executedAt: '2026-06-01', hasCommission: true, commissionAmount: 4 },
    { type: 'SELL', quantity: 1, price: 120, executedAt: '2026-11-18', hasCommission: false, commissionAmount: 0 },
  ],
};
const today = { timestamp: day('2026-11-26') + 12 * 3_600_000, gapUsd: -8.34, gapIls: -25 };
const rate = (time: number) => time >= day('2026-11-17') ? 4 : 3;
const taxTimeline = [{ timestamp: day('2026-11-18'), cumulativeTaxUsd: 4.5, cumulativeTaxIls: 16 }];
const candles = [{ timestamp: day('2026-11-17'), close: 125 }, { timestamp: day('2026-11-18'), close: 122 },
  { timestamp: day('2026-11-20'), close: 133 }];
const options = { positions: [position], annualGrowthRate: .05, getFxRateAt: rate, taxTimeline, today };
describe('widget monthly target history', () => {
  it('matches the site valuation including fees, realizations, FX and tax; keeps missing sessions and the exact summary endpoint', async () => {
    mocks.candles.mockResolvedValue({ s: 'ok', t: candles.map(p => p.timestamp / 1000), c: candles.map(p => p.close) });
    const history = await buildWidgetTargetHistory(options);
    expect(history).toHaveLength(30);
    expect(history.at(-1)).toEqual(today);
    const reference = buildPositionTimeline(position, candles, .05, [], rate, today.timestamp);
    for (const date of ['2026-11-17', '2026-11-18', '2026-11-21']) {
      const timestamp = day(date) + DAY - 1;
      const site = reference.find(p => p.timestamp === timestamp)!;
      const widget = history.find(p => p.timestamp === timestamp)!;
      const datedTax = taxTimeline.filter(t => t.timestamp <= timestamp).at(-1);
      expect(widget.gapUsd).toBeCloseTo(site.netPnLUsd - site.expectedNetPnLUsd - (datedTax?.cumulativeTaxUsd ?? 0), 2);
      expect(widget.gapIls).toBeCloseTo(site.netPnLIls - site.expectedNetPnLIls - (datedTax?.cumulativeTaxIls ?? 0), 2);
    }
    expect(history.find(p => p.timestamp === day('2026-11-19') + DAY - 1)).toMatchObject({ gapUsd: null, gapIls: null });
  });
  it('keeps the authoritative endpoint when candles fail and fetches each symbol only once', async () => {
    mocks.candles.mockClear().mockRejectedValue(new Error('offline'));
    const history = await buildWidgetTargetHistory({ ...options, positions: [position, position] });
    expect(mocks.candles).toHaveBeenCalledTimes(1);
    expect(history.slice(0, -1).every(p => p.gapUsd === null && p.gapIls === null)).toBe(true);
    expect(history.at(-1)).toEqual(today);
  });
});
