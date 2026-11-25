import 'server-only';
import { mapCandleDataToPoints, type calculateRealizedTaxLiability } from '@/lib/calculations';
import { buildPositionTimeline } from '@/lib/portfolio-timeline';
import { normalizeToUtcDay } from '@/lib/services/historical-fx';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { adjacentSession, tradingCalendarRange, tradingSession } from '@/lib/utils/trading-hours';
import type { HistoricalPoint, Position } from '@/types';

const DAY = 86_400_000;

interface HistoryInput {
  positions: Position[];
  annualGrowthRate: number;
  getFxRateAt: (timestamp: number) => number;
  taxTimeline: ReturnType<typeof calculateRealizedTaxLiability>['timeline'];
  today: { timestamp: number; gapUsd: number | null; gapIls: number | null };
}

function eligibleCloseDay(day: number): number {
  const date = new Date(day).toISOString().slice(0, 10);
  if (date < tradingCalendarRange.start || date > tradingCalendarRange.end || tradingSession(date)) return day;
  const previous = adjacentSession(date, -1);
  return previous ? Date.parse(previous.date) : day;
}

export async function buildWidgetTargetHistory({ positions, annualGrowthRate, getFxRateAt, taxTimeline, today }: HistoryInput) {
  const end = normalizeToUtcDay(today.timestamp);
  const start = end - 29 * DAY;
  const days = Array.from({ length: 29 }, (_, index) => start + index * DAY);
  const closeDays = days.map(eligibleCloseDay);
  const symbols = new Set(positions.filter(position =>
    (!position.activationEnd || Date.parse(position.activationEnd) >= start) &&
    Date.parse(position.entryDate) < end
  ).map(position => position.symbol));

  // The optional chart must yield to the main summary when a price provider stalls.
  const signal = AbortSignal.timeout(3500);
  const pricesBySymbol = new Map<string, HistoricalPoint[]>();
  await Promise.all([...symbols].map(async symbol => {
    const candles = await fetchYahooCandlesData(symbol, (start - 10 * DAY) / 1000, end / 1000, 'D', { signal, revalidate: 3600 })
      .then(mapCandleDataToPoints).catch(() => []);
    const closes = new Map(candles.map(candle => [normalizeToUtcDay(candle.timestamp), candle.close]));
    const points: HistoricalPoint[] = [];
    days.forEach((timestamp, index) => {
      // Explicit observations take precedence. Only a scheduled closure can reuse a previous close.
      const close = closes.get(timestamp) ?? closes.get(closeDays[index]);
      if (isFiniteNumber(close)) points.push({ timestamp, close });
    });
    pricesBySymbol.set(symbol, points);
  }));

  const totals = new Map<number, { gapUsd: number; gapIls: number }>();
  for (const position of positions) {
    const timeline = buildPositionTimeline(position, pricesBySymbol.get(position.symbol) ?? [],
      annualGrowthRate, [], getFxRateAt, end - 1, { start, requireDailyClose: true });
    for (const point of timeline) {
      const sum = totals.get(point.timestamp) ?? { gapUsd: 0, gapIls: 0 };
      sum.gapUsd += point.netPnLUsd - point.expectedNetPnLUsd;
      sum.gapIls += point.netPnLIls - point.expectedNetPnLIls;
      totals.set(point.timestamp, sum);
    }
  }
  const history = [];
  let taxIndex = 0;
  let taxUsd = 0;
  let taxIls = 0;
  for (const day of days) {
    const timestamp = day + DAY - 1;
    const total = totals.get(timestamp);
    if (!total) continue; // The account had no activity yet.
    while (taxIndex < taxTimeline.length && taxTimeline[taxIndex].timestamp <= timestamp) {
      taxUsd = taxTimeline[taxIndex].cumulativeTaxUsd;
      taxIls = taxTimeline[taxIndex].cumulativeTaxIls;
      taxIndex += 1;
    }
    const usd = total.gapUsd - taxUsd;
    const ils = total.gapIls - taxIls;
    history.push({ timestamp, gapUsd: isFiniteNumber(usd) ? toFixedNumber(usd) : null,
      gapIls: isFiniteNumber(ils) ? toFixedNumber(ils) : null });
  }
  return [...history, today];
}
