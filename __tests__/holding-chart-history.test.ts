import { describe, expect, it } from 'vitest';
import { buildHoldingChartReferences, buildHoldingPerformanceHistory } from '@/lib/holding-chart-history';
import type { HistoricalPoint, Position, PositionLot } from '@/types';

const DAY = 86_400_000;
const start = Date.UTC(2024, 0, 1);
const lot = (type: 'BUY' | 'SELL', price: number, quantity: number, day: number, fee = 0): PositionLot => ({
  type, price, quantity, executedAt: new Date(start + day * DAY + 18 * 3_600_000).toISOString(),
  hasCommission: fee > 0, commissionAmount: fee,
});
const position = (lots: PositionLot[], overrides: Partial<Position> = {}): Position => ({
  id: 'test', symbol: 'TEST', display: 'Test', imageUrl: '', entryPrice: 100, quantity: 10,
  entryDate: lots[0]?.executedAt ?? new Date(start).toISOString(), location: 'bank_one', lots, ...overrides,
});
const point = (day: number, close = 100): HistoricalPoint => ({ timestamp: start + day * DAY, close });

it('grows the target at each historical date instead of applying today’s goal to the past', () => {
  const references = buildHoldingChartReferences([position([lot('BUY', 100, 10, 0)])], [point(-1), point(0), point(366)], .1);
  expect(references[0]).toEqual({ timestamp: point(-1).timestamp, baseline: null, target: null });
  expect(references[1].baseline).toBe(100);
  expect(references[1].target).toBeGreaterThan(100);
  expect(references[1].target).toBeLessThan(100.01);
  expect(references[2].baseline).toBe(100);
  expect(references[2].target).toBeGreaterThan(110);
  expect(references[2].target).toBeLessThan(111);
});

it('includes same-day afternoon trades in the close but excludes every following-day trade', () => {
  const p = position([lot('BUY', 100, 10, 0, 20), lot('BUY', 200, 10, 2)]);
  const references = buildHoldingChartReferences([p], [point(0), point(1), point(2)], 0);
  expect(references[0]).toMatchObject({ baseline: 102, target: 102 });
  expect(references[1]).toMatchObject({ baseline: 102, target: 102 });
  expect(references[2]).toMatchObject({ baseline: 151, target: 151 });
});

it('changes the target after a partial realized loss, including purchase and recorded sale fees', () => {
  const p = position([lot('BUY', 100, 10, 0, 20), lot('SELL', 90, 4, 1, 4), lot('BUY', 1000, 2, 2)]);
  const references = buildHoldingChartReferences([p], [point(0), point(1)], 0);
  expect(references[0]).toMatchObject({ baseline: 102, target: 102 });
  expect(references[1].baseline).toBe(102);
  // Four shares cost 408; net sale proceeds are 356. The remaining six
  // must recover that 52 loss in addition to their own 612 purchase cost.
  expect(references[1].target).toBeCloseTo((612 + 52) / 6, 8);
});

it('carries earlier closed-cycle losses into a reopened holding without drawing during the closed interval', () => {
  const closed = position([lot('BUY', 100, 1, 0), lot('SELL', 80, 1, 1)], { quantity: 0 });
  const reopened = position([lot('BUY', 200, 2, 3)], { id: 'second-account', location: 'bank_two', quantity: 2 });
  const references = buildHoldingChartReferences([closed, reopened], [point(0), point(1), point(2), point(3)], 0);
  expect(references[0]).toMatchObject({ baseline: 100, target: 100 });
  expect(references[1]).toMatchObject({ baseline: null, target: null });
  expect(references[2]).toMatchObject({ baseline: null, target: null });
  expect(references[3]).toMatchObject({ baseline: 200, target: 210 });
});

describe('unavailable transaction history', () => {
  it.each(['missing', 'undated'] as const)('ignores a future %s record until its actual start, then leaves references unknown', (kind) => {
    const valid = position([lot('BUY', 100, 10, 0)]);
    const future = position(kind === 'missing' ? [] : [{ ...lot('BUY', 200, 1, 2), executedAt: 'invalid' }], {
      id: 'incomplete', entryDate: new Date(start + DAY * 2).toISOString(),
    });
    const references = buildHoldingChartReferences([valid, future], [point(1), point(2)], 0);
    expect(references[0]).toMatchObject({ baseline: 100, target: 100 });
    expect(references[1]).toMatchObject({ baseline: null, target: null });
  });

  it('leaves unmatched sells unknown rather than inventing an open cost or target', () => {
    const p = position([lot('SELL', 100, 1, 0)]);
    expect(buildHoldingChartReferences([p], [point(0)], .1)[0]).toMatchObject({ baseline: null, target: null });
  });
});

it('sorts and deduplicates valid price dates without mutating the caller’s records or samples', () => {
  const p = position([lot('BUY', 100, 10, 0)]);
  const points = [point(2), point(0), point(2, 110), point(1, Number.NaN)];
  const snapshot = JSON.stringify({ p, points });
  const references = buildHoldingChartReferences([p], points, 0);
  expect(references.map((reference) => reference.timestamp)).toEqual([point(0).timestamp, point(2).timestamp]);
  expect(JSON.stringify({ p, points })).toBe(snapshot);
});

