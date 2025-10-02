import { DivergenceSignal, HistoricalPoint, IndicatorSeriesPoint, SupportResistanceLevels } from '@/types';

function safeClose(point?: HistoricalPoint | null): number | undefined {
  if (!point) {
    return undefined;
  }
  return typeof point.close === 'number' && Number.isFinite(point.close) ? point.close : undefined;
}

function safeHigh(point?: HistoricalPoint | null): number | undefined {
  if (!point) {
    return undefined;
  }
  if (typeof point.high === 'number' && Number.isFinite(point.high)) {
    return point.high;
  }
  return safeClose(point);
}

function safeLow(point?: HistoricalPoint | null): number | undefined {
  if (!point) {
    return undefined;
  }
  if (typeof point.low === 'number' && Number.isFinite(point.low)) {
    return point.low;
  }
  return safeClose(point);
}

function initialSMA(values: number[], period: number): number | undefined {
  if (values.length < period || period <= 0) {
    return undefined;
  }
  const slice = values.slice(0, period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function calculateEMAFromValues(values: number[], period: number): Array<number | undefined> {
  if (!values.length) {
    return [];
  }

  const results: Array<number | undefined> = [];
  const multiplier = 2 / (period + 1);

  let ema: number | undefined = initialSMA(values, period);

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      results.push(undefined);
      continue;
    }

    if (ema === undefined) {
      // Not enough data yet to seed EMA
      if (i + 1 >= period) {
        const start = values.slice(i + 1 - period, i + 1);
        const seeded = initialSMA(start, period);
        if (seeded !== undefined) {
          ema = seeded;
          results.push(ema);
        } else {
          results.push(undefined);
        }
      } else {
        results.push(undefined);
      }
      continue;
    }

    ema = (value - ema) * multiplier + ema;
    results.push(ema);
  }

  return results;
}

export function calculateEMA(points: HistoricalPoint[], period: number): Array<number | undefined> {
  const closes = points.map((point) => safeClose(point) ?? NaN);
  return calculateEMAFromValues(closes, period);
}

export function calculateSMA(points: HistoricalPoint[], period: number): Array<number | undefined> {
  const values = points.map((point) => safeClose(point) ?? NaN);
  const results: Array<number | undefined> = [];

  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) {
      results.push(undefined);
      continue;
    }
    const window = values.slice(i + 1 - period, i + 1).filter((value) => Number.isFinite(value));
    if (window.length < period) {
      results.push(undefined);
      continue;
    }
    const sum = window.reduce((acc, value) => acc + value, 0);
    results.push(sum / period);
  }

  return results;
}

export function calculateRSI(points: HistoricalPoint[], period = 14): Array<number | undefined> {
  if (!points.length || period <= 0) {
    return [];
  }

  const closes = points.map((point) => safeClose(point) ?? NaN);
  const results: Array<number | undefined> = [];

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < closes.length; i++) {
    if (i === 0 || !Number.isFinite(closes[i]) || !Number.isFinite(closes[i - 1])) {
      results.push(undefined);
      continue;
    }

    const difference = closes[i] - closes[i - 1];
    const gain = Math.max(difference, 0);
    const loss = Math.max(-difference, 0);

    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
        results.push(rsi);
      } else {
        results.push(undefined);
      }
      continue;
    }

    const prevRsi = results[results.length - 1];
    if (prevRsi === undefined) {
      // Seed using Wilder's smoothing
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
    } else {
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
    }

    if (losses === 0) {
      results.push(100);
    } else {
      const rs = gains / losses;
      results.push(100 - 100 / (1 + rs));
    }
  }

  return results;
}

export function calculateMACD(
  points: HistoricalPoint[],
  shortPeriod = 12,
  longPeriod = 26,
  signalPeriod = 9
): {
  macd: Array<number | undefined>;
  signal: Array<number | undefined>;
  histogram: Array<number | undefined>;
} {
  if (!points.length) {
    return { macd: [], signal: [], histogram: [] };
  }

  const shortEma = calculateEMA(points, shortPeriod);
  const longEma = calculateEMA(points, longPeriod);
  const macd: Array<number | undefined> = points.map((_, index) => {
    const shortValue = shortEma[index];
    const longValue = longEma[index];
    if (shortValue === undefined || longValue === undefined) {
      return undefined;
    }
    return shortValue - longValue;
  });

  const macdValues = macd.map((value) => (value ?? NaN));
  const signal = calculateEMAFromValues(macdValues, signalPeriod);
  const histogram = macd.map((value, index) => {
    const signalValue = signal[index];
    if (value === undefined || signalValue === undefined) {
      return undefined;
    }
    return value - signalValue;
  });

  return { macd, signal, histogram };
}

