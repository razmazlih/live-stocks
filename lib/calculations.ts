import { CandleData, HistoricalPoint, PortfolioAllocationDatum, PortfolioPnLDatum, Position, PositionLot, PositionMetrics, PortfolioSummary, RebalanceSuggestion } from '@/types';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const TRADING_DAYS_PER_YEAR = 252;

function getRemainingQuantity(lot: PositionLot): number {
  const exitQuantity = (lot.exits || []).reduce((total, exit) => total + (exit?.quantity || 0), 0);
  return Math.max((lot.entryQuantity || 0) - exitQuantity, 0);
}

export interface PositionLotSummary {
  totalQuantity: number;
  costBasis: number;
  averageEntryPrice: number;
  weightedEntryTimestamp?: number;
  weightedEntryDate?: string;
  weightedYearsHeld: number;
  projectedPrice: number;
}

export function summarizePositionLots(
  lots: PositionLot[] = [],
  annualGrowthRate = 0,
  referenceDate: Date = new Date()
): PositionLotSummary {
  if (!Array.isArray(lots) || lots.length === 0) {
    return {
      totalQuantity: 0,
      costBasis: 0,
      averageEntryPrice: 0,
      weightedYearsHeld: 0,
      projectedPrice: 0,
    };
  }

  let totalQuantity = 0;
  let costBasis = 0;
  let weightedEntryTimestamp = 0;
  let weightedYearsHeldAccumulator = 0;
  let projectedPriceAccumulator = 0;

  for (const lot of lots) {
    const remainingQuantity = getRemainingQuantity(lot);

    if (remainingQuantity <= 0) {
      continue;
    }

    const entryPrice = lot.entryPrice || 0;
    const entryDate = lot.entryDate ? new Date(lot.entryDate) : referenceDate;
    const yearsHeld = (referenceDate.getTime() - entryDate.getTime()) / MS_PER_YEAR;
    const projectedLotPrice = entryPrice * Math.pow(1 + annualGrowthRate, Math.max(yearsHeld, 0));

    totalQuantity += remainingQuantity;
    costBasis += entryPrice * remainingQuantity;
    weightedEntryTimestamp += entryDate.getTime() * remainingQuantity;
    weightedYearsHeldAccumulator += Math.max(yearsHeld, 0) * remainingQuantity;
    projectedPriceAccumulator += projectedLotPrice * remainingQuantity;
  }

  if (totalQuantity <= 0) {
    return {
      totalQuantity: 0,
      costBasis: 0,
      averageEntryPrice: 0,
      weightedYearsHeld: 0,
      projectedPrice: 0,
    };
  }

  const averageEntryPrice = costBasis / totalQuantity;
  const weightedEntryTimestampAverage = weightedEntryTimestamp / totalQuantity;

  return {
    totalQuantity,
    costBasis,
    averageEntryPrice,
    weightedEntryTimestamp: weightedEntryTimestampAverage,
    weightedEntryDate: new Date(weightedEntryTimestampAverage).toISOString(),
    weightedYearsHeld: weightedYearsHeldAccumulator / totalQuantity,
    projectedPrice: projectedPriceAccumulator / totalQuantity,
  };
}

export function calculateWeightedProjectedPrice(
  lots: PositionLot[] = [],
  annualGrowthRate = 0.05,
  referenceDate: Date = new Date()
): number {
  const summary = summarizePositionLots(lots, annualGrowthRate, referenceDate);
  return summary.projectedPrice;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[], sample = false): number {
  if (values.length < (sample ? 2 : 1)) {
    return 0;
  }
  const avg = mean(values);
  const sumSquaredDiff = values.reduce((total, value) => total + Math.pow(value - avg, 2), 0);
  return sumSquaredDiff / (values.length - (sample ? 1 : 0));
}

function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values, true));
}

function computeQuantile(sortedValues: number[], q: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  const clampedQ = Math.min(Math.max(q, 0), 1);
  if (clampedQ === 0) {
    return sortedValues[0];
  }
  if (clampedQ === 1) {
    return sortedValues[sortedValues.length - 1];
  }

  const position = (sortedValues.length - 1) * clampedQ;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const lowerValue = sortedValues[lowerIndex];
  const upperValue = sortedValues[upperIndex];
  const weight = position - lowerIndex;

  return lowerValue + (upperValue - lowerValue) * weight;
}

