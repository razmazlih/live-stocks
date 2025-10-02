import {
  ChecklistItem,
  ChecklistKey,
  DivergenceSummary,
  HistoricalPoint,
  IndicatorSeriesPoint,
  RiskRewardPlan,
  StockAnalysisResult,
  StockIndicatorSnapshot,
  SupportResistanceLevels,
} from '@/types';
import {
  buildIndicatorSeries,
  calculatePeriodExtremes,
  detectBullishCandlestick,
  evaluateDivergences,
  findSupportResistance,
  movingAverageVolume,
} from './indicators';

interface AnalyzeStockParams {
  points: HistoricalPoint[];
  currentPrice: number;
}

const WEIGHTS: Record<ChecklistKey, number> = {
  trend: 25,
  rsi: 20,
  macd: 15,
  volume: 15,
  supportResistance: 15,
  riskReward: 10,
};

function computeRiskReward(
  currentPrice: number,
  supportResistance: SupportResistanceLevels,
  atr?: number
): RiskRewardPlan {
  const sortedSupports = [...supportResistance.supports].sort((a, b) => a - b);
  const sortedResistances = [...supportResistance.resistances].sort((a, b) => a - b);

  const nearestSupport = sortedSupports.filter((level) => level < currentPrice).pop();
  const nearestResistance = sortedResistances.find((level) => level > currentPrice);

  let stop = nearestSupport;
  let target = nearestResistance;

  if (stop === undefined && atr !== undefined) {
    stop = currentPrice - atr * 1.5;
  }
  if (target === undefined && atr !== undefined) {
    target = currentPrice + atr * 2;
  }

  let rr: number | undefined;
  if (stop !== undefined && target !== undefined) {
    const risk = currentPrice - stop;
    const reward = target - currentPrice;
    if (risk > 0 && reward > 0) {
      rr = reward / risk;
    }
  }

  return { stop, target, rr };
}

function buildChecklist(
  latest: IndicatorSeriesPoint | undefined,
  previous: IndicatorSeriesPoint | undefined,
  volumeInfo: { latest?: number; average20?: number },
  supportResistance: SupportResistanceLevels,
  candlestickSignal: string | null,
  riskReward: RiskRewardPlan
): ChecklistItem[] {
  if (!latest) {
    return [];
  }

  const trendPassed = Boolean(
    latest.ema50 !== undefined &&
      latest.ema200 !== undefined &&
      latest.close > latest.ema50 &&
      latest.ema50 > latest.ema200
  );

  const prevRsi = previous?.rsi14;
  const rsi = latest.rsi14;
  const rsiCrossFromBelow =
    prevRsi !== undefined && prevRsi < 30 && rsi !== undefined && rsi > 30;
  const rsiExitWeakness =
    prevRsi !== undefined && prevRsi > 70 && rsi !== undefined && rsi < 70;
  const bollingerRebound =
    previous?.bbLower !== undefined &&
    previous.close < previous.bbLower &&
    latest.bbLower !== undefined &&
    latest.close > latest.bbLower;
  const rsiPassed = Boolean(
    rsi !== undefined &&
      ((rsi >= 45 && rsi <= 65) || rsiCrossFromBelow || rsiExitWeakness || bollingerRebound)
  );

  const macd = latest.macd;
  const macdSignal = latest.macdSignal;
  const prevMacd = previous?.macd;
  const prevSignal = previous?.macdSignal;
  const macdCrossUp =
    macd !== undefined &&
    macdSignal !== undefined &&
    prevMacd !== undefined &&
    prevSignal !== undefined &&
    prevMacd <= prevSignal &&
    macd >= macdSignal;
  const macdAboveZero = macd !== undefined && macd > 0;
  const macdPassed = Boolean(macdCrossUp && macdAboveZero);

  const averageVolume = volumeInfo.average20;
  const currentVolume = volumeInfo.latest;
  const volumeRatio =
    currentVolume !== undefined && averageVolume
      ? currentVolume / averageVolume
      : undefined;
  const volumePassed = volumeRatio !== undefined && volumeRatio >= 1.2;

  const nearestSupport = supportResistance.supports
    .filter((level) => level < latest.close)
    .sort((a, b) => b - a)[0];
  const proximityToSupport =
    nearestSupport !== undefined ? Math.abs(latest.close - nearestSupport) / latest.close : undefined;
  const touchedSupport = proximityToSupport !== undefined && proximityToSupport <= 0.03;
  const supportResistancePassed = Boolean(touchedSupport || candlestickSignal);

  const rr = riskReward.rr;
  const riskRewardPassed = rr !== undefined && rr >= 2;

  const checklist: ChecklistItem[] = [
    {
      key: 'trend',
      passed: trendPassed,
      weight: WEIGHTS.trend,
      context: {
        price: latest.close,
        ema20: latest.ema20,
        ema50: latest.ema50,
        ema200: latest.ema200,
      },
    },
    {
      key: 'rsi',
      passed: rsiPassed,
      weight: WEIGHTS.rsi,
      context: {
        rsi,
        prevRsi,
        bollingerRebound,
      },
    },
    {
      key: 'macd',
      passed: macdPassed,
      weight: WEIGHTS.macd,
      context: {
        macd,
        macdSignal,
        prevMacd,
        prevSignal,
      },
    },
    {
      key: 'volume',
      passed: volumePassed,
      weight: WEIGHTS.volume,
      context: {
        currentVolume,
        averageVolume,
        volumeRatio,
      },
    },
    {
      key: 'supportResistance',
      passed: supportResistancePassed,
      weight: WEIGHTS.supportResistance,
      context: {
        nearestSupport,
        proximityToSupport,
        candlestickSignal,
      },
    },
    {
      key: 'riskReward',
      passed: riskRewardPassed,
      weight: WEIGHTS.riskReward,
      context: {
        stop: riskReward.stop,
        target: riskReward.target,
        rr,
      },
    },
  ];

  return checklist;
}

