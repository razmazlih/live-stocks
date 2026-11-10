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

describe('full-close pair alternatives', () => {
  it('closes both full quantities and retains a positive combined profit', () => {
    const result = buildClosePairProposals([metric('WIN', 130), metric('LOSS', 80)], 3, asOf);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ profitUsd: 300, lossUsd: 200, netProfitUsd: 100, proceedsUsd: 2100,
      winner: { quantity: 10, currentPrice: 130 }, loser: { quantity: 10, currentPrice: 80 } });
  });

  it('excludes break-even, negative and sub-cent combined results', () => {
    for (const price of [120, 119, 120.0001]) {
      expect(buildClosePairProposals([metric('WIN', price), metric('LOSS', 80)], 3, asOf)).toEqual([]);
    }
    expect(buildClosePairProposals([metric('WIN', 120.001), metric('LOSS', 80)], 3, asOf)).toHaveLength(1);
  });

  it('uses the remaining FIFO shares and allocated buy fees after partial sales', () => {
    const winner = metric('WIN', 130, { lots: [lot(), lot({ quantity: 5, price: 110,
      executedAt: '2026-02-01T00:00:00Z', commissionAmount: 5 }), lot({ type: 'SELL', quantity: 12,
      price: 105, executedAt: '2026-03-01T00:00:00Z', commissionAmount: 100 })] });
    const [result] = buildClosePairProposals([winner, metric('LOSS', 98)], 3, asOf);
    expect(result.winner.quantity).toBe(3);
    expect(result.winner.costBasisUsd).toBe(333);
    expect(result.profitUsd).toBe(57);
    expect(result.lossUsd).toBe(20);
    expect(result.netProfitUsd).toBe(37);
  });

  it('does not treat the original quantity of a fully sold position as still open', () => {
    const closed = metric('WIN', 150, { lots: [lot(), lot({ type: 'SELL', executedAt: '2026-02-01T00:00:00Z' })] });
    expect(buildClosePairProposals([closed, metric('LOSS', 90)], 3, asOf)).toEqual([]);
  });

  it('keeps alternatives within an account and between distinct symbols', () => {
    expect(buildClosePairProposals([metric('WIN', 130), metric('LOSS', 80, { location: 'bank_two' })], 3, asOf)).toEqual([]);
    expect(buildClosePairProposals([metric('WIN', 130), metric(' win ', 80)], 3, asOf)).toEqual([]);
  });

  it('ranks larger covered losses first, then remaining profit, with a bounded list', () => {
    const results = buildClosePairProposals([metric('W1', 160), metric('W2', 150), metric('L1', 80), metric('L2', 90)], 3, asOf);
    expect(results.map(({ winner, loser }) => [winner.position.symbol, loser.position.symbol]))
      .toEqual([['W1', 'L1'], ['W2', 'L1'], ['W1', 'L2']]);
    expect(buildClosePairProposals([metric('W', 160), metric('L', 80)], 0, asOf)).toEqual([]);
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
    for (const winner of bad) expect(buildClosePairProposals([winner, metric('LOSS', 90)], 3, asOf)).toEqual([]);
  });

  it('counts recorded buy fees when deciding whether a winner actually covers a loss', () => {
    expect(buildClosePairProposals([metric('WIN', 121, { lots: [lot({ commissionAmount: 20 })] }),
      metric('LOSS', 80)], 3, asOf)).toEqual([]);
  });
});
