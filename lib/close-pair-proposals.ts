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
 * Non-overlapping full-close pairs, before tax and unknown future sale fees.
 * FIFO costs include only the buy fees allocated to the shares still open.
 * Greedily prefer the largest loss covered, then the greatest remaining profit.
 * Each normalized ticker appears at most once, including across accounts.
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
  const symbolKey = (leg: ClosePairLeg) => leg.position.symbol.trim().toUpperCase();
  const ranked = proposals.sort((a, b) => b.lossUsd - a.lossUsd || b.netProfitUsd - a.netProfitUsd ||
    symbolKey(a.winner).localeCompare(symbolKey(b.winner)) ||
    symbolKey(a.loser).localeCompare(symbolKey(b.loser)) ||
    a.winner.position.location.localeCompare(b.winner.position.location) ||
    (a.winner.position.id ?? '').localeCompare(b.winner.position.id ?? '') ||
    (a.loser.position.id ?? '').localeCompare(b.loser.position.id ?? ''));
  const usedSymbols = new Set<string>();
  const selected: ClosePairProposal[] = [];
  for (const proposal of ranked) {
    const winnerSymbol = symbolKey(proposal.winner);
    const loserSymbol = symbolKey(proposal.loser);
    if (usedSymbols.has(winnerSymbol) || usedSymbols.has(loserSymbol)) continue;
    selected.push(proposal);
    usedSymbols.add(winnerSymbol);
    usedSymbols.add(loserSymbol);
    if (selected.length >= Math.floor(limit)) break;
  }
  return selected;
}
