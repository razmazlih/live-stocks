import { computeOpenLots } from '@/lib/positions';
import type { Position, PositionMetrics } from '@/types';

export interface ClosePairLeg {
  position: Position;
  quantity: number;
  currentPrice: number;
  costBasisUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
}

export interface ClosePairProposal {
  winner: ClosePairLeg;
  loser: ClosePairLeg;
  profitUsd: number;
  lossUsd: number;
  netProfitUsd: number;
  proceedsUsd: number;
}

function fullCloseLeg(metric: PositionMetrics, asOf: number): ClosePairLeg | undefined {
  const { position, currentPrice } = metric;
  if (!position.symbol.trim() || position.isHistoricalActivation ||
      !Number.isFinite(currentPrice) || currentPrice <= 0 ||
      (position.location !== 'bank_one' && position.location !== 'bank_two')) return;

  let quantity = position.quantity;
  let costBasisUsd = quantity * position.entryPrice;
  if (position.lots?.length) {
    const ordered = [...position.lots].sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt));
    let available = 0;
    for (const lot of ordered) {
      const timestamp = Date.parse(lot.executedAt);
      const commission = lot.hasCommission ? lot.commissionAmount : 0;
      if (!Number.isFinite(timestamp) || timestamp > asOf ||
          !Number.isFinite(lot.quantity) || lot.quantity <= 0 ||
          !Number.isFinite(lot.price) || lot.price <= 0 ||
          !Number.isFinite(commission) || commission < 0) return;
      if (lot.type === 'BUY') available += lot.quantity;
      else if (lot.type === 'SELL' && lot.quantity <= available + 1e-8) available -= lot.quantity;
      else return;
    }
    const open = computeOpenLots(ordered);
    quantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
    costBasisUsd = open.reduce((sum, lot) => sum + lot.totalCost, 0);
  } else if (!Number.isFinite(position.entryPrice) || position.entryPrice <= 0 ||
             !Number.isFinite(Date.parse(position.entryDate)) || Date.parse(position.entryDate) > asOf) return;

  const proceedsUsd = quantity * currentPrice;
  const pnlUsd = proceedsUsd - costBasisUsd;
  if (!Number.isFinite(quantity) || quantity <= 1e-8 ||
      !Number.isFinite(costBasisUsd) || costBasisUsd <= 0 ||
      !Number.isFinite(proceedsUsd) || !Number.isFinite(pnlUsd)) return;
  return { position, quantity, currentPrice, costBasisUsd, proceedsUsd, pnlUsd };
}

/**
 * Independent full-close alternatives, before tax and unknown future sale fees.
 * FIFO costs include only the buy fees allocated to the shares still open.
 * Prefer the largest loss covered, then the greatest remaining profit. An
 * alternative may reuse a position; these are not a simultaneous trading plan.
 */
export function buildClosePairProposals(
  metrics: PositionMetrics[],
  limit = 3,
  asOf = Date.now(),
): ClosePairProposal[] {
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(asOf)) return [];
  const legs = metrics.map((metric) => fullCloseLeg(metric, asOf))
    .filter((leg): leg is ClosePairLeg => Boolean(leg));
  const winners = legs.filter((leg) => leg.pnlUsd > 0);
  const losers = legs.filter((leg) => leg.pnlUsd < 0);
  const proposals: ClosePairProposal[] = [];
  for (const winner of winners) {
    for (const loser of losers) {
      if (winner.position.location !== loser.position.location ||
          winner.position.symbol.trim().toUpperCase() === loser.position.symbol.trim().toUpperCase()) continue;
      const netProfitUsd = winner.pnlUsd + loser.pnlUsd;
      if (netProfitUsd < 0.01 - 1e-9) continue;
      proposals.push({
        winner, loser, profitUsd: winner.pnlUsd, lossUsd: -loser.pnlUsd,
        netProfitUsd, proceedsUsd: winner.proceedsUsd + loser.proceedsUsd,
      });
    }
  }
  return proposals.sort((a, b) => b.lossUsd - a.lossUsd || b.netProfitUsd - a.netProfitUsd ||
    a.winner.position.symbol.localeCompare(b.winner.position.symbol) ||
    a.loser.position.symbol.localeCompare(b.loser.position.symbol)).slice(0, Math.floor(limit));
}
