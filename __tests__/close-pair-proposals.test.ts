import { describe, expect, it } from 'vitest';
import { buildClosePairProposals as buildWithPolicy, getCloseProposalLegs } from '@/lib/close-pair-proposals';
import { calculatePositionMetrics, calculateSymbolExceptionAssessment } from '@/lib/calculations';
import type { Position, PositionLot } from '@/types';

// Legacy accounting/ranking cases isolate those contracts from the new loss filters.
const buildClosePairProposals: typeof buildWithPolicy = (metrics, limit, asOf, rate, originals, policy) =>
  buildWithPolicy(metrics, limit, asOf, rate, originals,
    { minHoldingDays: 0, minLossPercent: 0, minLossUsd: 0, maxLosers: 1, ...policy });

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
  it('includes holdings in arbitrary third and fourth sources', () => {
    const metrics = [
      metric('WIN', 140, { location: '30000000-0000-4000-8000-000000000003' }),
      metric('LOSS', 80, { location: '40000000-0000-4000-8000-000000000004' }),
    ];
    const [proposal] = buildClosePairProposals(metrics, 3, asOf, 0, metrics.map(item => item.position));
    expect(proposal.netProfitUsd).toBe(200);
    expect(proposal.winner.position.location).toBe('30000000-0000-4000-8000-000000000003');
  });

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

  it('does not treat a profitable holding below target as an actual loser', () => {
    const yearEnd = Date.parse(entryDate) + 365.25 * 86_400_000;
    expect(buildClosePairProposals([metric('ABOVE', 115), metric('BELOW', 102)], 3, yearEnd, .05)).toEqual([]);
  });

  it('prioritizes the largest actual loss rather than target shortfall', () => {
    const yearEnd = Date.parse(entryDate) + 365.25 * 86_400_000;
    const [pair] = buildClosePairProposals([metric('ABOVE', 200),
      metric('ACTUALLOSS', 98, { entryDate: new Date(yearEnd - 86_400_000).toISOString() }),
      metric('TARGETSHORT', 102)], 1, yearEnd, .05);
    expect(pair.loser.position.symbol).toBe('ACTUALLOSS');
    expect(pair.lossUsd).toBe(20);
  });

  it('compounds open FIFO targets and freezes sold-share targets at each sale', () => {
    const yearMs = 365.25 * 86_400_000;
    const start = Date.parse(entryDate);
    const winner = metric('WIN', 200, { lots: [lot(), lot({ quantity: 5, price: 110,
      executedAt: new Date(start + yearMs / 2).toISOString(), commissionAmount: 5 }),
    lot({ type: 'SELL', quantity: 12, price: 150, executedAt: new Date(start + yearMs * .75).toISOString() })] });
    const [result] = buildClosePairProposals([winner, metric('LOSS', 98)], 3, start + yearMs, .1);
    const winnerTarget = 333 * (Math.pow(1.1, .5) - 1)
      + 1010 * (Math.pow(1.1, .75) - 1) + 222 * (Math.pow(1.1, .25) - 1);
    expect(result.winner.quantity).toBe(3);
    expect(result.winner.targetProfitUsd).toBeCloseTo(winnerTarget);
    expect(result.loser.targetProfitUsd).toBeCloseTo(100);
    expect(result.targetProfitUsd).toBeCloseTo(winnerTarget + 100);
    expect(result.winner.realizedPnlUsd).toBeCloseTo(558);
    expect(result.surplusUsd).toBeCloseTo(805 - winnerTarget - 100);
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

  it('includes partial-sale losses and both buy and sell fees before proposing a close', () => {
    const winner = metric('WIN', 130, { lots: [lot(), lot({ quantity: 5, price: 110,
      executedAt: '2026-02-01T00:00:00Z', commissionAmount: 5 }), lot({ type: 'SELL', quantity: 12,
      price: 105, executedAt: '2026-03-01T00:00:00Z', commissionAmount: 100 })] });
    expect(buildClosePairProposals([winner, metric('LOSS', 98)], 3, asOf, 0)).toEqual([]);
    const [result] = buildClosePairProposals([{ ...winner, currentPrice: 200 }, metric('LOSS', 98)], 3, asOf, 0);
    expect(result.winner.quantity).toBe(3);
    expect(result.winner.costBasisUsd).toBe(333);
    expect(result.winner.realizedPnlUsd).toBe(-72);
    expect(result.winner.unrealizedPnlUsd).toBe(267);
    expect(result.profitUsd).toBe(195);
    expect(result.lossUsd).toBe(20);
    expect(result.netProfitUsd).toBe(175);
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


describe('complete original history supplied by the portfolio', () => {
  const reopen = (symbol: string, realizedPrice = 50): Position => ({
    ...metric(symbol, 90).position, id: `${symbol}-original`,
    lots: [lot({ hasCommission: false }),
      lot({ type: 'SELL', price: realizedPrice, hasCommission: false, executedAt: '2026-02-01T00:00:00Z' }),
      lot({ price: 100, hasCommission: false, executedAt: '2026-03-01T00:00:00Z' })],
  });

  it('rejects a CAPR pair which appears profitable only when the earlier loss is omitted', () => {
    const winner = metric('CME', 130);
    const currentCapr = metric('CAPR', 90, { id: 'CAPR-original', originalId: 'CAPR-original', activationId: 'CAPR::activation-2',
      lots: [lot({ price: 100, hasCommission: false, executedAt: '2026-03-01T00:00:00Z' })] });
    expect(buildClosePairProposals([winner, currentCapr], 3, asOf, 0)).toHaveLength(1);
    expect(buildClosePairProposals([winner, currentCapr], 3, asOf, 0, [winner.position, reopen('CAPR')])).toEqual([]);
  });

  it('includes realized history exactly once despite activation metrics and keeps only current cash proceeds', () => {
    const winner = metric('CME', 200);
    const capr = reopen('CAPR');
    const current = metric('CAPR', 90, { ...capr, lots: [capr.lots![2]], activationId: 'capr-current' });
    const previous = metric('CAPR', 90, { ...capr, lots: capr.lots!.slice(0, 2), quantity: 0, isHistoricalActivation: true });
    const [pair] = buildClosePairProposals([winner, current, previous], 3, asOf, 0, [winner.position, capr]);
    expect(pair.loser).toMatchObject({ realizedPnlUsd: -500, unrealizedPnlUsd: -100, pnlUsd: -600, quantity: 10, proceedsUsd: 900 });
    expect(pair.netProfitUsd).toBe(400);
    expect(pair.proceedsUsd).toBe(2900);
    expect(pair.loser.historicalPositions).toHaveLength(1);
  });

  it('can use a prior realized gain while stopping its personal target at the sale', () => {
    const capr = reopen('CAPR', 150);
    const loser = metric('LOSS', 90);
    const caprMetric = metric('CAPR', 105);
    const [pair] = buildClosePairProposals([caprMetric, loser], 3, asOf, .05, [capr, loser.position]);
    expect(pair.winner).toMatchObject({ realizedPnlUsd: 500, unrealizedPnlUsd: 50, pnlUsd: 550 });
    const target = 1000 * (Math.pow(1.05, 31 / 365.25) - 1)
      + 1000 * (Math.pow(1.05, (asOf - Date.parse('2026-03-01T00:00:00Z')) / (365.25 * 86_400_000)) - 1);
    expect(pair.winner.targetProfitUsd).toBeCloseTo(target);
  });

  it('aggregates every open account while keeping each account FIFO separate', () => {
    const one = reopen('CAPR', 50);
    const two = { ...metric(' capr ', 90, { location: 'bank_two', quantity: 3, entryPrice: 70 }).position, id: 'capr-two' };
    const winner = metric('CME', 200, { location: 'bank_two' });
    const [pair] = buildClosePairProposals([winner, metric('CAPR', 90)], 3, asOf, 0, [one, two, winner.position]);
    expect(pair.loser.quantity).toBe(13);
    expect(pair.loser.proceedsUsd).toBe(1170);
    expect(pair.loser.costBasisUsd).toBe(1210);
    expect(pair.loser.realizedPnlUsd).toBe(-500);
    expect(pair.loser.pnlUsd).toBe(-540);
    expect(pair.loser.locations).toEqual(['bank_one', 'bank_two']);
    expect(pair.proceedsUsd).toBe(3170);
  });

  it('includes closed-account losses even when shares remain only in a different account', () => {
    const closed = reopen('CAPR');
    closed.lots = closed.lots!.slice(0, 2);
    closed.quantity = 0;
    const active = metric('CAPR', 90, { id: 'capr-active', location: 'bank_two' });
    const winner = metric('CME', 200, { location: 'bank_one' });
    const [pair] = buildClosePairProposals([winner, active], 3, asOf, 0, [closed, active.position, winner.position]);
    expect(pair.loser.realizedPnlUsd).toBe(-500);
    expect(pair.loser.locations).toEqual(['bank_two']);
    expect(pair.netProfitUsd).toBe(400);
  });

  it('does not cover a sell in one account using buys from another account', () => {
    const bad = { ...metric('CAPR', 90).position, id: 'bad', lots: [lot({ type: 'SELL' })] };
    const active = metric('CAPR', 90, { id: 'active', location: 'bank_two' });
    const winner = metric('CME', 200);
    expect(buildClosePairProposals([winner, active], 3, asOf, 0, [bad, active.position, winner.position])).toEqual([]);
  });

  it('matches the owning symbol assessment for mixed sales, rebuys and recorded fees', () => {
    const source = reopen('CAPR', 50);
    source.lots = [lot({ commissionAmount: 20 }),
      lot({ type: 'SELL', quantity: 4, price: 70, commissionAmount: 3, executedAt: '2026-02-01T00:00:00Z' }),
      lot({ type: 'SELL', quantity: 6, price: 95, commissionAmount: 4, executedAt: '2026-03-01T00:00:00Z' }),
      lot({ quantity: 3, price: 90, commissionAmount: 5, executedAt: '2026-04-01T00:00:00Z' }),
      lot({ type: 'SELL', quantity: 1, price: 110, commissionAmount: 2, executedAt: '2026-05-01T00:00:00Z' })];
    const secondAccount = { ...metric('CAPR', 80, { location: 'bank_two', quantity: 2, entryPrice: 85 }).position, id: 'capr-second',
      lots: [lot({ quantity: 2, price: 85, commissionAmount: 1 })] };
    const winner = metric('CME', 250);
    const [pair] = buildClosePairProposals([winner, metric('CAPR', 80)], 3, asOf, .08,
      [source, secondAccount, winner.position]);
    const assessment = calculateSymbolExceptionAssessment([source, secondAccount], 80, .08, new Date(asOf));
    expect(assessment?.status).toBe('open');
    expect(pair.loser.pnlUsd).toBeCloseTo(assessment!.actualProfitUsd);
    expect(pair.loser.realizedPnlUsd).toBeCloseTo(assessment!.realizedProfitUsd);
    expect(pair.loser.targetProfitUsd).toBeCloseTo(assessment!.expectedProfitUsd);
    expect(pair.loser.surplusUsd).toBeCloseTo(assessment!.profitGapUsd);
    expect(pair.loser.quantity).toBeCloseTo(assessment!.openQuantity);
  });

  it('fails closed when a legacy closed record has no transaction history to account for its cash', () => {
    const winner = metric('CME', 250);
    const active = metric('CAPR', 80, { id: 'active' });
    const unknownClosed = { ...active.position, id: 'unknown-closed', quantity: 0, lots: [] };
    expect(buildClosePairProposals([winner, active], 3, asOf, 0,
      [winner.position, active.position, unknownClosed])).toEqual([]);
  });

  it('does not fall back to activation slices when original history is missing or invalid', () => {
    const metrics = [metric('CME', 200), metric('CAPR', 90)];
    for (const positions of [[], [metrics[0].position], [metrics[0].position, { ...reopen('CAPR'), lots: [lot({ executedAt: '2030-01-01' })] }],
      [metrics[0].position, { ...reopen('CAPR'), activationId: 'capr-slice' }],
      [metrics[0].position, reopen('CAPR'), reopen('CAPR')]]) {
      expect(buildClosePairProposals(metrics, 3, asOf, 0, positions)).toEqual([]);
    }
  });
});

describe('material loss groups with default protection policy', () => {
  it('closes one winner with up to three losing stocks and sums every leg', () => {
    const metrics = [metric('WIN', 200), metric('LARGE', 80), metric('MID', 85), metric('SMALL', 90), metric('FOURTH', 95)];
    const proposals = buildWithPolicy(metrics, 3, asOf, 0);
    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(getCloseProposalLegs(proposal).map(leg => leg.position.symbol)).toEqual(['WIN', 'LARGE', 'MID', 'SMALL']);
    expect(proposal).toMatchObject({ lossUsd: 450, netProfitUsd: 550, proceedsUsd: 4550, searchTruncated: false });
    expect(proposal.loser).toBe(proposal.losers![0]);
  });

  it('requires both minimum open dollar loss and minimum open loss percentage', () => {
    const winner = metric('WIN', 200);
    for (const loser of [metric('TINYUSD', 90, { quantity: 1 }), metric('TINYPCT', 99, { quantity: 100 })]) {
      expect(buildWithPolicy([winner, loser], 3, asOf, 0)).toEqual([]);
    }
    const [boundary] = buildWithPolicy([winner, metric('BOUNDARY', 95)], 3, asOf, 0);
    expect(boundary.loser.lossPercent).toBe(5);
    expect(boundary.lossUsd).toBe(50);
  });

  it('protects recent purchases except for a severe actual loss', () => {
    const recent = { entryDate: new Date(asOf - 10 * 86_400_000).toISOString() };
    expect(buildWithPolicy([metric('WIN', 200), metric('RECENT', 90, recent)], 3, asOf, 0)).toEqual([]);
    const [severe] = buildWithPolicy([metric('WIN', 200), metric('RECENT', 85, recent)], 3, asOf, 0);
    expect(severe.loser.weightedHoldingDays).toBe(10);
    expect(severe.loser.lossPercent).toBe(15);
    const oldEnough = { entryDate: new Date(asOf - 30 * 86_400_000).toISOString() };
    expect(buildWithPolicy([metric('WIN', 200), metric('AGED', 90, oldEnough)], 3, asOf, 0)).toHaveLength(1);
  });

  it('uses remaining cost-weighted age so a small recent addition does not reset a seasoned holding', () => {
    const ageDate = (days: number) => new Date(asOf - days * 86_400_000).toISOString();
    const loser = metric('MIXED', 90, { lots: [
      lot({ quantity: 9, executedAt: ageDate(100), hasCommission: false }),
      lot({ quantity: 1, executedAt: ageDate(1), hasCommission: false }),
    ] });
    const [proposal] = buildWithPolicy([metric('WIN', 200), loser], 3, asOf, 0);
    expect(proposal.loser.weightedHoldingDays).toBeCloseTo(90.1);
    const recentHeavy = metric('MIXED', 90, { lots: [
      lot({ quantity: 1, executedAt: ageDate(100), hasCommission: false }),
      lot({ quantity: 9, executedAt: ageDate(1), hasCommission: false }),
    ] });
    expect(buildWithPolicy([metric('WIN', 200), recentHeavy], 3, asOf, 0)).toEqual([]);
  });

  it('does not use an old closed cycle to age a newly reopened loss', () => {
    const source = metric('REOPEN', 90, { lots: [
      lot({ hasCommission: false }),
      lot({ type: 'SELL', price: 90, hasCommission: false, executedAt: '2026-02-01T00:00:00Z' }),
      lot({ hasCommission: false, executedAt: new Date(asOf - 86_400_000).toISOString() }),
    ] });
    expect(buildWithPolicy([metric('WIN', 200), source], 3, asOf, 0)).toEqual([]);
  });

  it('requires winner and losers to have matching cumulative and open profit signs', () => {
    const history = (symbol: string, soldPrice: number, currentPrice: number) => metric(symbol, currentPrice, { lots: [
      lot({ hasCommission: false }),
      lot({ type: 'SELL', price: soldPrice, hasCommission: false, executedAt: '2026-02-01T00:00:00Z' }),
      lot({ hasCommission: false, executedAt: '2026-03-01T00:00:00Z' }),
    ] });
    expect(buildWithPolicy([history('FALSEWIN', 200, 90), metric('LOSS', 90)], 3, asOf, 0)).toEqual([]);
    expect(buildWithPolicy([metric('WIN', 200), history('FALSELOSS', 50, 110)], 3, asOf, 0)).toEqual([]);
    expect(buildWithPolicy([metric('WIN', 200), history('OPENLOSS', 200, 90)], 3, asOf, 0)).toEqual([]);
  });

  it('requires the complete group to cover all historical targets and remain profitable', () => {
    const [proposal] = buildWithPolicy([metric('WIN', 135), metric('LARGE', 80), metric('SMALL', 90)], 3, asOf, .05);
    expect(proposal.losers).toHaveLength(1);
    expect(proposal.loser.position.symbol).toBe('LARGE');
    expect(proposal.surplusUsd).toBeGreaterThan(0);
  });

  it('prioritizes the largest individual cumulative loss ahead of more smaller losses', () => {
    const metrics = [metric('WIN', 126), metric('LARGE', 75), metric('MID', 85), metric('SMALL', 90)];
    const [proposal] = buildWithPolicy(metrics, 1, asOf, 0);
    expect(proposal.losers!.map(leg => leg.position.symbol)).toEqual(['LARGE']);
  });

  it('honors configurable filters and group sizes, rejects unsafe or invalid policy bounds', () => {
    const metrics = [metric('WIN', 200), metric('LARGE', 80), metric('SMALL', 90)];
    expect(buildWithPolicy(metrics, 3, asOf, 0, undefined, { maxLosers: 1 })[0].losers).toHaveLength(1);
    expect(buildWithPolicy([metric('WIN', 200), metric('TINY', 98)], 3, asOf, 0)).toEqual([]);
    expect(buildWithPolicy([metric('WIN', 200), metric('TINY', 98)], 3, asOf, 0, undefined,
      { minLossUsd: 10, minLossPercent: 1 })).toHaveLength(1);
    for (const policy of [{ maxLosers: 4 }, { maxCandidateLosers: 51 }, { minHoldingDays: -1 },
      { maxLosers: 1.5 }, { minLossUsd: NaN }, { severeLossPercent: 1 }]) {
      expect(buildWithPolicy(metrics, 3, asOf, 0, undefined, policy)).toEqual([]);
    }
  });

  it('caps candidate search deterministically and discloses truncation without reusing symbols', () => {
    const metrics = [metric('WA', 200), metric('WB', 200), metric('L1', 80), metric('L2', 85), metric('L3', 90)];
    const build = (items: typeof metrics) => buildWithPolicy(items, 3, asOf, 0, undefined, { maxCandidateLosers: 2, maxLosers: 1 });
    const proposals = build(metrics);
    expect(proposals).toHaveLength(2);
    expect(proposals.every(proposal => proposal.searchTruncated)).toBe(true);
    expect(proposals.map(proposal => getCloseProposalLegs(proposal).map(leg => leg.position.symbol)))
      .toEqual(build([...metrics].reverse()).map(proposal => getCloseProposalLegs(proposal).map(leg => leg.position.symbol)));
    const symbols = proposals.flatMap(getCloseProposalLegs).map(leg => leg.position.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
});
