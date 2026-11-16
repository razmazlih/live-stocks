import { afterEach, describe, expect, it, vi } from 'vitest';
import sqlFixture from './fixtures/account-merge-ledgers.json';
import { computeRealizedSalesWithFx, mapPositionRow } from '@/lib/positions';
import { calculatePortfolioSummary, calculatePositionMetrics, calculateRealizedPortfolioTotals } from '@/lib/calculations';

// These synthetic rows were exported BEFORE and AFTER the actual native Postgres
// merge RPCs by scripts/test-account-merge.sql, not assembled by the merge UI.
type Rows = typeof sqlFixture.before | typeof sqlFixture.after;
function ledgerPositions(rows: Rows) {
  return rows.positions.map(row => mapPositionRow({ ...row,
    position_lots: rows.position_lots.filter(lot => lot.position_id === row.id),
  } as Parameters<typeof mapPositionRow>[0]));
}
const fixedFx = () => 3.5;
const fixedPrice = 42;
afterEach(() => vi.useRealTimers());

describe('account merge preserves SQL-produced FIFO ledgers', () => {
  it('preserves each original position and sale calculation, with fixed prices, FX and time', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
    const before = ledgerPositions(sqlFixture.before);
    const after = ledgerPositions(sqlFixture.after);
    const report = (positions: ReturnType<typeof ledgerPositions>) => {
      const metrics = positions.map(position => calculatePositionMetrics(position, fixedPrice, fixedFx(), 0.05, 0, fixedFx));
      const sales = positions.flatMap(position => computeRealizedSalesWithFx(position, fixedFx));
      return { ids: positions.map(position => position.id), sales, metrics,
        totals: calculatePortfolioSummary(metrics, fixedFx(), positions, fixedFx),
        realized: calculateRealizedPortfolioTotals(sales, 0.05, fixedFx(), fixedFx) };
    };
    expect(report(after)).toEqual(report(before));
    expect(after.filter(position => position.symbol.trim().toUpperCase() === 'SAME' && position.location === 'bank_one')).toHaveLength(2);
    expect(report(after).sales).toHaveLength(2);
    expect(new Set(sqlFixture.after.positions.map(position => position.user_id))).toEqual(new Set(['auth0|merge-a']));
  });

  it('would detect the tempting but incorrect concatenation of duplicate-symbol FIFO lots', () => {
    const positions = ledgerPositions(sqlFixture.after).filter(position => position.symbol.trim().toUpperCase() === 'SAME' && position.location === 'bank_one');
    const correct = positions.flatMap(position => computeRealizedSalesWithFx(position, fixedFx));
    const concatenated = computeRealizedSalesWithFx({ ...positions[0], lots: positions.flatMap(position => position.lots ?? []) }, fixedFx);
    expect(concatenated.find(sale => sale.sellDate.startsWith('2020-01-04'))?.costBasisUsd)
      .not.toBe(correct.find(sale => sale.sellDate.startsWith('2020-01-04'))?.costBasisUsd);
  });
});
