import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

export const PERFORMANCE_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'] as const;
export type PerformanceRange = typeof PERFORMANCE_RANGES[number];
export function parsePerformanceRange(params: URLSearchParams): PerformanceRange {
  const value = params.get('chartRange');
  return PERFORMANCE_RANGES.includes(value as PerformanceRange) ? value as PerformanceRange : '3M';
}
/** Both UI surfaces use realized + unrealized P/L before estimated tax. */
export function getPerformanceTotals(summary: PortfolioSummary, currency: 'USD' | 'ILS') {
  const actual = currency === 'ILS' ? summary.totalCurrentPnLIls : summary.totalCurrentPnLUsd;
  const target = currency === 'ILS' ? summary.totalProjectedPnLIls : summary.totalProjectedPnLUsd;
  const value = currency === 'ILS' ? summary.totalValue * summary.usdToIlsRate : summary.totalValue;
  return { actual, target, gap: actual - target, value };
}
export function getPerformanceSeries(data: PortfolioTimelinePoint[], range: PerformanceRange, currency: 'USD' | 'ILS') {
  const sorted = data.filter((p) => Number.isFinite(p.timestamp)).slice().sort((a, b) => a.timestamp - b.timestamp);
  const end = sorted.at(-1)?.timestamp;
  if (end === undefined) return [];
  const start = new Date(end);
  if (range === 'YTD') start.setMonth(0, 1);
  else if (range === '1Y') start.setFullYear(start.getFullYear() - 1);
  else if (range !== 'All') start.setMonth(start.getMonth() - Number.parseInt(range, 10));
  start.setHours(0, 0, 0, 0);
  return sorted.filter((p) => range === 'All' || p.timestamp >= start.getTime()).map((p) => ({
    timestamp: p.timestamp,
    actual: finiteOrNull(currency === 'ILS' ? p.totalPnLIls : p.totalPnLUsd),
    target: finiteOrNull(currency === 'ILS' ? p.expectedNetPnLIls : p.expectedNetPnLUsd),
  }));
}
function finiteOrNull(value: number) { return Number.isFinite(value) ? value : null; }

export type PerformancePoint = { timestamp: number; actual: number | null; target: number | null };
const TREND_COLORS = { loss: '#dc2626', under: '#2563eb', above: '#059669', unknown: '#64748b' };
export function getPerformanceColor(actual: number, target: number | null) {
  if (actual <= 0) return TREND_COLORS.loss;
  if (target === null) return TREND_COLORS.unknown;
  return actual < target ? TREND_COLORS.under : TREND_COLORS.above;
}

/** Exact zero/target crossings for the linearly interpolated chart, including within one day. */
export function getPerformanceColorStops(points: PerformancePoint[]) {
  const first = points[0]?.timestamp;
  const last = points.at(-1)?.timestamp;
  if (first === undefined || last === undefined || first === last) return [];
  const stops: { offset: number; color: string }[] = [];
  const add = (timestamp: number, color: string) => stops.push({ offset: (timestamp - first) / (last - first) * 100, color });
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    if (a.actual === null || b.actual === null || b.timestamp <= a.timestamp) continue;
    const startActual = a.actual;
    const endActual = b.actual;
    const cuts = [0, 1];
    const addCrossing = (start: number, end: number) => {
      if (start !== end) { const t = -start / (end - start); if (t > 0 && t < 1) cuts.push(t); }
    };
    addCrossing(startActual, endActual);
    if (a.target !== null && b.target !== null) addCrossing(startActual - a.target, endActual - b.target);
    cuts.sort((left, right) => left - right);
    for (let part = 1; part < cuts.length; part++) {
      const from = cuts[part - 1];
      const to = cuts[part];
      if (to === from) continue;
      const mid = (from + to) / 2;
      const target = a.target !== null && b.target !== null ? a.target + (b.target - a.target) * mid : null;
      const color = getPerformanceColor(startActual + (endActual - startActual) * mid, target);
      add(a.timestamp + (b.timestamp - a.timestamp) * from, color);
      add(a.timestamp + (b.timestamp - a.timestamp) * to, color);
    }
  }
  return stops;
}