export function calculatePositionMetrics(
  position: Position,
  currentPrice: number,
  usdToIlsRate: number,
  annualGrowthRate: number = 0.05,
  dailyChange?: number
): PositionMetrics {
  const now = new Date();
  const lots = position.lots && position.lots.length > 0
    ? position.lots
    : [{
        entryPrice: position.entryPrice,
        entryQuantity: position.quantity,
        entryDate: position.entryDate,
      }];

  const lotSummary = summarizePositionLots(lots, annualGrowthRate, now);
  const quantity = lotSummary.totalQuantity || position.quantity;
  const entryPrice = quantity > 0 ? lotSummary.averageEntryPrice : position.entryPrice;
  const yearsHeld = lotSummary.weightedYearsHeld;

  const costBasis = lotSummary.costBasis;
  const currentValue = currentPrice * quantity;
  const positionPnLUsd = currentValue - costBasis;
  const positionPnLIls = positionPnLUsd * usdToIlsRate;

  const projectedPrice = lotSummary.projectedPrice || entryPrice;
  const projectedValue = projectedPrice * quantity;
  const projectedPnLUsd = projectedValue - costBasis;
  const projectedPnLIls = projectedPnLUsd * usdToIlsRate;

  const combined = positionPnLUsd - projectedPnLUsd;
  const combinedIls = combined * usdToIlsRate;

  const roiPercent = costBasis > 0 ? (positionPnLUsd / costBasis) * 100 : 0;
  const dailyChangePercent = dailyChange !== undefined && currentPrice - dailyChange !== 0
    ? (dailyChange / (currentPrice - dailyChange)) * 100
    : undefined;

  return {
    position: {
      ...position,
      entryPrice,
      quantity,
      entryDate: lotSummary.weightedEntryDate || position.entryDate,
      lots,
    },
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
    costBasis,
    roiPercent,
    dailyChange,
    dailyChangePercent,
  };
}

export function calculateCagr(entryPrice: number, currentPrice: number, yearsHeld: number): number {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(currentPrice) || entryPrice <= 0) {
    return 0;
  }

  const duration = Math.max(yearsHeld, 1 / TRADING_DAYS_PER_YEAR);
  const growthFactor = currentPrice / entryPrice;
  if (growthFactor <= 0) {
    return 0;
  }

  return Math.pow(growthFactor, 1 / duration) - 1;
}

export function calculateMaxDrawdown(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  let peak = values[0];
  let maxDrawdown = 0;

  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }

    peak = Math.max(peak, value);
    const drawdown = (value - peak) / peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return Math.abs(maxDrawdown);
}

export function calculateDailyReturns(points: HistoricalPoint[]): number[] {
  if (!points || points.length < 2) {
    return [];
  }

  const returns: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const previous = safeNumber(points[i - 1]?.close);
    const current = safeNumber(points[i]?.close);

    if (previous <= 0 || current <= 0) {
      continue;
    }

    returns.push(current / previous - 1);
  }

  return returns;
}

