import { computeOpenLots, computeRealizedSales } from '@/lib/positions';
import type { Position, PositionLocation, PositionMetrics } from '@/types';

export interface ClosePairLeg {
  position: Position;
  /** Original, complete per-account records. Never match FIFO across accounts. */
  historicalPositions?: Position[];
  locations?: PositionLocation[];
  realizedPnlUsd?: number;
  unrealizedPnlUsd?: number;
  quantity: number;
  currentPrice: number;
  costBasisUsd: number;
  proceedsUsd: number;
  pnlUsd: number;
  targetProfitUsd: number;
  surplusUsd: number;
  weightedHoldingDays?: number;
  lossPercent?: number;
}

export interface ClosePairPolicy {
  minHoldingDays: number;
  minLossPercent: number;
  minLossUsd: number;
  severeLossPercent: number;
  maxLosers: number;
  maxCandidateLosers: number;
}

export const DEFAULT_CLOSE_PAIR_POLICY: Readonly<ClosePairPolicy> = Object.freeze({
  minHoldingDays: 30, minLossPercent: 5, minLossUsd: 50,
  severeLossPercent: 15, maxLosers: 3, maxCandidateLosers: 24,
});

export interface ClosePairProposal {
  winner: ClosePairLeg;
  loser: ClosePairLeg;
  /** All loss-making holdings; loser remains the first for legacy consumers. */
  losers?: ClosePairLeg[];
  policy?: ClosePairPolicy;
  searchTruncated?: boolean;
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

export function getCloseProposalLegs(proposal: ClosePairProposal): ClosePairLeg[] {
  return [proposal.winner, ...(proposal.losers ?? [proposal.loser])];
}

export function isEligibleCloseProposalLoser(leg: ClosePairLeg, policy: ClosePairPolicy): boolean {
  return leg.pnlUsd < 0 && (leg.unrealizedPnlUsd ?? 0) < 0 && leg.surplusUsd < 0 &&
    -(leg.unrealizedPnlUsd ?? 0) + 1e-9 >= policy.minLossUsd &&
    (leg.lossPercent ?? 0) + 1e-9 >= policy.minLossPercent &&
    ((leg.weightedHoldingDays ?? 0) + 1e-9 >= policy.minHoldingDays || (leg.lossPercent ?? 0) + 1e-9 >= policy.severeLossPercent);
}

const YEAR_MS = 365.25 * 86_400_000;

/** Full personal target: sold shares stop accruing at sale; open shares accrue to asOf. */
export function calculateClosePairLegTargetProfitUsd(
  leg: Pick<ClosePairLeg, 'position' | 'costBasisUsd' | 'historicalPositions'>,
  annualGrowthRate: number,
  asOf: number,
): number {
  if (!Number.isFinite(annualGrowthRate) || annualGrowthRate <= -1 || !Number.isFinite(asOf)) return Number.NaN;
  const positions = leg.historicalPositions ?? [leg.position];
  return positions.reduce((total, position) => {
    const lots = position.lots?.length ? computeOpenLots(position.lots) : [{
      totalCost: position.entryPrice * position.quantity, executedAt: position.entryDate,
    }];
    const openTarget = lots.reduce((sum, lot) => {
      const timestamp = Date.parse(lot.executedAt);
      if (!Number.isFinite(timestamp) || !Number.isFinite(lot.totalCost) || lot.totalCost < 0) return Number.NaN;
      const years = Math.max((asOf - timestamp) / YEAR_MS, 0);
      return sum + lot.totalCost * (Math.pow(1 + annualGrowthRate, years) - 1);
    }, 0);
    const soldTarget = computeRealizedSales(position).reduce((sum, sale) => {
      const soldAt = Date.parse(sale.sellDate);
      const targets = sale.matchedLots ?? [{ buyTimestamp: soldAt - sale.holdingPeriodDays * 86_400_000, costBasisUsd: sale.costBasisUsd }];
      return sum + targets.reduce((target, matched) => target + matched.costBasisUsd
        * (Math.pow(1 + annualGrowthRate, Math.max((soldAt - matched.buyTimestamp) / YEAR_MS, 0)) - 1), 0);
    }, 0);
    return total + openTarget + soldTarget;
  }, 0);
}

/** Validate each original account independently before any aggregation. */
function normalizeSource(position: Position, asOf: number): Position | undefined {
  if (!position.symbol.trim() || (position.location !== 'bank_one' && position.location !== 'bank_two')) return;
  if (!position.lots?.length) {
    if (!Number.isFinite(position.quantity) || position.quantity <= 0 ||
        !Number.isFinite(position.entryPrice) || position.entryPrice <= 0 ||
        !Number.isFinite(Date.parse(position.entryDate)) || Date.parse(position.entryDate) > asOf) return;
    return { ...position, lots: [{ type: 'BUY', quantity: position.quantity, price: position.entryPrice,
      executedAt: position.entryDate, hasCommission: false, commissionAmount: 0 }] };
  }
  const ordered = [...position.lots].sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt));
  let available = 0;
  for (const lot of ordered) {
    const timestamp = Date.parse(lot.executedAt);
    const commission = lot.hasCommission ? lot.commissionAmount : 0;
    if (!Number.isFinite(timestamp) || timestamp > asOf || !Number.isFinite(lot.quantity) || lot.quantity <= 0 ||
        !Number.isFinite(lot.price) || lot.price <= 0 || !Number.isFinite(commission) || commission < 0) return;
    if (lot.type === 'BUY') available += lot.quantity;
    else if (lot.type === 'SELL' && lot.quantity <= available + 1e-8) available -= lot.quantity;
    else return;
  }
  return { ...position, lots: ordered };
}

