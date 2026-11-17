import { describe, expect, it } from 'vitest';
import { buildPositionTimeline } from '@/lib/portfolio-timeline';
import { buildHoldingChartReferences, buildHoldingPerformanceHistory } from '@/lib/holding-chart-history';
import { hasReconciliationHistory, reconciliationQuality, positionFxTimestamps } from '@/lib/reconciliation-quality';
import { buildCloseProposalSnapshot } from '@/lib/close-proposal-snapshot';
import { calculatePositionMetrics } from '@/lib/calculations';
import { mapPositionRow } from '@/lib/positions';

const start = Date.UTC(2026, 0, 1), day = 86400000;
const position = () => mapPositionRow({ id: 'p', symbol: 'ABC', display: 'ABC', image_url: '', location: 'bank_one', quantity: 10, entry_price: 100, entry_date: '2026-01-01', position_lots: [
  { id: 'buy', position_id: 'p', side: 'BUY', price: 100, quantity: 10, executed_at: '2026-01-01', has_commission: false, commission_amount: 0 },
  { id: 'balance', position_id: 'p', side: 'RECONCILE', price: 90, quantity: 6, executed_at: '2026-01-03', has_commission: false, commission_amount: 0 },
] });
const prices = [0, 1, 2, 3].map(offset => ({ timestamp: start + offset * day, close: 110 }));
describe('reconciliation disclosure and chart semantics', () => {
  it('declares incomplete transaction history without changing known past history', () => {
    const p = position();
    expect(reconciliationQuality([p])).toEqual({ completeCommissionHistory: true, missingCommissionSymbols: [], completeTransactionHistory: false, reconciledSymbols: ['ABC'], realizedProfitScope: 'recorded_executions_only' });
    expect(hasReconciliationHistory(p, start + day)).toBe(false);
    expect(hasReconciliationHistory(p, start + 2 * day)).toBe(true);
    const timeline = buildPositionTimeline(p, prices, .1, prices, () => 3.5, start + 4 * day - 1);
    expect(timeline[1].netPnLUsd).toBe(100);
    expect(timeline[1].spyNetPnLUsd).toBe(0);
    expect(timeline[2].netPnLUsd).toBeNaN();
    expect(timeline[2].spyNetPnLUsd).toBeNaN();
    expect(timeline[3].expectedNetPnLUsd).toBeNaN();
  });
  it('shows confirmed current basis without pretending lifetime performance or target is known', () => {
    const p = position();
    const references = buildHoldingChartReferences([p], prices, .1);
    expect(references[1].baseline).toBe(100);
    expect(references[1].target).toBeGreaterThan(100);
    expect(references[2]).toEqual({ timestamp: start + 2 * day, baseline: 90, target: null });
    const performance = buildHoldingPerformanceHistory([p], prices, .1);
    expect(performance[1].actual).toBe(100);
    expect(performance[2]).toEqual({ timestamp: start + 2 * day, actual: null, target: null });
  });
  it('includes original checkpoint acquisition dates when loading historical FX', () => {
    const p = position();
    p.lots![1].basisAcquiredOn = '2010-03-01';
    expect(Math.min(...positionFxTimestamps(p))).toBe(Date.UTC(2010, 2, 1));
  });
  it('excludes a reconciled symbol from complete-close recommendations explicitly', () => {
    const p = position(), metric = calculatePositionMetrics(p, 110, 3.5, .1);
    const snapshot = buildCloseProposalSnapshot({ positions: [p], metrics: [metric], annualGrowthRate: .1, asOf: start + 4 * day, quotes: { ABC: { priceUsd: 110, marketTimestamp: new Date(start + 3 * day).toISOString(), source: 'fixture', status: 'last_available' } } });
    expect(snapshot.availability).toBe('partial');
    expect(snapshot.coverage.exclusions).toContainEqual({ symbol: 'ABC', reason: 'reconciliation_history_incomplete' });
    expect(snapshot.proposals).toEqual([]);
  });
});