export function calculateAnnualizedVolatility(returns: number[]): number {
  if (!returns.length) {
    return 0;
  }

  const stdDev = standardDeviation(returns);
  return stdDev * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function calculateValueAtRisk(returns: number[], confidence = 0.95): number {
  if (!returns.length) {
    return 0;
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const tailQuantile = computeQuantile(sorted, 1 - confidence);
  return Math.max(0, -tailQuantile);
}

export function calculateExpectedShortfall(returns: number[], confidence = 0.95): number {
  if (!returns.length) {
    return 0;
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const tailQuantile = computeQuantile(sorted, 1 - confidence);
  const tailReturns = sorted.filter((value) => value <= tailQuantile);

  if (!tailReturns.length) {
    return Math.max(0, -tailQuantile);
  }

  const tailMean = mean(tailReturns);
  return Math.max(0, -tailMean);
}

export function calculateSharpeRatio(returns: number[], riskFreeRate = 0): number {
  if (!returns.length) {
    return 0;
  }

  const avgReturn = mean(returns);
  const excessReturn = avgReturn - riskFreeRate;
  const stdDev = standardDeviation(returns);

  if (stdDev === 0) {
    return 0;
  }

  return (excessReturn / stdDev) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function calculateSortinoRatio(returns: number[], riskFreeRate = 0): number {
  if (!returns.length) {
    return 0;
  }

  const avgReturn = mean(returns);
  const excessReturn = avgReturn - riskFreeRate;
  const negativeReturns = returns.filter((value) => value < 0);

  if (!negativeReturns.length) {
    return 0;
  }

  const downsideDeviation = Math.sqrt(mean(negativeReturns.map((value) => Math.pow(value, 2))));
  if (downsideDeviation === 0) {
    return 0;
  }

  return (excessReturn / downsideDeviation) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function calculateCorrelationMatrix(series: number[][]): number[][] {
  if (!series.length) {
    return [];
  }

  const length = series[0]?.length ?? 0;
  if (!length) {
    return [];
  }

  const means = series.map((values) => mean(values));
  const matrix: number[][] = [];

  for (let i = 0; i < series.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < series.length; j++) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }

      let covarianceSum = 0;
      let count = 0;

      for (let k = 0; k < length; k++) {
        const a = series[i][k];
        const b = series[j][k];
        if (Number.isFinite(a) && Number.isFinite(b)) {
          covarianceSum += (a - means[i]) * (b - means[j]);
          count += 1;
        }
      }

      if (count < 2) {
        matrix[i][j] = 0;
        continue;
      }

      const covariance = covarianceSum / (count - 1);
      const stdA = standardDeviation(series[i]);
      const stdB = standardDeviation(series[j]);

      if (stdA === 0 || stdB === 0) {
        matrix[i][j] = 0;
      } else {
        matrix[i][j] = covariance / (stdA * stdB);
      }
    }
  }

  return matrix;
}

export function calculateBeta(assetReturns: number[], benchmarkReturns: number[]): number {
  if (!assetReturns.length || !benchmarkReturns.length) {
    return 0;
  }

  const length = Math.min(assetReturns.length, benchmarkReturns.length);
  const assetSlice = assetReturns.slice(-length);
  const benchmarkSlice = benchmarkReturns.slice(-length);

  const assetMean = mean(assetSlice);
  const benchmarkMean = mean(benchmarkSlice);

  let covarianceSum = 0;
  let varianceSum = 0;

  for (let i = 0; i < length; i++) {
    const assetDiff = assetSlice[i] - assetMean;
    const benchmarkDiff = benchmarkSlice[i] - benchmarkMean;
    covarianceSum += assetDiff * benchmarkDiff;
    varianceSum += benchmarkDiff * benchmarkDiff;
  }

  if (varianceSum === 0) {
    return 0;
  }

  return covarianceSum / varianceSum;
}

export function calculateHerfindahlIndex(weights: number[]): number {
  if (!weights.length) {
    return 0;
  }

  return weights.reduce((sum, weight) => sum + Math.pow(weight, 2), 0);
}

export function calculateEqualWeightRebalance(metrics: PositionMetrics[]): RebalanceSuggestion[] {
  if (!metrics.length) {
    return [];
  }

  const totalValue = metrics.reduce((sum, item) => sum + item.currentValue, 0);
  if (totalValue === 0) {
    return [];
  }

  const targetWeight = 1 / metrics.length;

  return metrics.map((metric) => {
    const currentValue = metric.currentValue;
    const currentWeight = currentValue / totalValue;
    const targetValue = targetWeight * totalValue;
    const deltaValue = targetValue - currentValue;
    const action = deltaValue > 0.01 * totalValue
      ? 'buy'
      : deltaValue < -0.01 * totalValue
        ? 'sell'
        : 'hold';
    const unitsToTrade = metric.currentPrice > 0 ? deltaValue / metric.currentPrice : 0;

    return {
      symbol: metric.position.symbol,
      display: metric.position.display,
      currentWeight,
      targetWeight,
      deltaWeight: targetWeight - currentWeight,
      currentValue,
      targetValue,
      action,
      unitsToTrade,
    };
  });
}

export function calculateReturnDistribution(returns: number[]): {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  percentile5: number;
  percentile95: number;
} {
  if (!returns.length) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      percentile5: 0,
      percentile95: 0,
    };
  }

  const sorted = [...returns].sort((a, b) => a - b);

  return {
    mean: mean(returns),
    median: computeQuantile(sorted, 0.5),
    stdDev: standardDeviation(returns),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    percentile5: computeQuantile(sorted, 0.05),
    percentile95: computeQuantile(sorted, 0.95),
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
      totalCost: acc.totalCost + m.costBasis,
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