export function calculateBollingerBands(
  points: HistoricalPoint[],
  period = 20,
  stdDevMultiplier = 2
): {
  upper: Array<number | undefined>;
  middle: Array<number | undefined>;
  lower: Array<number | undefined>;
} {
  const closes = points.map((point) => safeClose(point) ?? NaN);
  const middle = calculateSMA(points, period);
  const upper: Array<number | undefined> = [];
  const lower: Array<number | undefined> = [];

  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) {
      upper.push(undefined);
      lower.push(undefined);
      continue;
    }

    const window = closes.slice(i + 1 - period, i + 1).filter((value) => Number.isFinite(value));
    if (window.length < period) {
      upper.push(undefined);
      lower.push(undefined);
      continue;
    }

    const avg = middle[i];
    if (avg === undefined) {
      upper.push(undefined);
      lower.push(undefined);
      continue;
    }

    const variance = window.reduce((acc, value) => {
      const diff = value - avg;
      return acc + diff * diff;
    }, 0) / period;
    const stdDev = Math.sqrt(variance);

    upper.push(avg + stdDevMultiplier * stdDev);
    lower.push(avg - stdDevMultiplier * stdDev);
  }

  return { upper, middle, lower };
}

export function calculateATR(points: HistoricalPoint[], period = 14): Array<number | undefined> {
  if (!points.length) {
    return [];
  }

  const results: Array<number | undefined> = [];

  for (let i = 0; i < points.length; i++) {
    const currentHigh = safeHigh(points[i]);
    const currentLow = safeLow(points[i]);
    const prevClose = i > 0 ? safeClose(points[i - 1]) : undefined;

    if (
      currentHigh === undefined ||
      currentLow === undefined ||
      !Number.isFinite(currentHigh) ||
      !Number.isFinite(currentLow)
    ) {
      results.push(undefined);
      continue;
    }

    const highLow = currentHigh - currentLow;
    const highPrevClose = prevClose !== undefined ? Math.abs(currentHigh - prevClose) : 0;
    const lowPrevClose = prevClose !== undefined ? Math.abs(currentLow - prevClose) : 0;
    const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);

    if (i + 1 < period) {
      results.push(undefined);
      continue;
    }

    const previousAtr = results[i - 1];
    if (previousAtr === undefined) {
      // Seed with simple average of true range
      const window: number[] = [];
      for (let j = i + 1 - period; j <= i; j++) {
        const h = safeHigh(points[j]);
        const l = safeLow(points[j]);
        const pc = j > 0 ? safeClose(points[j - 1]) : undefined;
        if (h === undefined || l === undefined) {
          window.push(0);
          continue;
        }
        const hl = h - l;
        const hp = pc !== undefined ? Math.abs(h - pc) : 0;
        const lp = pc !== undefined ? Math.abs(l - pc) : 0;
        window.push(Math.max(hl, hp, lp));
      }
      const sum = window.reduce((acc, value) => acc + value, 0);
      results.push(sum / period);
    } else {
      const atr = ((previousAtr * (period - 1)) + trueRange) / period;
      results.push(atr);
    }
  }

  return results;
}

interface PivotPoint {
  index: number;
  price: number;
}

function detectPivotHighs(points: HistoricalPoint[], left = 3, right = 3): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  for (let i = left; i < points.length - right; i++) {
    const currentHigh = safeHigh(points[i]);
    if (currentHigh === undefined) {
      continue;
    }
    let isPivot = true;
    for (let offset = 1; offset <= left; offset++) {
      const compareHigh = safeHigh(points[i - offset]);
      if (compareHigh !== undefined && compareHigh > currentHigh) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) {
      continue;
    }
    for (let offset = 1; offset <= right; offset++) {
      const compareHigh = safeHigh(points[i + offset]);
      if (compareHigh !== undefined && compareHigh >= currentHigh) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      pivots.push({ index: i, price: currentHigh });
    }
  }
  return pivots;
}