it('preserves known purchase cost when the personal annual goal is unavailable', () => {
  const p = position([lot('BUY', 100, 10, 0, 20)]);
  expect(buildHoldingChartReferences([p], [point(0)], Number.NaN)[0]).toMatchObject({ baseline: 102, target: null });
});

it('retains a known baseline when earlier profits make the calculated sale target unavailable', () => {
  const closed = position([lot('BUY', 100, 1, 0), lot('SELL', 1000, 1, 1)], { quantity: 0 });
  const reopened = position([lot('BUY', 200, 1, 2)], { id: 'reopened', quantity: 1 });
  expect(buildHoldingChartReferences([closed, reopened], [point(2)], 0)[0]).toMatchObject({ baseline: 200, target: null });
});

describe('cumulative holding performance', () => {
  it('does not create principal-sized jumps when buying at market, and records the real fee', () => {
    const p = position([lot('BUY', 100, 10, 0), lot('BUY', 100, 5, 1, 3)]);
    const series = buildHoldingPerformanceHistory([p], [point(-1), point(0), point(1), point(2)], 0);
    expect(series.map((sample) => sample.actual)).toEqual([null, 0, -3, -3]);
    expect(series.map((sample) => sample.target)).toEqual([null, 0, 0, 0]);
  });

  it('preserves the same partial-sale loss before and after realization, apart from the sale fee', () => {
    const p = position([lot('BUY', 100, 10, 0, 20), lot('SELL', 90, 4, 1, 4)]);
    const series = buildHoldingPerformanceHistory([p], [point(0, 90), point(1, 90)], 0);
    expect(series[0].actual).toBe(-120);
    // Realized -52 + unrealized -72, instead of resetting to the remaining -72.
    expect(series[1].actual).toBe(-124);
    expect(series[1].target).toBe(0);
  });

  it('freezes sold portions of the goal while remaining shares keep accruing a nonnegative goal', () => {
    const p = position([lot('BUY', 100, 10, 0), lot('SELL', 90, 4, 1)]);
    const series = buildHoldingPerformanceHistory([p], [point(1, 90), point(2, 90)], .1);
    const expected = (cost: number, elapsed: number) => cost * (Math.pow(1.1, elapsed / (365.25 * DAY)) - 1);
    const soldAge = DAY;
    const openAge = (2 * DAY - 1) - 18 * 3_600_000;
    expect(series[0].target).toBeCloseTo(expected(400, soldAge) + expected(600, openAge), 10);
    expect(series[1].target).toBeCloseTo(expected(400, soldAge) + expected(600, openAge + DAY), 10);
    expect(series.every((sample) => sample.target !== null && sample.target >= 0)).toBe(true);
  });

  it('freezes both totals while closed and retains earlier losses when reopening', () => {
    const closed = position([lot('BUY', 100, 1, 0), lot('SELL', 80, 1, 1)], { quantity: 0 });
    const reopened = position([lot('BUY', 200, 2, 3)], { id: 'reopened', quantity: 2 });
    const series = buildHoldingPerformanceHistory([closed, reopened], [point(1, 80), point(2, 500), point(3, 200)], .1);
    expect(series.map((sample) => sample.actual)).toEqual([-20, -20, -20]);
    expect(series[1].target).toBe(series[0].target);
    expect(series[2].target).toBeGreaterThan(series[1].target!);
    expect(series.every((sample) => sample.target !== null && sample.target >= 0)).toBe(true);
  });

  it('keeps valid cumulative profit when earlier gains make a sale-price target negative', () => {
    const closed = position([lot('BUY', 100, 1, 0), lot('SELL', 1000, 1, 1)], { quantity: 0 });
    const reopened = position([lot('BUY', 200, 1, 2)], { id: 'reopened', quantity: 1 });
    expect(buildHoldingPerformanceHistory([closed, reopened], [point(2, 200)], 0)[0])
      .toMatchObject({ actual: 900, target: 0 });
  });

  it('does not leak a future sale into earlier profit or goal samples', () => {
    const p = position([lot('BUY', 100, 10, 0), lot('SELL', 1, 10, 2)]);
    const series = buildHoldingPerformanceHistory([p], [point(0), point(1), point(2)], 0);
    expect(series.map((sample) => sample.actual)).toEqual([0, 0, -990]);
  });

  it('preserves known profit with a missing goal, but does not invent profit from invalid trades', () => {
    const p = position([lot('BUY', 100, 10, 0, 20)]);
    expect(buildHoldingPerformanceHistory([p], [point(0)], Number.NaN)[0]).toMatchObject({ actual: -20, target: null });
    const invalid = position([lot('SELL', 100, 1, 0)]);
    expect(buildHoldingPerformanceHistory([invalid], [point(0)], .1)[0]).toMatchObject({ actual: null, target: null });
  });

  it('retains an explicitly configured negative return goal instead of silently clamping it', () => {
    const p = position([lot('BUY', 100, 10, 0)]);
    const sample = buildHoldingPerformanceHistory([p], [point(366)], -.1)[0];
    expect(sample.actual).toBe(0);
    expect(sample.target).toBeLessThan(-100);
  });
});
