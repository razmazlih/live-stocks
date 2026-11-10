import { computeOpenLots } from '@/lib/positions';
import type { ClosePairLeg, ClosePairProposal } from '@/lib/close-pair-proposals';
import { calculateClosePairLegTargetProfitUsd } from '@/lib/close-pair-proposals';
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
 * Retrospective USD simulation of today's remaining shares and FIFO cost basis:
 * qWinner * historicalPriceWinner + qLoser * historicalPriceLoser - currentCost
 * minus the personal annual target accrued from each remaining buy through that
 * UTC day's end (capped at asOf). Zero represents meeting the target, not merely
 * breaking even. The same 365.25-day compound model is used for current ideas.
 * This is not actual historical portfolio P/L: quantities/costs stay fixed and
 * realized sales, taxes and future exit fees are excluded. Begin on the UTC day
 * of the latest buy still represented in either remaining holding. Only days
 * observed in both input series are returned, at UTC midnight, using each day's
 * latest valid positive price no later than asOf. Never fill missing days or
 * append a synthetic current quote. Input arrays and proposals remain unchanged.
 */
export function buildClosePairHistory(
  proposal: ClosePairProposal,
  winnerHistory: HistoricalPoint[],
  loserHistory: HistoricalPoint[],
  asOf = proposal.targetAsOf,
): HistoricalPoint[] {
  const legs = [proposal.winner, proposal.loser];
  if (!Number.isFinite(asOf) || !Number.isFinite(proposal.annualGrowthRate) ||
      proposal.annualGrowthRate <= -1 || legs.some(leg =>
    !Number.isFinite(leg.quantity) || leg.quantity <= 0 ||
    !Number.isFinite(leg.costBasisUsd) || leg.costBasisUsd <= 0)) return [];
  const latestBuy = Math.max(...legs.map(latestRemainingBuy));
  if (!Number.isFinite(latestBuy) || latestBuy > asOf) return [];
  const startDay = utcDay(latestBuy);
  const winnerPrices = pricesByDay(winnerHistory, startDay, asOf);
  const loserPrices = pricesByDay(loserHistory, startDay, asOf);
  const cost = proposal.winner.costBasisUsd + proposal.loser.costBasisUsd;
  return [...winnerPrices.entries()].sort(([a], [b]) => a - b).flatMap(([timestamp, winner]) => {
    const loser = loserPrices.get(timestamp);
    if (!loser) return [];
    const targetAsOf = Math.min(timestamp + DAY_MS - 1, asOf);
    const targetProfit = legs.reduce((sum, leg) =>
      sum + calculateClosePairLegTargetProfitUsd(leg, proposal.annualGrowthRate, targetAsOf), 0);
    const close = proposal.winner.quantity * winner.close + proposal.loser.quantity * loser.close - cost - targetProfit;
    return Number.isFinite(close) ? [{ timestamp, close }] : [];
  });
}
