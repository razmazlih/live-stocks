import { buildHoldingPerformanceHistory } from '@/lib/holding-chart-history';
import { computeOpenLots } from '@/lib/positions';
import { getCloseProposalLegs, type ClosePairLeg, type ClosePairProposal } from '@/lib/close-pair-proposals';
import type { HistoricalPoint } from '@/types';

const DAY_MS = 86_400_000;
const utcDay = (timestamp: number) => Math.floor(timestamp / DAY_MS) * DAY_MS;

function latestRemainingBuy(leg: ClosePairLeg): number {
  const openLots = leg.position.lots?.length ? computeOpenLots(leg.position.lots) : [];
  const dates = openLots.length
    ? openLots.map(lot => Date.parse(lot.executedAt))
    : [Date.parse(leg.position.entryDate)];
  return dates.every(Number.isFinite) ? Math.max(...dates) : Number.NaN;
}

function pricesByDay(history: HistoricalPoint[], startDay: number, asOf: number) {
  const prices = new Map<number, HistoricalPoint>();
  for (const point of history) {
    if (!Number.isFinite(point.timestamp) || point.timestamp > asOf ||
        !Number.isFinite(point.close) || point.close <= 0) continue;
    const day = utcDay(point.timestamp);
    if (day < startDay) continue;
    const previous = prices.get(day);
    // Prefer the last actual observation of a UTC day, regardless of input order.
    if (!previous || point.timestamp >= previous.timestamp) prices.set(day, point);
  }
  return prices;
}

/**
 * With authoritative historicalPositions on every leg, actual cumulative
 * realized + unrealized USD P/L minus accrued target is rebuilt at every shared
 * available daily close. Dates are the union of all price histories: a missing
 * quote is allowed only for a symbol with no open exposure, while its realized
 * result and frozen target remain included. Each account retains its own FIFO matching. Targets on sold lots
 * stop at sale time; today's state is capped at asOf, including transactions.
 * No future transactions, filled prices or synthetic live quote are introduced.
 * For legacy callers without historicalPositions, retain the older simulation:
 * Retrospective USD simulation of today's remaining shares and FIFO cost basis:
 * qWinner * historicalPriceWinner + qLoser * historicalPriceLoser - currentCost
 * minus the personal annual target accrued from each remaining buy through that
 * UTC day's end (capped at asOf). Zero represents meeting the target, not merely
 * breaking even. The same 365.25-day compound model is used for current ideas.
 * This is not actual historical portfolio P/L: quantities/costs stay fixed and
 * realized sales, taxes and future exit fees are excluded. Begin on the UTC day
 * of the latest buy still represented in any remaining holding. Only days
 * observed in every input series are returned, at UTC midnight, using each day's
 * latest valid positive price no later than asOf. Never fill missing days or
 * append a synthetic current quote. Input arrays and proposals remain unchanged.
 */
