import { describe, expect, it } from 'vitest';
import type { Position, PositionLot } from '@/types';
import { calculateCommissionTotals, computeOpenLots, computeRealizedSales, computeRealizedSalesWithFx, expandPositionActivations, mapPositionRow, summarizeLots } from '@/lib/positions';
import { calculatePositionMetrics, calculatePortfolioSummary, calculateRealizedPortfolioTotals, calculateRequiredExitPrice, calculateSymbolExceptionAssessment, enrichPortfolioSummaryWithRealized } from '@/lib/calculations';
const lot = (type: PositionLot['type'], quantity: number, price: number, executedAt: string, extra: Partial<PositionLot> = {}): PositionLot => ({ type, quantity, price, executedAt, hasCommission: false, commissionAmount: 0, ...extra });
const original = [lot('BUY', 10, 100, '2025-01-01'), lot('SELL', 2, 120, '2025-02-01')];
const checkpoint = (quantity = 5, price = 110, extra: Partial<PositionLot> = {}): PositionLot => lot('RECONCILE', quantity, price, '2025-03-01', { basisAcquiredOn: '2025-01-01', ...extra });
const position = (lots: PositionLot[]): Position => ({ id: 'p1', symbol: 'ABC', display: 'ABC', imageUrl: '', location: 'bank_one', quantity: 10, entryPrice: 100, entryDate: '2025-01-01', lots });
describe('immutable broker checkpoints', () => {
  it('sets target open quantity/cost without creating a purchase or a realized sale', () => {
    const lots = [...original, checkpoint()];
    expect(summarizeLots(lots)).toMatchObject({ totalQuantity: 5, costBasis: 550, averageEntryPrice: 110 });
    expect(computeRealizedSales(position(lots))).toEqual(computeRealizedSales(position(original)));
    expect(calculateCommissionTotals(lots, () => 4)).toEqual({ commissionUsd: 0, commissionIls: 0 });
    expect(original[0].quantity).toBe(10);
  });
  it('uses checkpoint cost basis for future real sales and keeps prior sales intact', () => {
    const sales = computeRealizedSales(position([...original, checkpoint(), lot('SELL', 2, 150, '2025-04-01')]));
    expect(sales.map(sale => sale.profitUsd)).toEqual([40, 80]);
    expect(sales[0]).not.toHaveProperty('basisSource');
    expect(sales[1].basisSource).toBe('reconciled_average');
    expect(sales.map(sale => sale.proceedsUsd)).toEqual([240, 300]);
    expect(summarizeLots([...original, checkpoint(), lot('SELL', 2, 150, '2025-04-01')]).costBasis).toBe(330);
  });
  it('zero checkpoint closes without proceeds or fictional realized profit', () => {
    const lots = [...original, checkpoint(0, 0)];
    expect(computeOpenLots(lots)).toEqual([]);
    expect(computeRealizedSales(position(lots))).toHaveLength(1);
    expect(expandPositionActivations(position(lots))[0]).toMatchObject({ quantity: 0, isHistoricalActivation: true, accountingIncomplete: true });
  });
  it('honors created-at insertion order for same-day trades and repeated checkpoints', () => {
    const day = '2025-03-01';
    const lots = [
      lot('SELL', 1, 140, day, { createdAt: `${day}T12:00:00Z` }),
      checkpoint(5, 110, { createdAt: `${day}T10:00:00Z` }),
      lot('BUY', 10, 100, day, { createdAt: `${day}T09:00:00Z` }),
      checkpoint(8, 120, { createdAt: `${day}T11:00:00Z` }),
    ];
    expect(summarizeLots(lots)).toMatchObject({ totalQuantity: 7, costBasis: 840 });
    expect(computeRealizedSales(position(lots))[0].profitUsd).toBe(20);
  });
  it('preserves legacy same-date FIFO order even when creation timestamps differ', () => {
    const day = '2025-03-01';
    const trades = [
      lot('BUY', 1, 100, day, { createdAt: `${day}T10:00:00Z` }),
      lot('BUY', 1, 200, day, { createdAt: `${day}T09:00:00Z` }),
      lot('SELL', 1, 150, day, { createdAt: `${day}T11:00:00Z` }),
    ];
    const before = computeRealizedSales(position(trades));
    expect(before[0].profitUsd).toBe(50);
    const after = computeRealizedSales(position([...trades, checkpoint(5, 110, { createdAt: `${day}T12:00:00Z` })]));
    expect(after).toEqual(before);
    expect(summarizeLots(trades).costBasis).toBe(200);
  });
  it.each(['2025-03-01', '2025-03-02'])('orders shuffled future same-day trades after a checkpoint on %s', day => {
    const cp = checkpoint(0, 0, { createdAt: '2025-03-01T08:00:00Z' });
    const firstBuy = lot('BUY', 1, 100, day, { createdAt: `${day}T09:00:00Z` });
    const secondBuy = lot('BUY', 1, 200, day, { createdAt: `${day}T10:00:00Z` });
    const sale = lot('SELL', 0.5, 150, day, { createdAt: `${day}T11:00:00Z` });
    const shuffled = [secondBuy, sale, cp, firstBuy];
    expect(computeRealizedSales(position(shuffled))[0].profitUsd).toBe(25);
    expect(summarizeLots(shuffled)).toMatchObject({ totalQuantity: 1.5, costBasis: 250 });
    expect(computeRealizedSales(position(shuffled))).toEqual(computeRealizedSales(position([cp, firstBuy, secondBuy, sale])));
  });
  it('does not invent acquisition-date FX, holding age or annual targets when unknown', () => {
    const lots = [...original, checkpoint(5, 110, { basisAcquiredOn: null })];
    const metrics = calculatePositionMetrics(position(lots), 150, 4);
    expect(metrics.positionPnLUsd).toBe(200);
    expect(metrics.currentValue).toBe(750);
    expect(metrics.position.accountingIncomplete).toBe(true);
    expect(Number.isNaN(metrics.positionPnLIls)).toBe(true);
    expect(Number.isNaN(metrics.projectedPrice)).toBe(true);
    expect(Number.isNaN(metrics.yearsHeld)).toBe(true);
    const futureSale = computeRealizedSalesWithFx(position([...lots, lot('SELL', 1, 150, '2025-04-01')]), () => 4)[1];
    expect(futureSale.profitUsd).toBe(40);
    expect(Number.isNaN(futureSale.profitIls)).toBe(true);
    expect(Number.isNaN(futureSale.holdingPeriodDays)).toBe(true);
  });
  it('retains recorded realized subtotal but refuses complete lifetime profitability assertions', () => {
    const source = position([...original, checkpoint()]);
    const metric = calculatePositionMetrics(source, 150, 4);
    const summary = calculatePortfolioSummary([metric], 4, [source]);
    expect(summary.accountingIncomplete).toBe(true);
    const realized = calculateRealizedPortfolioTotals(computeRealizedSales(source), 0.05, 4);
    const enriched = enrichPortfolioSummaryWithRealized(summary, realized, { taxUsd: 10, taxIls: 40 });
    expect(enriched.totalRealizedProfitUsd).toBe(40);
    expect(enriched.totalTaxesPaidUsd).toBeNaN();
    expect(Number.isNaN(enriched.totalNetPnLUsd)).toBe(true);
    expect(calculateRequiredExitPrice([source], 0.05)).toBeUndefined();
    expect(calculateSymbolExceptionAssessment([source], 150, 0.05)?.invalidReason).toBe('reconciliation_history_incomplete');
  });
  it('maps zero checkpoints and preserves original database lots', () => {
    const mapped = mapPositionRow({ id: 'p1', symbol: 'ABC', display: 'ABC', image_url: '', location: '10000000-0000-4000-8000-000000000001', quantity: 10, entry_price: 100, entry_date: '2025-01-01', position_lots: [
      { id: 'l1', position_id: 'p1', side: 'BUY', quantity: 10, price: 100, executed_at: '2025-01-01', has_commission: false, commission_amount: 0 },
      { id: 'l2', position_id: 'p1', side: 'RECONCILE', quantity: 0, price: 0, executed_at: '2025-03-01', has_commission: false, commission_amount: 0, basis_acquired_on: null, created_at: '2025-03-01T10:00:00Z' },
    ] });
    expect(mapped.quantity).toBe(0);
    expect(mapped.lots).toHaveLength(2);
    expect(mapped.accountingIncomplete).toBe(true);
    expect(calculatePositionMetrics(mapped, 150, 4).currentValue).toBe(0);
  });
  it('handles checkpoint reopening without altering a prior closed activation', () => {
    const lots = [lot('BUY', 2, 100, '2025-01-01'), lot('SELL', 2, 120, '2025-02-01'), checkpoint(3, 130)];
    const cycles = expandPositionActivations(position(lots));
    expect(cycles.map(cycle => cycle.quantity)).toEqual([0, 3]);
    expect(cycles[0].lots?.map(item => item.type)).toEqual(['BUY', 'SELL']);
    expect(cycles[1].lots?.map(item => item.type)).toEqual(['RECONCILE']);
    expect(computeRealizedSales(position(lots))[0].profitUsd).toBe(40);
  });
});