function fullCloseLeg(sources: Position[], currentPrice: number, asOf: number, annualGrowthRate: number): ClosePairLeg | undefined {
  if (!sources.length || !Number.isFinite(currentPrice) || currentPrice <= 0) return;
  const normalized = sources.map((position) => normalizeSource(position, asOf));
  if (normalized.some((position) => !position)) return;
  const historicalPositions = normalized as Position[];
  const holdings = historicalPositions.map((position) => ({ position, lots: computeOpenLots(position.lots ?? []) }));
  const open = holdings.flatMap((holding) => holding.lots);
  const quantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const costBasisUsd = open.reduce((sum, lot) => sum + lot.totalCost, 0);
  const proceedsUsd = quantity * currentPrice;
  const realizedPnlUsd = historicalPositions.flatMap(computeRealizedSales).reduce((sum, sale) => sum + sale.profitUsd, 0);
  const unrealizedPnlUsd = proceedsUsd - costBasisUsd;
  const weightedHoldingDays = costBasisUsd > 0 ? open.reduce((sum, lot) =>
    sum + lot.totalCost * Math.max(0, asOf - Date.parse(lot.executedAt)) / 86_400_000, 0) / costBasisUsd : 0;
  const lossPercent = Math.max(0, -unrealizedPnlUsd / costBasisUsd * 100);
  const pnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const representative = holdings.find((holding) => holding.lots.length)?.position ?? historicalPositions[0];
  const position = historicalPositions.length === 1 ? representative : {
    ...representative, id: undefined, symbol: representative.symbol.trim().toUpperCase(), lots: undefined,
    quantity, entryPrice: costBasisUsd / quantity,
    entryDate: open.reduce((earliest, lot) => Date.parse(lot.executedAt) < Date.parse(earliest) ? lot.executedAt : earliest, open[0]?.executedAt ?? representative.entryDate),
  };
  const targetProfitUsd = calculateClosePairLegTargetProfitUsd({ position, costBasisUsd, historicalPositions }, annualGrowthRate, asOf);
  const surplusUsd = pnlUsd - targetProfitUsd;
  if (!Number.isFinite(quantity) || quantity <= 1e-8 || !Number.isFinite(costBasisUsd) || costBasisUsd <= 0 ||
      !Number.isFinite(proceedsUsd) || !Number.isFinite(pnlUsd) || !Number.isFinite(targetProfitUsd) || !Number.isFinite(surplusUsd)) return;
  const locations = [...new Set(holdings.filter((holding) => holding.lots.length).map((holding) => holding.position.location))].sort();
  return { position, historicalPositions, locations, quantity, currentPrice, costBasisUsd, proceedsUsd,
    realizedPnlUsd, unrealizedPnlUsd, pnlUsd, targetProfitUsd, surplusUsd, weightedHoldingDays, lossPercent };
}

export function buildCloseProposalLegs(metrics: PositionMetrics[], positions: Position[], asOf: number, annualGrowthRate: number) {
  const groups = new Map<string, Position[]>();
  for (const position of positions) {
    const symbol = position.symbol.trim().toUpperCase();
    groups.set(symbol, [...(groups.get(symbol) ?? []), position]);
  }
  return [...groups.entries()].flatMap(([symbol, sources]) => {
    // Original records are authoritative. Activation slices or duplicate source
    // IDs would count some money twice, so never substitute or merge them.
    const ids = sources.flatMap((source) => source.id ? [source.id] : []);
    if (ids.length !== new Set(ids).size || sources.some((source) => source.activationId || source.isHistoricalActivation)) return [];
    const quotes = metrics.filter((metric) => metric.position.symbol.trim().toUpperCase() === symbol && !metric.position.isHistoricalActivation)
      .map((metric) => metric.currentPrice);
    if (!quotes.length || quotes.some((price) => !Number.isFinite(price) || price <= 0 || Math.abs(price - quotes[0]) > 1e-8)) return [];
    const leg = fullCloseLeg(sources, quotes[0], asOf, annualGrowthRate);
    return leg ? [leg] : [];
  });
}

/**
 * One genuinely profitable holding closes with one to three genuinely losing
 * holdings. All cumulative history and per-account FIFO remain authoritative.
 * The policy filters losses using OPEN loss percent/USD and remaining cost-
 * weighted holding age; a severe loss can bypass age, never loss materiality.
 * Rank largest single cumulative loss, total cumulative losses, then surplus.
 * Search is exact within the disclosed, deterministically capped loser pool;
 * selection between groups is greedy and never reuses a ticker.
 */
