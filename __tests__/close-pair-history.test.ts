import { describe, expect, it } from 'vitest';
import { buildClosePairHistory } from '@/lib/close-pair-history';
import type { ClosePairLeg, ClosePairProposal } from '@/lib/close-pair-proposals';
import type { HistoricalPoint, PositionLot } from '@/types';

const day = 86_400_000;
const start = Date.parse('2026-01-01T00:00:00Z');
const asOf = start + 10 * day;
const point = (offset: number, close: number): HistoricalPoint => ({ timestamp: start + offset * day, close });
function leg(symbol: string, quantity: number, costBasisUsd: number): ClosePairLeg {
  return { position: { symbol, display: symbol, imageUrl: '', location: 'bank_one',
    quantity, entryPrice: costBasisUsd / quantity, entryDate: new Date(start).toISOString() },
  quantity, currentPrice: 150, costBasisUsd, proceedsUsd: quantity * 150, pnlUsd: quantity * 150 - costBasisUsd, targetProfitUsd: 0, surplusUsd: quantity * 150 - costBasisUsd };
}
function proposal(): ClosePairProposal {
  return { winner: leg('WIN', 2, 200), loser: leg('LOSS', 3, 300),
    profitUsd: 100, lossUsd: 50, netProfitUsd: 50, proceedsUsd: 550, targetProfitUsd: 0, surplusUsd: 50,
    annualGrowthRate: 0, targetAsOf: asOf, coveredShortfallUsd: 50, excessProfitUsd: 100 };
}
const buy = (offset: number, quantity: number, price = 100): PositionLot => ({
  type: 'BUY', quantity, price, executedAt: new Date(start + offset * day).toISOString(),
  hasCommission: false, commissionAmount: 0,
});

