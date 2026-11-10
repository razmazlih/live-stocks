import { describe, expect, it } from 'vitest';
import { buildClosePairProposals } from '@/lib/close-pair-proposals';
import { calculatePositionMetrics } from '@/lib/calculations';
import type { Position, PositionLot } from '@/types';

const entryDate = '2026-01-01T00:00:00Z';
const asOf = Date.parse('2026-11-10T00:00:00Z');
function metric(symbol: string, price: number, overrides: Partial<Position> = {}) {
  return calculatePositionMetrics({ symbol, display: symbol, imageUrl: '', location: 'bank_one',
    entryPrice: 100, quantity: 10, entryDate, ...overrides }, price, 3.5);
}
const lot = (overrides: Partial<PositionLot> = {}): PositionLot => ({
  type: 'BUY', quantity: 10, price: 100, executedAt: entryDate,
  hasCommission: true, commissionAmount: 10, ...overrides,
});

describe('non-overlapping full-close pairs', () => {
  it('requires a cent above the personal target as well as positive actual profit', () => {
    const yearEnd = Date.parse(entryDate) + 365.25 * 86_400_000;
    const metrics = [metric('WIN', 125), metric('LOSS', 80)];
    expect(buildClosePairProposals(metrics, 3, yearEnd, .05)).toEqual([]);
    expect(buildClosePairProposals(metrics, 3, yearEnd)).toEqual([]);
    expect(buildClosePairProposals(metrics, 3, yearEnd, 0)[0].netProfitUsd).toBe(50);
    const [eligible] = buildClosePairProposals([metric('WIN', 130.001), metric('LOSS', 80)], 3, yearEnd, .05);
    expect(eligible.targetProfitUsd).toBeCloseTo(100);
    expect(eligible.surplusUsd).toBeCloseTo(.01);
    expect(eligible.winner.targetProfitUsd).toBeCloseTo(50);
    expect(eligible.winner.surplusUsd).toBeCloseTo(250.01);
    expect(eligible.annualGrowthRate).toBe(.05);
    expect(eligible.targetAsOf).toBe(yearEnd);
  });

  it('can pair two actually profitable holdings when one is below the annual target', () => {
    const yearEnd = Date.parse(entryDate) + 365.25 * 86_400_000;
    const [pair] = buildClosePairProposals([metric('ABOVE', 115), metric('BELOW', 102)], 3, yearEnd, .05);
    expect(pair.winner.position.symbol).toBe('ABOVE');
    expect(pair.loser.position.symbol).toBe('BELOW');
    expect(pair.loser.pnlUsd).toBe(20);
    expect(pair.lossUsd).toBe(0);
    expect(pair.netProfitUsd).toBe(170);
    expect(pair.targetProfitUsd).toBeCloseTo(100);
    expect(pair.surplusUsd).toBeCloseTo(70);
    expect(pair.coveredShortfallUsd).toBeCloseTo(30);
    expect(pair.excessProfitUsd).toBeCloseTo(100);
  });

  it('prioritizes the larger target shortfall instead of larger actual loss', () => {
    const yearEnd = Date.parse(entryDate) + 365.25 * 86_400_000;
    const [pair] = buildClosePairProposals([metric('ABOVE', 200),
      metric('ACTUALLOSS', 98, { entryDate: new Date(yearEnd - 86_400_000).toISOString() }),
      metric('TARGETSHORT', 102)], 1, yearEnd, .05);
    expect(pair.loser.position.symbol).toBe('TARGETSHORT');
    expect(pair.coveredShortfallUsd).toBeCloseTo(30);
  });

  it('compounds remaining FIFO costs including allocated fees from each original buy date', () => {
    const yearMs = 365.25 * 86_400_000;
    const start = Date.parse(entryDate);
    const winner = metric('WIN', 200, { lots: [lot(), lot({ quantity: 5, price: 110,
      executedAt: new Date(start + yearMs / 2).toISOString(), commissionAmount: 5 }),
    lot({ type: 'SELL', quantity: 12, price: 150, executedAt: new Date(start + yearMs * .75).toISOString() })] });
    const [result] = buildClosePairProposals([winner, metric('LOSS', 98)], 3, start + yearMs, .1);
    const winnerTarget = 333 * (Math.pow(1.1, .5) - 1);
    expect(result.winner.quantity).toBe(3);
    expect(result.winner.targetProfitUsd).toBeCloseTo(winnerTarget);
    expect(result.loser.targetProfitUsd).toBeCloseTo(100);
    expect(result.targetProfitUsd).toBeCloseTo(winnerTarget + 100);
    expect(result.surplusUsd).toBeCloseTo(247 - winnerTarget - 100);
  });

  it('ranks equal covered losses by surplus over target rather than raw profit', () => {
    const old = metric('OLD', 160, { entryDate: '2020-01-01T00:00:00Z' });
    const recent = metric('NEW', 150, { entryDate: '2026-11-09T00:00:00Z' });
    const [best] = buildClosePairProposals([old, recent, metric('LOSS', 90)], 1, asOf, .05);
    expect(best.winner.position.symbol).toBe('NEW');
    expect(buildClosePairProposals([old, recent, metric('LOSS', 90)], 1, asOf, 0)[0].winner.position.symbol).toBe('OLD');
  });

  it('supports negative targets but still requires positive actual profit, and rejects invalid rates', () => {
    const metrics = [metric('WIN', 121), metric('LOSS', 80)];
    expect(buildClosePairProposals(metrics, 3, asOf, -.05)[0].surplusUsd).toBeGreaterThan(10);
    expect(buildClosePairProposals([metric('WIN', 119), metric('LOSS', 80)], 3, asOf, -.05)).toEqual([]);
    for (const rate of [-1, -2, Number.NaN, Infinity, null]) {
      expect(buildClosePairProposals(metrics, 3, asOf, rate as number)).toEqual([]);
    }
  });

  it('closes both full quantities and retains a positive combined profit', () => {
    const result = buildClosePairProposals([metric('WIN', 130), metric('LOSS', 80)], 3, asOf, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ profitUsd: 300, lossUsd: 200, netProfitUsd: 100, proceedsUsd: 2100,
      winner: { quantity: 10, currentPrice: 130 }, loser: { quantity: 10, currentPrice: 80 } });
  });

  it('excludes break-even, negative and sub-cent combined results', () => {
    for (const price of [120, 119, 120.0001]) {
      expect(buildClosePairProposals([metric('WIN', price), metric('LOSS', 80)], 3, asOf, 0)).toEqual([]);
    }
    expect(buildClosePairProposals([metric('WIN', 120.001), metric('LOSS', 80)], 3, asOf, 0)).toHaveLength(1);
  });

  it('uses the remaining FIFO shares and allocated buy fees after partial sales', () => {
    const winner = metric('WIN', 130, { lots: [lot(), lot({ quantity: 5, price: 110,
      executedAt: '2026-02-01T00:00:00Z', commissionAmount: 5 }), lot({ type: 'SELL', quantity: 12,
      price: 105, executedAt: '2026-03-01T00:00:00Z', commissionAmount: 100 })] });
    const [result] = buildClosePairProposals([winner, metric('LOSS', 98)], 3, asOf, 0);
    expect(result.winner.quantity).toBe(3);
    expect(result.winner.costBasisUsd).toBe(333);
    expect(result.profitUsd).toBe(57);
    expect(result.lossUsd).toBe(20);
    expect(result.netProfitUsd).toBe(37);
  });

  it('does not treat the original quantity of a fully sold position as still open', () => {
    const closed = metric('WIN', 150, { lots: [lot(), lot({ type: 'SELL', executedAt: '2026-02-01T00:00:00Z' })] });
    expect(buildClosePairProposals([closed, metric('LOSS', 90)], 3, asOf, 0)).toEqual([]);
  });

  it('keeps alternatives within an account and between distinct symbols', () => {
    expect(buildClosePairProposals([metric('WIN', 130), metric('LOSS', 80, { location: 'bank_two' })], 3, asOf, 0)).toEqual([]);
    expect(buildClosePairProposals([metric('WIN', 130), metric(' win ', 80)], 3, asOf, 0)).toEqual([]);
  });

  it('ranks larger covered losses first, then remaining profit, with a bounded list', () => {
    const results = buildClosePairProposals([metric('W1', 160), metric('W2', 150), metric('L1', 80), metric('L2', 90)], 3, asOf, 0);
    expect(results.map(({ winner, loser }) => [winner.position.symbol, loser.position.symbol]))
      .toEqual([['W1', 'L1'], ['W2', 'L2']]);
    expect(new Set(results.flatMap(pair => [pair.winner.position.symbol, pair.loser.position.symbol])).size).toBe(4);
  });

  it('never reuses a ticker in either role across accounts, ignoring casing and whitespace', () => {
    const metrics = [metric('WIN', 160), metric('LOSS', 80),
      metric(' win ', 150, { location: 'bank_two' }), metric('OTHER', 90, { location: 'bank_two' }),
      metric('THIRD', 140, { location: 'bank_two' }), metric(' loss ', 90, { location: 'bank_two' }),
      metric(' win ', 90, { location: 'bank_two' }), metric(' loss ', 150, { location: 'bank_two' }),
      metric('FREE', 95, { location: 'bank_two' })];
    const results = buildClosePairProposals(metrics, 3, asOf, 0);
    expect(results.map(({ winner, loser }) => [winner.position.symbol, loser.position.symbol]))
      .toEqual([['WIN', 'LOSS'], ['THIRD', 'OTHER']]);
    const tickers = results.flatMap(pair => [pair.winner, pair.loser])
      .map(leg => leg.position.symbol.trim().toUpperCase());
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it('keeps equal-priority selection deterministic and respects zero, invalid, and positive limits', () => {
    const metrics = [metric('WB', 150), metric('WA', 150), metric('WC', 150), metric('WD', 150),
      metric('LB', 90), metric('LA', 90), metric('LC', 90), metric('LD', 90)];
    const symbols = (items: typeof metrics) => buildClosePairProposals(items, 3, asOf, 0)
      .map(pair => `${pair.winner.position.symbol}/${pair.loser.position.symbol}`);
    expect(symbols(metrics)).toEqual(['WA/LA', 'WB/LB', 'WC/LC']);
    expect(symbols([...metrics].reverse())).toEqual(symbols(metrics));
    expect(buildClosePairProposals(metrics, undefined, asOf, 0)).toHaveLength(3);
    expect(buildClosePairProposals(metrics, 1, asOf, 0)).toHaveLength(1);
    expect(buildClosePairProposals(metrics, 2.9, asOf, 0)).toHaveLength(2);
    for (const limit of [0, -1, 0.9, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildClosePairProposals(metrics, limit, asOf, 0)).toEqual([]);
    }
  });

  it('rejects invalid quotes, malformed or future lots, oversells, and historical activations', () => {
    const bad = [
      metric('WIN', Number.NaN), metric('WIN', Number.POSITIVE_INFINITY), metric('WIN', 0),
      metric('WIN', 130, { isHistoricalActivation: true }),
      metric('WIN', 130, { lots: [lot({ commissionAmount: Number.NaN })] }),
      metric('WIN', 130, { lots: [lot({ executedAt: 'invalid' })] }),
      metric('WIN', 130, { lots: [lot({ executedAt: '2030-01-01' })] }),
      metric('WIN', 130, { lots: [lot({ type: 'SELL' }), lot({ executedAt: '2026-02-01' })] }),
    ];
    for (const winner of bad) expect(buildClosePairProposals([winner, metric('LOSS', 90)], 3, asOf, 0)).toEqual([]);
  });

  it('counts recorded buy fees when deciding whether a winner actually covers a loss', () => {
    expect(buildClosePairProposals([metric('WIN', 121, { lots: [lot({ commissionAmount: 20 })] }),
      metric('LOSS', 80)], 3, asOf, 0)).toEqual([]);
  });
});
