import type { HistoricalPoint, PortfolioTimelinePoint, Position, PositionLot } from '@/types';
import { calculateCommissionTotals, computeOpenLots, computeRealizedSalesWithFx } from '@/lib/positions';
import { hasReconciliationHistory } from '@/lib/reconciliation-quality';
import { calculateRealizedPortfolioTotals } from '@/lib/calculations';

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;
const dayStart = (timestamp: number) => Math.floor(timestamp / DAY_MS) * DAY_MS;

/** Daily valuations use that day's close, or the last available close on market holidays.
 * Transactions and acquisition costs are evaluated as of the valuation, never from future lots.
 */
export function buildPositionTimeline(
  position: Position,
  points: HistoricalPoint[],
  annualGrowthRate: number,
  spyPoints: HistoricalPoint[],
  getFxRateAt: (timestamp: number) => number,
  asOf = Date.now(),
): PortfolioTimelinePoint[] {
  const prices = points.filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.close) && p.close > 0).slice().sort((a, b) => a.timestamp - b.timestamp);
  const spy = spyPoints.filter(p => Number.isFinite(p.timestamp) && p.close > 0).slice().sort((a, b) => a.timestamp - b.timestamp);
  const lots: PositionLot[] = (position.lots?.length ? position.lots : position.quantity > 0 ? [{ type: 'BUY' as const, price: position.entryPrice, quantity: position.quantity, executedAt: position.entryDate, hasCommission: false, commissionAmount: 0 }] : [])
    .filter(lot => (lot.quantity > 0 || lot.type === 'RECONCILE') && Number.isFinite(Date.parse(lot.executedAt)))
    .slice().sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt));
  if (!lots.length) return [];
  const first = dayStart(Date.parse(lots[0].executedAt));
  const priceAt = (history: HistoricalPoint[], timestamp: number) => {
    let low = 0; let high = history.length - 1; let value: number | undefined;
    const day = dayStart(timestamp);
    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (dayStart(history[mid].timestamp) <= day) { value = history[mid].close; low = mid + 1; }
      else high = mid - 1;
    }
    return value;
  };
  const timeline: PortfolioTimelinePoint[] = [];
  for (let day = first; day <= dayStart(asOf); day += DAY_MS) {
    const timestamp = Math.min(day + DAY_MS - 1, asOf);
    const activeLots = lots.filter(lot => Date.parse(lot.executedAt) <= timestamp);
    const snapshot = { ...position, lots: activeLots };
    if (hasReconciliationHistory(snapshot, timestamp)) {
      // A checkpoint is not a sale or a purchase. Never draw a fabricated
      // lifetime-return/benchmark bridge over unrecorded executions.
      timeline.push({ ...calculateCommissionTotals(activeLots, getFxRateAt, timestamp), timestamp,
        totalPnLUsd: Number.NaN, totalPnLIls: Number.NaN, netPnLUsd: Number.NaN, netPnLIls: Number.NaN,
        expectedNetPnLUsd: Number.NaN, expectedNetPnLIls: Number.NaN, spyNetPnLUsd: Number.NaN, spyNetPnLIls: Number.NaN });
      continue;
    }
    const open = computeOpenLots(activeLots);
    const realized = calculateRealizedPortfolioTotals(computeRealizedSalesWithFx(snapshot, getFxRateAt), annualGrowthRate, getFxRateAt(timestamp), getFxRateAt);
    const close = priceAt(prices, timestamp);
    const fx = getFxRateAt(timestamp);
    let actualUsd = realized.profitUsd;
    let actualIls = realized.profitIls;
    let targetUsd = realized.expectedProfitUsd;
    let targetIls = realized.expectedProfitIls;
    for (const lot of open) {
      const buyTime = Date.parse(lot.executedAt);
      const buyFx = getFxRateAt(buyTime);
      const gain = lot.totalCost * (Math.pow(1 + annualGrowthRate, Math.max(0, timestamp - buyTime) / YEAR_MS) - 1);
      actualUsd += lot.quantity * (close ?? Number.NaN) - lot.totalCost;
      actualIls += lot.quantity * (close ?? Number.NaN) * fx - lot.totalCost * buyFx;
      targetUsd += gain;
      targetIls += gain * buyFx;
    }
    // SPY is a counterfactual investment of each purchase's full cost; sales freeze its return.
    const spyQueue: Array<{ quantity: number; invested: number; buyPrice: number | undefined }> = [];
    let spyRealized = 0;
    for (const lot of activeLots) {
      if (lot.type === 'BUY') {
        spyQueue.push({ quantity: lot.quantity, invested: lot.price * lot.quantity + (lot.hasCommission ? Math.max(lot.commissionAmount, 0) : 0), buyPrice: priceAt(spy, Date.parse(lot.executedAt)) });
      } else {
        let remaining = lot.quantity;
        while (remaining > 0 && spyQueue.length) {
          const buy = spyQueue[0];
          const matched = Math.min(remaining, buy.quantity);
          const invested = buy.invested * matched / buy.quantity;
          const sellPrice = priceAt(spy, Date.parse(lot.executedAt));
          if (buy.buyPrice && sellPrice) spyRealized += invested * (sellPrice / buy.buyPrice - 1);
          buy.invested -= invested; buy.quantity -= matched; remaining -= matched;
          if (buy.quantity <= 1e-8) spyQueue.shift();
        }
      }
    }
    const spyClose = priceAt(spy, timestamp);
    const spyPnl = spyQueue.reduce((sum, buy) => sum + (buy.buyPrice && spyClose ? buy.invested * (spyClose / buy.buyPrice - 1) : 0), spyRealized);
    timeline.push({ ...calculateCommissionTotals(activeLots, getFxRateAt, timestamp), timestamp, totalPnLUsd: actualUsd, totalPnLIls: actualIls, netPnLUsd: actualUsd, netPnLIls: actualIls, expectedNetPnLUsd: targetUsd, expectedNetPnLIls: targetIls, spyNetPnLUsd: spyPnl, spyNetPnLIls: spyPnl * fx });
  }
  return timeline;
}
