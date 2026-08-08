import { CandleData, HistoricalPoint, PortfolioAllocationDatum, PortfolioPnLDatum, Position, PositionLot, PositionMetrics, PortfolioSummary, PortfolioTimelinePoint, RealizedSale } from '@/types';
import { computeOpenLots, computeRealizedSales, summarizeLots } from '@/lib/positions';

export { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/display/formatting';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
export const EXIT_PRICE_GAP_THRESHOLD_USD = 0.01;

type FxRateResolver = (timestamp: number) => number;

export function hasMaterialExitPriceGap(
  projectedPrice: number,
  requiredExitPrice: number | undefined,
): requiredExitPrice is number {
  return (
    typeof requiredExitPrice === 'number' &&
    Number.isFinite(requiredExitPrice) &&
    Number.isFinite(projectedPrice) &&
    Math.abs(requiredExitPrice - projectedPrice) >= EXIT_PRICE_GAP_THRESHOLD_USD
  );
}

export interface RealizedPortfolioTotals {
  proceedsUsd: number;
  costUsd: number;
  profitUsd: number;
  expectedProfitUsd: number;
  proceedsIls: number;
  costIls: number;
  profitIls: number;
  expectedProfitIls: number;
}

export interface PortfolioTaxTotals {
  taxUsd: number;
  taxIls: number;
}

export const EMPTY_REALIZED_PORTFOLIO_TOTALS: RealizedPortfolioTotals = {
  proceedsUsd: 0,
  costUsd: 0,
  profitUsd: 0,
  expectedProfitUsd: 0,
  proceedsIls: 0,
  costIls: 0,
  profitIls: 0,
  expectedProfitIls: 0,
};

function isSameDay(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function calculatePositionMetrics(
  position: Position,
  currentPrice: number,
  usdToIlsRate: number,
  annualGrowthRate: number = 0.05,
  dailyChange?: number
): PositionMetrics {
  const lots = position.lots ?? [];
  const now = new Date();
  const hasLots = lots.length > 0;
  const summary = hasLots ? summarizeLots(lots, now) : undefined;

  const normalizedQuantity = summary && summary.totalQuantity > 0 ? summary.totalQuantity : position.quantity;
  const normalizedEntryPrice = summary && summary.totalQuantity > 0 ? summary.averageEntryPrice : position.entryPrice;
  const normalizedEntryDate = summary?.earliestEntryDate ?? position.entryDate;
  const normalizedPosition: Position = {
    ...position,
    entryPrice: normalizedEntryPrice,
    quantity: normalizedQuantity,
    entryDate: normalizedEntryDate,
  };

  const entryDate = new Date(normalizedEntryDate);
  const fallbackYearsHeld = Number.isNaN(entryDate.getTime())
    ? 0
    : Math.max((now.getTime() - entryDate.getTime()) / MS_PER_YEAR, 0);

  const yearsHeld = summary ? summary.weightedHoldingYears || fallbackYearsHeld : fallbackYearsHeld;

  const positionPnLUsd = (currentPrice - normalizedEntryPrice) * normalizedQuantity;
  const positionPnLIls = positionPnLUsd * usdToIlsRate;

  const projectedPrice = normalizedQuantity > 0
    ? calculateWeightedProjectedPrice(lots, annualGrowthRate, now)
    : normalizedEntryPrice * Math.pow(1 + annualGrowthRate, yearsHeld);

  const projectedPnLUsd = (projectedPrice - normalizedEntryPrice) * normalizedQuantity;
  const projectedPnLIls = projectedPnLUsd * usdToIlsRate;

  const combined = positionPnLUsd - projectedPnLUsd;
  const combinedIls = combined * usdToIlsRate;

  const currentValue = currentPrice * normalizedQuantity;
  const currentValueIls = currentValue * usdToIlsRate;
  const costBasis = normalizedEntryPrice * normalizedQuantity;
  const roiPercent = costBasis !== 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0;

  const positionEntryDate = new Date(normalizedEntryDate);
  const isOpenedToday = !Number.isNaN(positionEntryDate.getTime()) && isSameDay(positionEntryDate, now);

  let dailyChangeValue = dailyChange;
  let dailyChangePercent: number | undefined;

  if (isOpenedToday) {
    dailyChangeValue = currentPrice - normalizedEntryPrice;
    dailyChangePercent = normalizedEntryPrice !== 0
      ? ((currentPrice - normalizedEntryPrice) / normalizedEntryPrice) * 100
      : undefined;
  } else if (dailyChange !== undefined && currentPrice - dailyChange !== 0) {
    dailyChangePercent = (dailyChange / (currentPrice - dailyChange)) * 100;
  }

  return {
    position: normalizedPosition,
    currentPrice,
    positionPnLUsd,
    positionPnLIls,
    projectedPrice,
    projectedPnLUsd,
    projectedPnLIls,
    combined,
    combinedIls,
    yearsHeld,
    currentValue,
    currentValueIls,
    roiPercent,
    dailyChange: dailyChangeValue,
    dailyChangePercent,
  };
}

export function calculateWeightedProjectedPrice(
  lots: PositionLot[],
  annualGrowthRate: number,
  asOf: Date = new Date()
): number {
  if (!Array.isArray(lots) || lots.length === 0) {
    return 0;
  }

  const openLots = computeOpenLots(lots);
  if (!openLots.length) {
    return 0;
  }

  const totalQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (totalQuantity <= 0) {
    return 0;
  }

  const weightedSum = openLots.reduce((sum, lot) => {
    const executedAt = new Date(lot.executedAt);
    if (Number.isNaN(executedAt.getTime())) {
      return sum;
    }

    const yearsHeld = Math.max((asOf.getTime() - executedAt.getTime()) / MS_PER_YEAR, 0);
    const baseCostPerUnit = lot.quantity > 0 ? lot.totalCost / lot.quantity : lot.price;
    const projectedPrice = baseCostPerUnit * Math.pow(1 + annualGrowthRate, yearsHeld);
    return sum + projectedPrice * lot.quantity;
  }, 0);

  return weightedSum / totalQuantity;
}

/**
 * Returns the per-share exit price required today for all open shares of one symbol.
 * Realized sales keep their actual holding period; open lots are projected through `asOf`.
 */
export function calculateRequiredExitPrice(
  positions: Position[],
  annualGrowthRate: number,
  asOf: Date = new Date(),
): number | undefined {
  if (!Array.isArray(positions) || positions.length === 0 || !Number.isFinite(annualGrowthRate)) {
    return undefined;
  }

  const lotsByPosition = positions.map((position) => position.lots ?? []);
  if (lotsByPosition.some((lots) => !hasValidAndMatchedLots(lots))) {
    return undefined;
  }

  const openLots = lotsByPosition.flatMap((lots) => computeOpenLots(lots));
  const openQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (openQuantity <= 0) {
    return undefined;
  }

  let openCostBasis = 0;
  let expectedOpenProfit = 0;
  for (const lot of openLots) {
    const executedAt = new Date(lot.executedAt);
    if (Number.isNaN(executedAt.getTime()) || !Number.isFinite(lot.totalCost)) {
      return undefined;
    }

    const yearsHeld = Math.max((asOf.getTime() - executedAt.getTime()) / MS_PER_YEAR, 0);
    const expectedFactor = Math.pow(1 + annualGrowthRate, yearsHeld);
    if (!Number.isFinite(expectedFactor)) {
      return undefined;
    }

    openCostBasis += lot.totalCost;
    expectedOpenProfit += lot.totalCost * (expectedFactor - 1);
  }

  const realizedSales = positions.flatMap((position) => computeRealizedSales(position));
  const realized = realizedSales.reduce(
    (acc, sale) => {
      const yearsHeld = Math.max((sale.holdingPeriodDays ?? 0) / 365.25, 0);
      const expectedFactor = Math.pow(1 + annualGrowthRate, yearsHeld);
      return {
        actualProfit: acc.actualProfit + sale.profitUsd,
        expectedProfit: acc.expectedProfit + sale.costBasisUsd * (expectedFactor - 1),
      };
    },
    { actualProfit: 0, expectedProfit: 0 },
  );

  const requiredProceeds = openCostBasis + expectedOpenProfit + realized.expectedProfit - realized.actualProfit;
  const requiredExitPrice = requiredProceeds / openQuantity;
  return Number.isFinite(requiredExitPrice) && requiredExitPrice >= 0 ? requiredExitPrice : undefined;
}

function hasValidAndMatchedLots(lots: PositionLot[]): boolean {
  if (!lots.length) {
    return false;
  }

  const orderedLots = [...lots].sort(
    (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime(),
  );
  let availableQuantity = 0;

  for (const lot of orderedLots) {
    const timestamp = new Date(lot.executedAt).getTime();
    const commission = lot.hasCommission ? lot.commissionAmount : 0;
    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(lot.price) || lot.price <= 0 ||
      !Number.isFinite(lot.quantity) || lot.quantity <= 0 ||
      !Number.isFinite(commission) || commission < 0
    ) {
      return false;
    }

    if (lot.type === 'BUY') {
      availableQuantity += lot.quantity;
    } else if (lot.type === 'SELL') {
      if (lot.quantity > availableQuantity + 1e-8) {
        return false;
      }
      availableQuantity -= lot.quantity;
    } else {
      return false;
    }
  }

  return true;
}

export function calculateRealizedTaxLiability(
  sales: Array<{ profitUsd: number; profitIls: number; timestamp?: number }>,
  taxRate: number = 0.25
): {
  taxUsd: number;
  taxIls: number;
  timeline: Array<{ timestamp: number; cumulativeTaxUsd: number; cumulativeTaxIls: number }>;
} {
  let cumulativeProfitUsd = 0;
  let peakProfitUsd = 0;
  let taxUsd = 0;
  let taxIls = 0;
  const timeline: Array<{ timestamp: number; cumulativeTaxUsd: number; cumulativeTaxIls: number }> = [];

  sales.forEach((sale) => {
    cumulativeProfitUsd += sale.profitUsd;

    if (sale.profitUsd > 0) {
      const newPeakProfitUsd = Math.max(peakProfitUsd, cumulativeProfitUsd);
      const taxableProfitUsd = Math.max(0, newPeakProfitUsd - peakProfitUsd);

      if (taxableProfitUsd > 1e-8) {
        const conversionRate = sale.profitUsd !== 0 ? sale.profitIls / sale.profitUsd : 0;
        taxUsd += taxableProfitUsd * taxRate;
        taxIls += taxableProfitUsd * conversionRate * taxRate;
      }

      peakProfitUsd = newPeakProfitUsd;
    }

    peakProfitUsd = Math.max(peakProfitUsd, cumulativeProfitUsd);

    const timestamp = typeof sale.timestamp === 'number' ? sale.timestamp : Number.NaN;
    if (!Number.isNaN(timestamp)) {
      timeline.push({
        timestamp,
        cumulativeTaxUsd: taxUsd,
        cumulativeTaxIls: taxIls,
      });
    }
  });

  return { taxUsd, taxIls, timeline };
}

export function calculatePortfolioSummary(
  metrics: PositionMetrics[],
  usdToIlsRate: number
): PortfolioSummary {
  const summary = metrics.reduce(
    (acc, m) => ({
      totalCurrentPnLUsd: acc.totalCurrentPnLUsd + m.positionPnLUsd,
      totalCurrentPnLIls: acc.totalCurrentPnLIls + m.positionPnLIls,
      totalProjectedPnLUsd: acc.totalProjectedPnLUsd + m.projectedPnLUsd,
      totalProjectedPnLIls: acc.totalProjectedPnLIls + m.projectedPnLIls,
      totalCombinedUsd: acc.totalCombinedUsd + m.combined,
      totalCombinedIls: acc.totalCombinedIls + m.combinedIls,
      totalValue: acc.totalValue + m.currentValue,
      totalCost: acc.totalCost + (m.position.entryPrice * m.position.quantity),
    }),
    {
      totalCurrentPnLUsd: 0,
      totalCurrentPnLIls: 0,
      totalProjectedPnLUsd: 0,
      totalProjectedPnLIls: 0,
      totalCombinedUsd: 0,
      totalCombinedIls: 0,
      totalValue: 0,
      totalCost: 0,
    }
  );

  return {
    ...summary,
    totalRealizedProfitUsd: 0,
    totalRealizedProfitIls: 0,
    totalTaxesPaidUsd: 0,
    totalTaxesPaidIls: 0,
    totalNetPnLUsd: summary.totalCurrentPnLUsd,
    totalNetPnLIls: summary.totalCurrentPnLIls,
    usdToIlsRate,
  };
}

export function calculateRealizedPortfolioTotals(
  sales: RealizedSale[],
  annualGrowthRate: number,
  usdToIlsRate: number,
  getFxRateAt: FxRateResolver = () => usdToIlsRate,
): RealizedPortfolioTotals {
  return sales.reduce<RealizedPortfolioTotals>((acc, sale) => {
    const holdingYears = Math.max((sale.holdingPeriodDays ?? 0) / 365.25, 0);
    const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
    const expectedProfitUsd = sale.costBasisUsd * (expectedFactor - 1);
    const sellTimestamp = new Date(sale.sellDate).getTime();
    const sellFxRate = getFxRateAt(sellTimestamp);

    acc.proceedsUsd += sale.proceedsUsd;
    acc.costUsd += sale.costBasisUsd;
    acc.profitUsd += sale.profitUsd;
    acc.expectedProfitUsd += expectedProfitUsd;
    acc.proceedsIls += sale.proceedsIls ?? sale.proceedsUsd * usdToIlsRate;
    acc.costIls += sale.costBasisIls ?? sale.costBasisUsd * usdToIlsRate;
    acc.profitIls += sale.profitIls ?? sale.profitUsd * usdToIlsRate;
    acc.expectedProfitIls += expectedProfitUsd * sellFxRate;
    return acc;
  }, { ...EMPTY_REALIZED_PORTFOLIO_TOTALS });
}

export function normalizeOpenPortfolioSummary(summary: PortfolioSummary): PortfolioSummary {
  const totalProjectedPnLUsd = Math.max(summary.totalProjectedPnLUsd, 0);
  const totalProjectedPnLIls = Math.max(summary.totalProjectedPnLIls, 0);

  return {
    ...summary,
    totalProjectedPnLUsd,
    totalProjectedPnLIls,
    totalCombinedUsd: summary.totalCurrentPnLUsd - totalProjectedPnLUsd,
    totalCombinedIls: summary.totalCurrentPnLIls - totalProjectedPnLIls,
    totalRealizedProfitUsd: 0,
    totalRealizedProfitIls: 0,
    totalTaxesPaidUsd: 0,
    totalTaxesPaidIls: 0,
    totalNetPnLUsd: summary.totalCurrentPnLUsd,
    totalNetPnLIls: summary.totalCurrentPnLIls,
  };
}

export function enrichPortfolioSummaryWithRealized(
  summary: PortfolioSummary,
  realizedTotals: RealizedPortfolioTotals,
  taxTotals: PortfolioTaxTotals,
): PortfolioSummary {
  const totalCurrentPnLUsd = summary.totalCurrentPnLUsd + realizedTotals.profitUsd;
  const totalCurrentPnLIls = summary.totalCurrentPnLIls + realizedTotals.profitIls;
  const totalProjectedPnLUsd = Math.max(summary.totalProjectedPnLUsd + realizedTotals.expectedProfitUsd, 0);
  const totalProjectedPnLIls = Math.max(summary.totalProjectedPnLIls + realizedTotals.expectedProfitIls, 0);

  return {
    ...summary,
    totalCurrentPnLUsd,
    totalCurrentPnLIls,
    totalProjectedPnLUsd,
    totalProjectedPnLIls,
    totalCombinedUsd: totalCurrentPnLUsd - totalProjectedPnLUsd,
    totalCombinedIls: totalCurrentPnLIls - totalProjectedPnLIls,
    totalRealizedProfitUsd: realizedTotals.profitUsd,
    totalRealizedProfitIls: realizedTotals.profitIls,
    totalTaxesPaidUsd: taxTotals.taxUsd,
    totalTaxesPaidIls: taxTotals.taxIls,
    totalNetPnLUsd: totalCurrentPnLUsd - taxTotals.taxUsd,
    totalNetPnLIls: totalCurrentPnLIls - taxTotals.taxIls,
  };
}

export function buildPortfolioTimelinePointFromSummary(
  summary: PortfolioSummary,
  timestamp: number,
  fallbackSpyPoint?: Pick<PortfolioTimelinePoint, 'spyNetPnLUsd' | 'spyNetPnLIls'>,
): PortfolioTimelinePoint {
  return {
    timestamp,
    totalPnLUsd: summary.totalCurrentPnLUsd,
    totalPnLIls: summary.totalCurrentPnLIls,
    netPnLUsd: summary.totalNetPnLUsd,
    netPnLIls: summary.totalNetPnLIls,
    expectedNetPnLUsd: summary.totalProjectedPnLUsd,
    expectedNetPnLIls: summary.totalProjectedPnLIls,
    spyNetPnLUsd: fallbackSpyPoint?.spyNetPnLUsd ?? 0,
    spyNetPnLIls: fallbackSpyPoint?.spyNetPnLIls ?? 0,
  };
}

export function buildPortfolioAllocation(
  metrics: PositionMetrics[],
  usdToIlsRate: number
): PortfolioAllocationDatum[] {
  if (!metrics.length) {
    return [];
  }

  const totalValue = metrics.reduce((sum, item) => sum + item.currentValue, 0);
  if (totalValue <= 0) {
    return [];
  }

  return metrics
    .map((m) => {
      const valueUsd = m.currentValue;
      const valueIls = valueUsd * (usdToIlsRate || 0);
      const percentage = (valueUsd / totalValue) * 100;

      return {
        symbol: m.position.symbol,
        display: m.position.display,
        valueUsd,
        valueIls,
        percentage,
      };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

export function buildPortfolioPnL(metrics: PositionMetrics[]): PortfolioPnLDatum[] {
  if (!metrics.length) {
    return [];
  }

  return metrics
    .map((m) => ({
      symbol: m.position.symbol,
      display: m.position.display,
      currentPnLUsd: m.positionPnLUsd,
      projectedPnLUsd: m.projectedPnLUsd,
      currentValue: m.currentValue,
    }))
    .sort((a, b) => Math.abs(b.currentPnLUsd) - Math.abs(a.currentPnLUsd));
}

export function mapCandleDataToPoints(data?: CandleData | null): HistoricalPoint[] {
  if (!data || !Array.isArray(data.t) || !Array.isArray(data.c)) {
    return [];
  }

  const length = Math.min(data.t.length, data.c.length);
  const points: HistoricalPoint[] = [];

  for (let i = 0; i < length; i++) {
    const timestamp = data.t[i];
    const close = data.c[i];
    const open = Array.isArray(data.o) ? data.o[i] : undefined;
    const high = Array.isArray(data.h) ? data.h[i] : undefined;
    const low = Array.isArray(data.l) ? data.l[i] : undefined;
    const volume = Array.isArray(data.v) ? data.v[i] : undefined;

    if (typeof timestamp !== 'number' || typeof close !== 'number') {
      continue;
    }

    points.push({
      timestamp: timestamp * 1000,
      open: typeof open === 'number' ? open : undefined,
      high: typeof high === 'number' ? high : undefined,
      low: typeof low === 'number' ? low : undefined,
      close,
      volume: typeof volume === 'number' ? volume : undefined,
    });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}
