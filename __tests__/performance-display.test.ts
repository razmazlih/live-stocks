import { describe, expect, it } from 'vitest';
import { buildPortfolioTimelinePointFromSummary } from '@/lib/calculations';
import { getPerformanceColor, getPerformanceColorStops, getPerformanceSeries, getPerformanceTotals, parsePerformanceOptions, parsePerformanceRange } from '@/lib/performance-display';
import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

const summary: PortfolioSummary = {
  totalCurrentPnLUsd: 120, totalCurrentPnLIls: 390,
  totalProjectedPnLUsd: 150, totalProjectedPnLIls: 480,
  totalCombinedUsd: -30, totalCombinedIls: -90,
  totalRealizedProfitUsd: 80, totalRealizedProfitIls: 250,
  totalTaxesPaidUsd: 20, totalTaxesPaidIls: 60,
  totalNetPnLUsd: 100, totalNetPnLIls: 330,
  totalValue: 1200, totalCost: 1160, usdToIlsRate: 3.2,
  totalCommissionsUsd: 16, totalCommissionsIls: 50,
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
    expect(plotted.actual).toBe(currency === 'USD' ? summary.totalNetPnLUsd : summary.totalNetPnLIls);
  });
  it('uses historical ILS values without converting realized returns at today’s rate', () => {
    expect(getPerformanceTotals(summary, 'ILS')).toEqual({ actual: 330, target: 480, gap: -150, value: 3840 });
  });
  it('filters the time window without rebasing cumulative profit or replacing missing values with zero', () => {
    const point = buildPortfolioTimelinePointFromSummary(summary, Date.UTC(2026, 10, 3));
    const missing = { ...point, timestamp: Date.UTC(2026, 9, 20), totalPnLUsd: NaN };
    const old = { ...point, timestamp: Date.UTC(2025, 1, 1) };
    const result = getPerformanceSeries([point, old, missing] as PortfolioTimelinePoint[], '1M', 'USD');
    expect(result).toHaveLength(2);
    expect(result[0].actual).toBeNull();
    expect(result[1].actual).toBe(100);
    expect(parsePerformanceRange(new URLSearchParams('chartRange=unknown'))).toBe('3M');
  });
});


describe('performance fees and estimated tax selections', () => {
  it('defaults both deductions on and parses independently shareable URL selections', () => {
    expect(parsePerformanceOptions(new URLSearchParams())).toEqual({ includeTaxes: true, includeFees: true });
    expect(parsePerformanceOptions(new URLSearchParams('includeTaxes=0'))).toEqual({ includeTaxes: false, includeFees: true });
    expect(parsePerformanceOptions(new URLSearchParams('includeFees=0&includeTaxes=1'))).toEqual({ includeTaxes: true, includeFees: false });
  });
  it.each([
    { includeTaxes: true, includeFees: true, usd: 100, ils: 330 },
    { includeTaxes: false, includeFees: true, usd: 120, ils: 390 },
    { includeTaxes: true, includeFees: false, usd: 116, ils: 380 },
    { includeTaxes: false, includeFees: false, usd: 136, ils: 440 },
  ])('keeps series and totals consistent for $includeTaxes tax and $includeFees fees', ({ includeTaxes, includeFees, usd, ils }) => {
    const point = { ...buildPortfolioTimelinePointFromSummary(summary, Date.UTC(2026, 10, 3)), commissionUsd: 16, commissionIls: 50 };
    const options = { includeTaxes, includeFees };
    for (const currency of ['USD', 'ILS'] as const) {
      const total = getPerformanceTotals(summary, currency, options);
      const plotted = getPerformanceSeries([point], 'All', currency, options)[0];
      expect(total.actual).toBe(currency === 'USD' ? usd : ils);
      expect(plotted.actual).toBe(total.actual);
      expect(plotted.gross).toBe(currency === 'USD' ? 136 : 440);
      expect(plotted.fees).toBe(currency === 'USD' ? 16 : 50);
      expect(plotted.tax).toBe(currency === 'USD' ? 20 : 60);
      expect(plotted.net).toBe(currency === 'USD' ? 100 : 330);
      expect(plotted.target).toBe(currency === 'USD' ? 150 : 480);
      expect(total.gap).toBe(total.actual - total.target);
    }
  });
  it('applies each historical day’s cumulative fees and tax without rebasing at the selected range', () => {
    const base = buildPortfolioTimelinePointFromSummary(summary, Date.UTC(2026, 10, 3));
    const older = { ...base, timestamp: Date.UTC(2026, 10, 2), totalPnLUsd: 80, netPnLUsd: 70, commissionUsd: 8 };
    const latest = { ...base, commissionUsd: 16 };
    expect(getPerformanceSeries([older, latest], 'All', 'USD', { includeFees: false }).map(p => p.actual)).toEqual([78, 116]);
    expect(getPerformanceSeries([older, latest], 'All', 'USD', { includeTaxes: false, includeFees: false }).map(p => p.actual)).toEqual([88, 136]);
  });
  it('does not fill missing historical values when fees or tax are toggled', () => {
    const point = { ...buildPortfolioTimelinePointFromSummary(summary, 1), totalPnLIls: Number.NaN, commissionIls: 50 };
    expect(getPerformanceSeries([point], 'All', 'ILS', { includeTaxes: false, includeFees: false })[0].actual).toBeNull();
  });
});
