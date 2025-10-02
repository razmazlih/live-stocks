import { Position, PositionMetrics, PortfolioSummary, StockQuote } from '@/types';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function calculatePositionMetrics(
  position: Position,
  currentPrice: number,
  usdToIlsRate: number,
  annualGrowthRate: number = 0.05,
  dailyChange?: number
): PositionMetrics {
  const entryDate = new Date(position.entryDate);
  const now = new Date();
  const yearsHeld = (now.getTime() - entryDate.getTime()) / MS_PER_YEAR;

  const positionPnLUsd = (currentPrice - position.entryPrice) * position.quantity;
  const positionPnLIls = positionPnLUsd * usdToIlsRate;

  const projectedPrice = position.entryPrice * Math.pow(1 + annualGrowthRate, yearsHeld);
  const projectedPnLUsd = (projectedPrice - position.entryPrice) * position.quantity;
  const projectedPnLIls = projectedPnLUsd * usdToIlsRate;

  const combined = positionPnLUsd - projectedPnLUsd;
  const combinedIls = combined * usdToIlsRate;

  const currentValue = currentPrice * position.quantity;
  const costBasis = position.entryPrice * position.quantity;
  const roiPercent = ((currentValue - costBasis) / costBasis) * 100;

  const dailyChangePercent = dailyChange !== undefined ? (dailyChange / (currentPrice - dailyChange)) * 100 : undefined;

  return {
    position,
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
    dailyChange,
    dailyChangePercent,
  };
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
