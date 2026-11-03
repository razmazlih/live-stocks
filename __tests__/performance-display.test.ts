import { describe, expect, it } from 'vitest';
import { buildPortfolioTimelinePointFromSummary } from '@/lib/calculations';
import { getPerformanceColor, getPerformanceColorStops, getPerformanceSeries, getPerformanceTotals, parsePerformanceRange } from '@/lib/performance-display';
import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

const summary: PortfolioSummary = {
  totalCurrentPnLUsd: 120, totalCurrentPnLIls: 390,
  totalProjectedPnLUsd: 150, totalProjectedPnLIls: 480,
  totalCombinedUsd: -30, totalCombinedIls: -90,
  totalRealizedProfitUsd: 80, totalRealizedProfitIls: 250,
  totalTaxesPaidUsd: 20, totalTaxesPaidIls: 60,
  totalNetPnLUsd: 100, totalNetPnLIls: 330,
  totalValue: 1200, totalCost: 1160, usdToIlsRate: 3.2,
};

describe('performance display basis', () => {
  it('colors losses red, positive under-target returns blue and positive above-target returns green', () => {
    expect(getPerformanceColor(-10, -20)).toBe('#dc2626');
    expect(getPerformanceColor(10, 20)).toBe('#2563eb');
    expect(getPerformanceColor(30, 20)).toBe('#059669');
    expect(getPerformanceColor(10, null)).toBe('#64748b');
  });
  it('switches color at exact zero and personal-target crossings between samples', () => {
    expect(getPerformanceColorStops([{ timestamp: 0, actual: -10, target: 10 }, { timestamp: 100, actual: 30, target: 10 }])).toEqual([
      { offset: 0, color: '#dc2626' }, { offset: 25, color: '#dc2626' },
      { offset: 25, color: '#2563eb' }, { offset: 50, color: '#2563eb' },
      { offset: 50, color: '#059669' }, { offset: 100, color: '#059669' },
    ]);
  });
  it('does not color across missing data or divide by zero for one timestamp', () => {
    expect(getPerformanceColorStops([{ timestamp: 1, actual: 5, target: 10 }])).toEqual([]);
    expect(getPerformanceColorStops([{ timestamp: 1, actual: null, target: 10 }, { timestamp: 2, actual: 5, target: 10 }])).toEqual([]);
  });
  it.each(['USD', 'ILS'] as const)('keeps latest plotted profit, target and gap identical to summary in %s', (currency) => {
    const point = buildPortfolioTimelinePointFromSummary(summary, Date.UTC(2026, 10, 3));
    const totals = getPerformanceTotals(summary, currency);
    const plotted = getPerformanceSeries([point], 'All', currency)[0];
    expect(plotted.actual).toBe(totals.actual);
    expect(plotted.target).toBe(totals.target);
    expect(plotted.actual! - plotted.target!).toBe(totals.gap);
    expect(plotted.actual).not.toBe(currency === 'USD' ? summary.totalNetPnLUsd : summary.totalNetPnLIls);
  });
  it('uses historical ILS values without converting realized returns at today’s rate', () => {
    expect(getPerformanceTotals(summary, 'ILS')).toEqual({ actual: 390, target: 480, gap: -90, value: 3840 });
  });
  it('filters the time window without rebasing cumulative profit or replacing missing values with zero', () => {
    const point = buildPortfolioTimelinePointFromSummary(summary, Date.UTC(2026, 10, 3));
    const missing = { ...point, timestamp: Date.UTC(2026, 9, 20), totalPnLUsd: NaN };
    const old = { ...point, timestamp: Date.UTC(2025, 1, 1) };
    const result = getPerformanceSeries([point, old, missing] as PortfolioTimelinePoint[], '1M', 'USD');
    expect(result).toHaveLength(2);
    expect(result[0].actual).toBeNull();
    expect(result[1].actual).toBe(120);
    expect(parsePerformanceRange(new URLSearchParams('chartRange=unknown'))).toBe('3M');
  });
});