function computeScore(checklist: ChecklistItem[]): number {
  return checklist.reduce((total, item) => total + (item.passed ? item.weight : 0), 0);
}

function deriveVerdict(score: number, rrPassed: boolean): 'BUY' | 'SELL' | 'NEUTRAL' {
  if (score >= 70 && rrPassed) {
    return 'BUY';
  }
  if (score <= 35) {
    return 'SELL';
  }
  return 'NEUTRAL';
}

function snapshotIndicators(latest?: IndicatorSeriesPoint): StockIndicatorSnapshot {
  if (!latest) {
    return {};
  }
  return {
    ema20: latest.ema20,
    ema50: latest.ema50,
    ema200: latest.ema200,
    rsi: latest.rsi14,
    macd: latest.macd,
    macdSignal: latest.macdSignal,
    macdHistogram: latest.macdHistogram,
    bollinger: {
      upper: latest.bbUpper,
      middle: latest.bbMiddle,
      lower: latest.bbLower,
    },
    atr: latest.atr14,
  };
}

function summarizeDivergences(series: IndicatorSeriesPoint[]): DivergenceSummary {
  const rsiValues = series.map((point) => point.rsi14);
  const macdValues = series.map((point) => point.macd);
  return evaluateDivergences(series, rsiValues, macdValues);
}

export function analyzeStock({ points, currentPrice }: AnalyzeStockParams): StockAnalysisResult {
  if (!points.length) {
    return {
      series: [],
      indicators: {},
      supportResistance: {
        supports: [],
        resistances: [],
      },
      divergences: { rsi: 'none', macd: 'none' },
      volume: {},
      checklist: [],
      score: 0,
      verdict: 'NEUTRAL',
      riskReward: {},
    };
  }

  const orderedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const series = buildIndicatorSeries(orderedPoints);
  const latest = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : undefined;

  const supportResistance = findSupportResistance(series);
  const divergences = summarizeDivergences(series);
  const volumeSeries = movingAverageVolume(series);
  const candlestickSignal = detectBullishCandlestick(series);
  const riskReward = computeRiskReward(currentPrice, supportResistance, latest?.atr14);

  const checklist = buildChecklist(
    latest,
    previous,
    {
      latest: latest?.volume,
      average20: volumeSeries[volumeSeries.length - 1],
    },
    supportResistance,
    candlestickSignal,
    riskReward
  );

  const score = computeScore(checklist);
  const rrPassed = checklist.find((item) => item.key === 'riskReward')?.passed ?? false;
  const verdict = deriveVerdict(score, rrPassed);

  const indicators = snapshotIndicators(latest);
  const { high: periodHigh, low: periodLow } = calculatePeriodExtremes(series);

  return {
    series,
    indicators,
    supportResistance,
    divergences,
    volume: {
      latest: latest?.volume,
      average20: volumeSeries[volumeSeries.length - 1],
    },
    checklist,
    score,
    verdict,
    riskReward,
    periodHigh,
    periodLow,
  };
}