describe('combined close-pair history', () => {
  it('subtracts the compounded target at UTC day end and caps today at asOf', () => {
    const pair = proposal();
    pair.annualGrowthRate = .1;
    const time = start + 1.5 * day;
    const result = buildClosePairHistory(pair, [point(0.9, 140), point(1.1, 140)],
      [point(0.9, 100), point(1.1, 100)], time);
    expect(result[0].close).toBeCloseTo(80 - 500 * (Math.pow(1.1, (day - 1) / (365.25 * day)) - 1), 8);
    expect(result[1].close).toBeCloseTo(80 - 500 * (Math.pow(1.1, 1.5 / 365.25) - 1), 8);
  });

  it('uses each remaining FIFO buy date and cost for the historical target', () => {
    const pair = proposal();
    pair.annualGrowthRate = .1;
    pair.winner.position.lots = [{ ...buy(0, 5), hasCommission: true, commissionAmount: 10 },
      { ...buy(1, 4), type: 'SELL' }, buy(2, 1, 98)];
    // Remaining cost: one share at 102 (allocated original fee) + one at 98.
    pair.loser.position.entryDate = new Date(start + day).toISOString();
    const [result] = buildClosePairHistory(pair, [point(3.5, 140)], [point(3.5, 100)], start + 3.75 * day);
    const target = 102 * (Math.pow(1.1, 3.75 / 365.25) - 1) +
      98 * (Math.pow(1.1, 1.75 / 365.25) - 1) + 300 * (Math.pow(1.1, 2.75 / 365.25) - 1);
    expect(result.close).toBeCloseTo(80 - target, 8);
  });

  it('does not silently assume a zero target when the annual rate is missing or invalid', () => {
    for (const rate of [undefined, null, Number.NaN, Infinity, -1]) {
      const pair = proposal();
      pair.annualGrowthRate = rate as number;
      expect(buildClosePairHistory(pair, [point(0, 100)], [point(0, 100)], asOf)).toEqual([]);
    }
    const pair = proposal();
    pair.annualGrowthRate = -.05;
    expect(buildClosePairHistory(pair, [point(1, 100)], [point(1, 100)], asOf)[0].close).toBeGreaterThan(0);
  });

  it('defaults to the proposal target timestamp so refreshing the graph does not advance its target', () => {
    const pair = proposal();
    pair.annualGrowthRate = .1;
    pair.targetAsOf = start + 1.5 * day;
    const winner = [point(1.1, 140), point(2.1, 140)];
    const loser = [point(1.2, 100), point(2.2, 100)];
    const result = buildClosePairHistory(pair, winner, loser);
    expect(result).toHaveLength(1);
    expect(result[0].close).toBeCloseTo(80 - 500 * (Math.pow(1.1, 1.5 / 365.25) - 1), 8);
  });

  it('calculates a fixed-quantity USD simulation that can cross zero', () => {
    const result = buildClosePairHistory(proposal(), [point(0, 90), point(1, 140)],
      [point(0, 80), point(1, 100)], asOf);
    expect(result).toEqual([point(0, -80), point(1, 80)]);
  });

  it('keeps only common UTC days, sorts them, and uses each latest valid observation', () => {
    const winner = [point(3.8, 160), point(0.9, 130), point(2.8, 150), point(0.2, 110), point(3.9, Number.NaN)];
    const loser = [point(3.5, 90), point(1.5, 80), point(0.5, 100), point(0.1, 95)];
    expect(buildClosePairHistory(proposal(), winner, loser, asOf))
      .toEqual([point(0, 60), point(3, 90)]);
    expect(winner[0]).toEqual(point(3.8, 160));
    expect(loser[0]).toEqual(point(3.5, 90));
  });

  it('omits invalid prices, future observations and days absent from either input without filling', () => {
    const winner = [point(0, 100), point(1, 0), point(2, -1), point(3, Infinity), point(4, 120), point(11, 120),
      { timestamp: Number.NaN, close: 120 }];
    const loser = [0, 1, 2, 3, 5, 11].map(offset => point(offset, 100));
    expect(buildClosePairHistory(proposal(), winner, loser, asOf)).toEqual([point(0, 0)]);
    expect(buildClosePairHistory(proposal(), [], loser, asOf)).toEqual([]);
    expect(buildClosePairHistory(proposal(), winner, [], asOf)).toEqual([]);
  });

  it('does not use an observation later today than asOf or append current prices', () => {
    const result = buildClosePairHistory(proposal(), [point(0.9, 100), point(1.1, 110), point(1.9, 999)],
      [point(0.8, 100), point(1.2, 100)], start + 1.5 * day);
    expect(result).toEqual([point(0, 0), point(1, 20)]);
    expect(result).toHaveLength(2);
  });

  it('starts when the newest remaining FIFO buy exists, excluding fully sold older buys', () => {
    const pair = proposal();
    pair.winner.position.lots = [buy(-10, 5), { ...buy(-5, 5), type: 'SELL' }, buy(2.5, 1), buy(4.5, 1)];
    pair.loser.position.lots = [buy(3.5, 3)];
    const winner = [0, 1, 2, 3, 4, 5].map(offset => point(offset + .8, 140));
    const loser = [0, 1, 2, 3, 4, 5].map(offset => point(offset + .9, 100));
    expect(buildClosePairHistory(pair, winner, loser, asOf)).toEqual([point(4, 80), point(5, 80)]);
  });

  it('uses entryDate for holdings without lots and excludes unavailable or invalid entries', () => {
    const pair = proposal();
    pair.loser.position.entryDate = new Date(start + 2 * day).toISOString();
    const history = [point(0, 100), point(1, 100), point(2, 100)];
    expect(buildClosePairHistory(pair, history, history, asOf)).toEqual([point(2, 0)]);
    pair.loser.position.entryDate = 'invalid';
    expect(buildClosePairHistory(pair, history, history, asOf)).toEqual([]);
    pair.loser.position.entryDate = new Date(asOf + day).toISOString();
    expect(buildClosePairHistory(pair, history, history, asOf)).toEqual([]);
  });

  it('rejects invalid current quantities or costs instead of showing misleading history', () => {
    for (const value of [0, -1, Number.NaN, Infinity]) {
      const pair = proposal();
      pair.winner.quantity = value;
      expect(buildClosePairHistory(pair, [point(0, 100)], [point(0, 100)], asOf)).toEqual([]);
      pair.winner.quantity = 2;
      pair.loser.costBasisUsd = value;
      expect(buildClosePairHistory(pair, [point(0, 100)], [point(0, 100)], asOf)).toEqual([]);
    }
  });
});
