import { describe, expect, it } from 'vitest';

import type { PortfolioSummary, PortfolioTimelinePoint, PositionMetrics } from '@/types';
import {
  buildWeeklyActionItems,
  buildWeeklyMovers,
  buildWeeklySnapshot,
} from '@/lib/weekly-insights';

const oneDayMs = 24 * 60 * 60 * 1000;

function createTimelinePoint(
  timestamp: number,
  netPnLUsd: number,
  expectedNetPnLUsd: number,
  totalPnLUsd: number = netPnLUsd
): PortfolioTimelinePoint {
  return {
    timestamp,
    totalPnLUsd,
    totalPnLIls: totalPnLUsd * 3.7,
    netPnLUsd,
    netPnLIls: netPnLUsd * 3.7,
    expectedNetPnLUsd,
    expectedNetPnLIls: expectedNetPnLUsd * 3.7,
    spyNetPnLUsd: 0,
    spyNetPnLIls: 0,
  };
}

function createSummary(totalCurrentPnLUsd: number): PortfolioSummary {
  return {
    totalCurrentPnLUsd,
    totalCurrentPnLIls: totalCurrentPnLUsd * 3.7,
    totalProjectedPnLUsd: 0,
    totalProjectedPnLIls: 0,
    totalCombinedUsd: 0,
    totalCombinedIls: 0,
    totalRealizedProfitUsd: 0,
    totalRealizedProfitIls: 0,
    totalTaxesPaidUsd: 0,
    totalTaxesPaidIls: 0,
    totalNetPnLUsd: totalCurrentPnLUsd,
    totalNetPnLIls: totalCurrentPnLUsd * 3.7,
    totalValue: 0,
    totalCost: 0,
    usdToIlsRate: 3.7,
  };
}

function createMetric(symbol: string, combined: number, quantity: number = 10): PositionMetrics {
  return {
    position: {
      id: symbol,
      symbol,
      display: symbol,
      imageUrl: '',
      entryPrice: 100,
      quantity,
      entryDate: '2024-01-01T00:00:00Z',
      location: 'bank_one',
    },
    currentPrice: 100,
    positionPnLUsd: 0,
    positionPnLIls: 0,
    projectedPrice: 100,
    projectedPnLUsd: 0,
    projectedPnLIls: 0,
    combined,
    combinedIls: combined * 3.7,
    yearsHeld: 1,
    currentValue: 0,
    currentValueIls: 0,
    roiPercent: 0,
  };
}

describe('buildWeeklySnapshot', () => {
  it('calculates weekly delta against the closest point at least 7 days old', () => {
    const base = Date.UTC(2025, 0, 1);
    const timeline = [
      createTimelinePoint(base, 100, 80),
      createTimelinePoint(base + 6 * oneDayMs, 120, 90),
      createTimelinePoint(base + 8 * oneDayMs, 170, 120),
    ];
    const summary = createSummary(170);

    const snapshot = buildWeeklySnapshot(timeline, summary);

    expect(snapshot.netPnLDeltaUsd).toBe(70);
    expect(snapshot.projectedPnLDeltaUsd).toBe(40);
    expect(snapshot.forecastGapDeltaUsd).toBe(30);
    expect(snapshot.baselineTimestamp).toBe(base);
    expect(snapshot.currentTimestamp).toBe(base + 8 * oneDayMs);
  });
});

describe('buildWeeklyActionItems', () => {
  it('returns lagging open positions sorted by most negative combined gap', () => {
    const items = buildWeeklyActionItems([
      createMetric('AAA', -20),
      createMetric('BBB', -120),
      createMetric('CCC', 30),
      createMetric('DDD', -50),
    ]);

    expect(items.map((item) => item.position.symbol)).toEqual(['BBB', 'DDD', 'AAA']);
  });
});

describe('buildWeeklyMovers', () => {
  it('splits improved and worsened movers using weekly sparkline changes', () => {
    const base = Date.UTC(2025, 0, 1);
    const metrics = [createMetric('UP', -10, 2), createMetric('DOWN', -5, 3)];
    const sparklineData = {
      UP: [
        { timestamp: base, close: 10 },
        { timestamp: base + 8 * oneDayMs, close: 13 },
      ],
      DOWN: [
        { timestamp: base, close: 10 },
        { timestamp: base + 8 * oneDayMs, close: 8 },
      ],
    };

    const movers = buildWeeklyMovers(metrics, sparklineData);

    expect(movers.improved[0].symbol).toBe('UP');
    expect(movers.improved[0].changeUsd).toBe(6);
    expect(movers.worsened[0].symbol).toBe('DOWN');
    expect(movers.worsened[0].changeUsd).toBe(-6);
  });
});