export function buildClosePairHistory(
  proposal: ClosePairProposal,
  winnerHistory: HistoricalPoint[],
  loserHistory: HistoricalPoint[],
  asOf = proposal.targetAsOf,
  histories: Record<string, HistoricalPoint[]> = {},
): HistoricalPoint[] {
  const legs = getCloseProposalLegs(proposal);
  const historyFor = (leg: ClosePairLeg, index: number) => histories[leg.position.symbol.trim().toUpperCase()]
    ?? (index === 0 ? winnerHistory : index === 1 ? loserHistory : []);
  if (!Number.isFinite(asOf) || !Number.isFinite(proposal.annualGrowthRate) ||
      proposal.annualGrowthRate <= -1 || legs.some(leg =>
    !Number.isFinite(leg.quantity) || leg.quantity <= 0 ||
    !Number.isFinite(leg.costBasisUsd) || leg.costBasisUsd <= 0)) return [];
  if (legs.some((leg) => leg.historicalPositions !== undefined)) {
    // Full source records are authoritative: never fall back to an activation
    // with a missing prior loss when either leg has incomplete source history.
    if (legs.some((leg) => !leg.historicalPositions?.length)) return [];
    const priceMaps = legs.map((leg, index) => pricesByDay(historyFor(leg, index), Number.NEGATIVE_INFINITY, asOf));
    const days = [...new Set(priceMaps.flatMap(prices => [...prices.keys()]))].sort((a, b) => a - b);
    const firstActivityFor = (leg: ClosePairLeg) => Math.min(...leg.historicalPositions!.flatMap((position) => position.lots?.length
      ? position.lots.map((lot) => Date.parse(lot.executedAt)) : [Date.parse(position.entryDate)]));
    const firstPairActivity = Math.min(...legs.map(firstActivityFor));
    const performanceFor = (leg: ClosePairLeg, prices: Map<number, HistoricalPoint>) => {
      const sources = leg.historicalPositions!;
      const firstActivity = firstActivityFor(leg);
      const points = days.flatMap((timestamp) => {
        const cutoff = Math.min(timestamp + DAY_MS - 1, asOf);
        const hasOpenExposure = sources.some((position) => {
          if (!position.lots?.length) return Date.parse(position.entryDate) <= cutoff && position.quantity > 1e-8;
          const eligible = position.lots.filter((lot) => Date.parse(lot.executedAt) <= cutoff);
          return computeOpenLots(eligible).some((lot) => lot.quantity > 1e-8);
        });
        const observation = prices.get(timestamp);
        // A missing price is harmless only when this symbol has no open shares.
        // Zero here is a valuation placeholder, never a market observation.
        if (hasOpenExposure && !observation) return [];
        return [{ timestamp, close: observation?.close ?? 0 }];
      });
      return new Map(buildHoldingPerformanceHistory(sources, points, proposal.annualGrowthRate, asOf).map((point) => [point.timestamp,
        Math.min(point.timestamp + DAY_MS - 1, asOf) < firstActivity
          ? { ...point, actual: 0, target: 0 } : point]));
    };
    const performances = legs.map((leg, index) => performanceFor(leg, priceMaps[index]));
    return days.flatMap((timestamp) => {
      if (Math.min(timestamp + DAY_MS - 1, asOf) < firstPairActivity) return [];
      const values = performances.map(performance => performance.get(timestamp));
      if (values.some(value => !value || value.actual === null || value.target === null)) return [];
      const close = values.reduce((sum, value) => sum + value!.actual! - value!.target!, 0);
      return Number.isFinite(close) ? [{ timestamp, close }] : [];
    });
  }
  const latestBuy = Math.max(...legs.map(latestRemainingBuy));
  if (!Number.isFinite(latestBuy) || latestBuy > asOf) return [];
  const startDay = utcDay(latestBuy);
  const priceMaps = legs.map((leg, index) => pricesByDay(historyFor(leg, index), startDay, asOf));
  const cost = legs.reduce((sum, leg) => sum + leg.costBasisUsd, 0);
  return [...priceMaps[0].keys()].sort((a, b) => a - b).flatMap((timestamp) => {
    const prices = priceMaps.map(prices => prices.get(timestamp));
    if (prices.some(price => !price)) return [];
    const targetAsOf = Math.min(timestamp + DAY_MS - 1, asOf);
    const targetProfit = legs.reduce((sum, leg) => {
      const lots = leg.position.lots?.length ? computeOpenLots(leg.position.lots) : [{ totalCost: leg.costBasisUsd, executedAt: leg.position.entryDate }];
      return sum + lots.reduce((total, lot) => total + lot.totalCost * (Math.pow(1 + proposal.annualGrowthRate,
        Math.max(targetAsOf - Date.parse(lot.executedAt), 0) / (365.25 * DAY_MS)) - 1), 0);
    }, 0);
    const close = legs.reduce((sum, leg, index) => sum + leg.quantity * prices[index]!.close, 0) - cost - targetProfit;
    return Number.isFinite(close) ? [{ timestamp, close }] : [];
  });
}
