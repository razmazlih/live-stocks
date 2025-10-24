import { CandleData, HistoricalPoint, PortfolioAllocationDatum, PortfolioPnLDatum, Position, PositionLot, PositionMetrics, PortfolioSummary } from '@/types';
import { computeOpenLots, summarizeLots } from '@/lib/positions';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

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
    const projectedPrice = lot.price * Math.pow(1 + annualGrowthRate, yearsHeld);
    return sum + projectedPrice * lot.quantity;
  }, 0);

  return weightedSum / totalQuantity;
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

export function formatCurrency(value: number, currency: 'USD' | 'ILS', locale: 'he' | 'en' = 'he'): string {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, locale: 'he' | 'en' = 'he'): string {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, locale: 'he' | 'en' = 'he'): string {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatDate(date: string | Date, locale: 'he' | 'en' = 'he'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
