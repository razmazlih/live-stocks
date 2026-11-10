import { computeOpenLots } from '@/lib/positions';
import type { Position, PositionMetrics } from '@/types';

export interface ClosePairLeg {
  position: Position;
  quantity: number;
  currentPrice: number;
  costBasisUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
  targetProfitUsd: number;
  surplusUsd: number;
}

export interface ClosePairProposal {
  winner: ClosePairLeg;
  loser: ClosePairLeg;
  profitUsd: number;
  lossUsd: number;
  netProfitUsd: number;
  proceedsUsd: number;
  targetProfitUsd: number;
  surplusUsd: number;
  annualGrowthRate: number;
  targetAsOf: number;
  coveredShortfallUsd: number;
  excessProfitUsd: number;
}

const YEAR_MS = 365.25 * 86_400_000;

/** Compound the current remaining FIFO costs, including allocated buy fees. */
export function calculateClosePairLegTargetProfitUsd(
  leg: Pick<ClosePairLeg, 'position' | 'costBasisUsd'>,
  annualGrowthRate: number,
  asOf: number,
): number {
  if (!Number.isFinite(annualGrowthRate) || annualGrowthRate <= -1 || !Number.isFinite(asOf)) return Number.NaN;
  const lots = leg.position.lots?.length ? computeOpenLots(leg.position.lots) : [{
    totalCost: leg.costBasisUsd, executedAt: leg.position.entryDate,
  }];
  if (!lots.length) return Number.NaN;
  return lots.reduce((sum, lot) => {
    const timestamp = Date.parse(lot.executedAt);
    if (!Number.isFinite(timestamp) || !Number.isFinite(lot.totalCost) || lot.totalCost <= 0) return Number.NaN;
    const years = Math.max((asOf - timestamp) / YEAR_MS, 0);
    return sum + lot.totalCost * (Math.pow(1 + annualGrowthRate, years) - 1);
  }, 0);
}

function fullCloseLeg(metric: PositionMetrics, asOf: number, annualGrowthRate: number): ClosePairLeg | undefined {
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
  const targetProfitUsd = calculateClosePairLegTargetProfitUsd({ position, costBasisUsd }, annualGrowthRate, asOf);
  const surplusUsd = pnlUsd - targetProfitUsd;
  if (!Number.isFinite(quantity) || quantity <= 1e-8 ||
      !Number.isFinite(costBasisUsd) || costBasisUsd <= 0 ||
      !Number.isFinite(proceedsUsd) || !Number.isFinite(pnlUsd) ||
      !Number.isFinite(targetProfitUsd) || !Number.isFinite(surplusUsd)) return;
  return { position, quantity, currentPrice, costBasisUsd, proceedsUsd, pnlUsd, targetProfitUsd, surplusUsd };
}

/**
 * Non-overlapping full-close pairs, before tax and unknown future sale fees.
 * FIFO costs include only the buy fees allocated to the shares still open.
 * Pair one holding above its personal annual target with one below target.
 * Require positive actual profit and positive combined target surplus.
 * Greedily prefer target shortfall covered, then combined target surplus.
 * Each normalized ticker appears at most once, including across accounts.
 */
export function buildClosePairProposals(
  metrics: PositionMetrics[],
  limit = 3,
  asOf = Date.now(),
  annualGrowthRate = 0.05,
): ClosePairProposal[] {
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(asOf) ||
      !Number.isFinite(annualGrowthRate) || annualGrowthRate <= -1) return [];
  const legs = metrics.map((metric) => fullCloseLeg(metric, asOf, annualGrowthRate))
    .filter((leg): leg is ClosePairLeg => Boolean(leg));
  const winners = legs.filter((leg) => leg.surplusUsd > 0);
  const losers = legs.filter((leg) => leg.surplusUsd < 0);
  const proposals: ClosePairProposal[] = [];
  for (const winner of winners) {
    for (const loser of losers) {
      if (winner.position.location !== loser.position.location ||
          winner.position.symbol.trim().toUpperCase() === loser.position.symbol.trim().toUpperCase()) continue;
      const netProfitUsd = winner.pnlUsd + loser.pnlUsd;
      const targetProfitUsd = winner.targetProfitUsd + loser.targetProfitUsd;
      const surplusUsd = netProfitUsd - targetProfitUsd;
      if (!Number.isFinite(targetProfitUsd) || !Number.isFinite(surplusUsd) ||
          netProfitUsd < 0.01 - 1e-9 || surplusUsd < 0.01 - 1e-9) continue;
      proposals.push({
        winner, loser, profitUsd: winner.pnlUsd, lossUsd: Math.max(0, -loser.pnlUsd),
        netProfitUsd, proceedsUsd: winner.proceedsUsd + loser.proceedsUsd,
        targetProfitUsd, surplusUsd, annualGrowthRate, targetAsOf: asOf,
        coveredShortfallUsd: -loser.surplusUsd, excessProfitUsd: winner.surplusUsd,
      });
    }
  }
  const symbolKey = (leg: ClosePairLeg) => leg.position.symbol.trim().toUpperCase();
  const ranked = proposals.sort((a, b) => b.coveredShortfallUsd - a.coveredShortfallUsd || b.surplusUsd - a.surplusUsd ||
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