function detectPivotLows(points: HistoricalPoint[], left = 3, right = 3): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  for (let i = left; i < points.length - right; i++) {
    const currentLow = safeLow(points[i]);
    if (currentLow === undefined) {
      continue;
    }
    let isPivot = true;
    for (let offset = 1; offset <= left; offset++) {
      const compareLow = safeLow(points[i - offset]);
      if (compareLow !== undefined && compareLow < currentLow) {
        isPivot = false;
        break;
      }
    }
    if (!isPivot) {
      continue;
    }
    for (let offset = 1; offset <= right; offset++) {
      const compareLow = safeLow(points[i + offset]);
      if (compareLow !== undefined && compareLow <= currentLow) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      pivots.push({ index: i, price: currentLow });
    }
  }
  return pivots;
}

function consolidateLevels(levels: PivotPoint[], tolerance = 0.005): number[] {
  if (!levels.length) {
    return [];
  }
  const sorted = [...levels].sort((a, b) => b.index - a.index);
  const consolidated: number[] = [];

  for (const pivot of sorted) {
    const price = pivot.price;
    const exists = consolidated.some((level) => Math.abs(level - price) / price < tolerance);
    if (!exists) {
      consolidated.push(price);
    }
    if (consolidated.length >= 5) {
      break;
    }
  }

  return consolidated.sort((a, b) => a - b);
}

export function findSupportResistance(points: HistoricalPoint[]): SupportResistanceLevels {
  const highs = detectPivotHighs(points);
  const lows = detectPivotLows(points);

  const supports = consolidateLevels(lows);
  const resistances = consolidateLevels(highs);

  const swingHighPivot = highs.length ? highs[highs.length - 1] : undefined;
  const swingLowPivot = lows.length ? lows[lows.length - 1] : undefined;

  const lastBreakout = detectBreakout(points, 20, 'up');
  const lastBreakdown = detectBreakout(points, 20, 'down');

  return {
    supports,
    resistances,
    swingHigh: swingHighPivot
      ? { timestamp: points[swingHighPivot.index]?.timestamp ?? 0, price: swingHighPivot.price }
      : undefined,
    swingLow: swingLowPivot
      ? { timestamp: points[swingLowPivot.index]?.timestamp ?? 0, price: swingLowPivot.price }
      : undefined,
    lastBreakout,
    lastBreakdown,
  };
}

function detectBreakout(
  points: HistoricalPoint[],
  lookback: number,
  direction: 'up' | 'down'
): { timestamp: number; price: number } | undefined {
  if (!points.length) {
    return undefined;
  }

  for (let i = points.length - 1; i >= lookback; i--) {
    const slice = points.slice(i - lookback, i);
    const close = safeClose(points[i]);
    if (close === undefined) {
      continue;
    }
    const highs = slice.map((point) => safeHigh(point) ?? safeClose(point) ?? 0);
    const lows = slice.map((point) => safeLow(point) ?? safeClose(point) ?? 0);

    if (direction === 'up') {
      const max = Math.max(...highs);
      if (close > max) {
        return { timestamp: points[i].timestamp, price: close };
      }
    } else {
      const min = Math.min(...lows);
      if (close < min) {
        return { timestamp: points[i].timestamp, price: close };
      }
    }
  }

  return undefined;
}

function detectDivergence(
  pricePivots: PivotPoint[],
  indicatorValues: Array<number | undefined>,
  type: 'high' | 'low'
): DivergenceSignal {
  if (pricePivots.length < 2) {
    return 'none';
  }

  const recent = [...pricePivots].slice(-2);
  const first = recent[0];
  const second = recent[1];

  const firstValue = indicatorValues[first.index];
  const secondValue = indicatorValues[second.index];

  if (firstValue === undefined || secondValue === undefined) {
    return 'none';
  }

  if (type === 'high') {
    if (second.price > first.price && secondValue < firstValue) {
      return 'negative';
    }
    if (second.price < first.price && secondValue > firstValue) {
      return 'positive';
    }
  } else {
    if (second.price < first.price && secondValue > firstValue) {
      return 'positive';
    }
    if (second.price > first.price && secondValue < firstValue) {
      return 'negative';
    }
  }

  return 'none';
}