export function buildClosePairProposals(
  metrics: PositionMetrics[],
  limit = 3,
  asOf = Date.now(),
  annualGrowthRate = 0.05,
  originalPositions?: Position[],
  policyOverrides?: Partial<ClosePairPolicy>,
): ClosePairProposal[] {
  const policy = { ...DEFAULT_CLOSE_PAIR_POLICY, ...policyOverrides };
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(asOf) ||
      !Number.isFinite(annualGrowthRate) || annualGrowthRate <= -1 ||
      Object.values(policy).some(value => !Number.isFinite(value) || value < 0) ||
      !Number.isInteger(policy.maxLosers) || policy.maxLosers < 1 || policy.maxLosers > 3 ||
      !Number.isInteger(policy.maxCandidateLosers) || policy.maxCandidateLosers < 1 || policy.maxCandidateLosers > 50 ||
      policy.severeLossPercent < policy.minLossPercent) return [];
  const legs = originalPositions !== undefined
    ? buildCloseProposalLegs(metrics, originalPositions, asOf, annualGrowthRate)
    : metrics.flatMap((metric) => {
      if (metric.position.isHistoricalActivation) return [];
      const leg = fullCloseLeg([metric.position], metric.currentPrice, asOf, annualGrowthRate);
      return leg ? [leg] : [];
    });
  const symbolKey = (leg: ClosePairLeg) => leg.position.symbol.trim().toUpperCase();
  const stableKey = (leg: ClosePairLeg) => JSON.stringify([symbolKey(leg), leg.position.location, leg.position.id ?? '']);
  const winners = legs.filter(leg => leg.pnlUsd > 0 && (leg.unrealizedPnlUsd ?? 0) > 0 && leg.surplusUsd > 0);
  const eligibleLosers = legs.filter(leg => isEligibleCloseProposalLoser(leg, policy))
    .sort((a, b) => a.pnlUsd - b.pnlUsd || stableKey(a).localeCompare(stableKey(b)));
  const searchTruncated = eligibleLosers.length > policy.maxCandidateLosers;
  const losers = eligibleLosers.slice(0, policy.maxCandidateLosers);
  const proposals: ClosePairProposal[] = [];
  for (const winner of winners) {
    const candidates = losers.filter(loser => symbolKey(winner) !== symbolKey(loser) &&
      (originalPositions !== undefined || winner.position.location === loser.position.location));
    const enumerate = (selected: ClosePairLeg[], next: number) => {
      if (selected.length) {
        const group = [winner, ...selected];
        const netProfitUsd = group.reduce((sum, leg) => sum + leg.pnlUsd, 0);
        const targetProfitUsd = group.reduce((sum, leg) => sum + leg.targetProfitUsd, 0);
        const surplusUsd = netProfitUsd - targetProfitUsd;
        if (Number.isFinite(targetProfitUsd) && Number.isFinite(surplusUsd) &&
            netProfitUsd >= 0.01 - 1e-9 && surplusUsd >= 0.01 - 1e-9) {
          proposals.push({ winner, loser: selected[0], losers: [...selected], policy: { ...policy }, searchTruncated,
            profitUsd: winner.pnlUsd, lossUsd: -selected.reduce((sum, leg) => sum + leg.pnlUsd, 0),
            netProfitUsd, proceedsUsd: group.reduce((sum, leg) => sum + leg.proceedsUsd, 0),
            targetProfitUsd, surplusUsd, annualGrowthRate, targetAsOf: asOf,
            coveredShortfallUsd: -selected.reduce((sum, leg) => sum + leg.surplusUsd, 0),
            excessProfitUsd: winner.surplusUsd });
        }
      }
      if (selected.length >= policy.maxLosers) return;
      for (let index = next; index < candidates.length; index++) {
        if (selected.some(leg => symbolKey(leg) === symbolKey(candidates[index]))) continue;
        enumerate([...selected, candidates[index]], index + 1);
      }
    };
    enumerate([], 0);
  }
  const largestLoss = (proposal: ClosePairProposal) => Math.max(...(proposal.losers ?? [proposal.loser]).map(leg => -leg.pnlUsd));
  const proposalKey = (proposal: ClosePairProposal) => JSON.stringify(getCloseProposalLegs(proposal).map(stableKey));
  proposals.sort((a, b) => largestLoss(b) - largestLoss(a) || b.lossUsd - a.lossUsd ||
    b.surplusUsd - a.surplusUsd || proposalKey(a).localeCompare(proposalKey(b)));
  const usedSymbols = new Set<string>();
  const selected: ClosePairProposal[] = [];
  for (const proposal of proposals) {
    const symbols = getCloseProposalLegs(proposal).map(symbolKey);
    if (symbols.some(symbol => usedSymbols.has(symbol))) continue;
    selected.push(proposal);
    symbols.forEach(symbol => usedSymbols.add(symbol));
    if (selected.length >= Math.floor(limit)) break;
  }
  return selected;
}
