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
    realizedPnlUsd, unrealizedPnlUsd, pnlUsd, targetProfitUsd, surplusUsd };
}

function legsFromSources(metrics: PositionMetrics[], positions: Position[], asOf: number, annualGrowthRate: number) {
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
 * Non-overlapping full-close pairs, before tax and unknown future sale fees.
 * Actual P/L and targets include all recorded sold shares and every closed cycle.
 * Current proceeds include only shares being sold now, never historical proceeds.
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
  originalPositions?: Position[],
): ClosePairProposal[] {
  if (!Number.isFinite(limit) || limit < 1 || !Number.isFinite(asOf) ||
      !Number.isFinite(annualGrowthRate) || annualGrowthRate <= -1) return [];
  const legs = originalPositions !== undefined
    ? legsFromSources(metrics, originalPositions, asOf, annualGrowthRate)
    : metrics.flatMap((metric) => {
      if (metric.position.isHistoricalActivation) return [];
      const leg = fullCloseLeg([metric.position], metric.currentPrice, asOf, annualGrowthRate);
      return leg ? [leg] : [];
    });
  const winners = legs.filter((leg) => leg.surplusUsd > 0);
  const losers = legs.filter((leg) => leg.surplusUsd < 0);
  const proposals: ClosePairProposal[] = [];
  for (const winner of winners) {
    for (const loser of losers) {
      if ((originalPositions === undefined && winner.position.location !== loser.position.location) ||
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