export function evaluateDivergences(
  points: HistoricalPoint[],
  rsiValues: Array<number | undefined>,
  macdValues: Array<number | undefined>
): { rsi: DivergenceSignal; macd: DivergenceSignal } {
  const highs = detectPivotHighs(points);
  const lows = detectPivotLows(points);

  return {
    rsi: detectDivergence(lows, rsiValues, 'low') === 'positive'
      ? 'positive'
      : detectDivergence(highs, rsiValues, 'high') === 'negative'
        ? 'negative'
        : 'none',
    macd: detectDivergence(lows, macdValues, 'low') === 'positive'
      ? 'positive'
      : detectDivergence(highs, macdValues, 'high') === 'negative'
        ? 'negative'
        : 'none',
  };
}

export function buildIndicatorSeries(points: HistoricalPoint[]): IndicatorSeriesPoint[] {
  if (!points.length) {
    return [];
  }

  const ema20 = calculateEMA(points, 20);
  const ema50 = calculateEMA(points, 50);
  const ema200 = calculateEMA(points, 200);
  const rsi14 = calculateRSI(points, 14);
  const macdResult = calculateMACD(points, 12, 26, 9);
  const bollinger = calculateBollingerBands(points, 20, 2);
  const atr14 = calculateATR(points, 14);

  return points.map((point, index) => ({
    ...point,
    ema20: ema20[index],
    ema50: ema50[index],
    ema200: ema200[index],
    rsi14: rsi14[index],
    macd: macdResult.macd[index],
    macdSignal: macdResult.signal[index],
    macdHistogram: macdResult.histogram[index],
    bbUpper: bollinger.upper[index],
    bbMiddle: bollinger.middle[index],
    bbLower: bollinger.lower[index],
    atr14: atr14[index],
  }));
}

export function movingAverageVolume(points: HistoricalPoint[], period = 20): Array<number | undefined> {
  const volumes = points.map((point) => (typeof point.volume === 'number' ? point.volume : NaN));
  const result: Array<number | undefined> = [];

  for (let i = 0; i < volumes.length; i++) {
    if (i + 1 < period) {
      result.push(undefined);
      continue;
    }
    const window = volumes.slice(i + 1 - period, i + 1).filter((value) => Number.isFinite(value));
    if (window.length < period) {
      result.push(undefined);
      continue;
    }
    const sum = window.reduce((acc, value) => acc + value, 0);
    result.push(sum / period);
  }

  return result;
}

export function detectBullishCandlestick(points: HistoricalPoint[]): 'hammer' | 'engulfing' | null {
  if (points.length < 2) {
    return null;
  }

  const last = points[points.length - 1];
  const prev = points[points.length - 2];

  if (!last || !prev) {
    return null;
  }

  const open = last.open ?? last.close;
  const close = last.close;
  const high = last.high ?? Math.max(open, close);
  const low = last.low ?? Math.min(open, close);

  const prevOpen = prev.open ?? prev.close;
  const prevClose = prev.close;

  const body = Math.abs(close - open);
  const candleRange = high - low;
  const lowerShadow = Math.min(open, close) - low;
  const upperShadow = high - Math.max(open, close);

  if (candleRange === 0) {
    return null;
  }

  const isHammer = lowerShadow > body * 2 && upperShadow < body && close > open;
  if (isHammer) {
    return 'hammer';
  }

  const isBullishEngulfing = close > open && prevClose < prevOpen && close >= prevOpen && open <= prevClose;
  if (isBullishEngulfing) {
    return 'engulfing';
  }

  return null;
}

export function calculatePeriodExtremes(points: HistoricalPoint[]): { high?: number; low?: number } {
  if (!points.length) {
    return {};
  }

  let high: number | undefined;
  let low: number | undefined;

  for (const point of points) {
    const valueHigh = safeHigh(point);
    const valueLow = safeLow(point);
    if (valueHigh !== undefined) {
      high = high === undefined ? valueHigh : Math.max(high, valueHigh);
    }
    if (valueLow !== undefined) {
      low = low === undefined ? valueLow : Math.min(low, valueLow);
    }
  }

  return { high, low };
}
