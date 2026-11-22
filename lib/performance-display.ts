import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

export function parsePerformanceView(params: Pick<URLSearchParams, 'get'>) {
  const view = params.get('view');
  return view === 'targets' || view === 'realized' ? view : 'history';
}

export const PERFORMANCE_RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'] as const;
export type PerformanceRange = typeof PERFORMANCE_RANGES[number];
export function parsePerformanceRange(params: URLSearchParams): PerformanceRange {
  const value = params.get('chartRange');
  return PERFORMANCE_RANGES.includes(value as PerformanceRange) ? value as PerformanceRange : '3M';
}
export interface PerformanceOptions {
  includeTaxes?: boolean;
  includeFees?: boolean;
}
export function parsePerformanceOptions(params: URLSearchParams): Required<PerformanceOptions> {
  return { includeTaxes: params.get('includeTaxes') !== '0', includeFees: params.get('includeFees') !== '0' };
}
/** Both surfaces default to realized + unrealized P/L after fees and estimated tax. */
export function getPerformanceTotals(summary: PortfolioSummary, currency: 'USD' | 'ILS', options: PerformanceOptions = {}) {
  const beforeTax = currency === 'ILS' ? summary.totalCurrentPnLIls : summary.totalCurrentPnLUsd;
  const afterTax = currency === 'ILS' ? summary.totalNetPnLIls : summary.totalNetPnLUsd;
  const fees = currency === 'ILS' ? summary.totalCommissionsIls : summary.totalCommissionsUsd;
  const actual = selectActual(beforeTax, afterTax, fees, options);
  const target = currency === 'ILS' ? summary.totalProjectedPnLIls : summary.totalProjectedPnLUsd;
  const value = currency === 'ILS' ? summary.totalValue * summary.usdToIlsRate : summary.totalValue;
  return { actual, target, gap: actual - target, value };
}
export function getPerformanceSeries(data: PortfolioTimelinePoint[], range: PerformanceRange, currency: 'USD' | 'ILS', options: PerformanceOptions = {}) {
  const sorted = data.filter((p) => Number.isFinite(p.timestamp)).slice().sort((a, b) => a.timestamp - b.timestamp);
  const end = sorted.at(-1)?.timestamp;
  if (end === undefined) return [];
  const start = new Date(end);
  if (range === 'YTD') start.setUTCMonth(0, 1);
  else if (range === '1Y') start.setUTCFullYear(start.getUTCFullYear() - 1);
  else if (range !== 'All') start.setUTCMonth(start.getUTCMonth() - Number.parseInt(range, 10));
  start.setUTCHours(0, 0, 0, 0);
  return sorted.filter((p) => range === 'All' || p.timestamp >= start.getTime()).map((p) => ({
    timestamp: p.timestamp,
    ...performanceBreakdown(
      currency === 'ILS' ? p.totalPnLIls : p.totalPnLUsd,
      currency === 'ILS' ? p.netPnLIls : p.netPnLUsd,
      currency === 'ILS' ? p.commissionIls : p.commissionUsd,
    ),
    actual: finiteOrNull(selectActual(
      currency === 'ILS' ? p.totalPnLIls : p.totalPnLUsd,
      currency === 'ILS' ? p.netPnLIls : p.netPnLUsd,
      currency === 'ILS' ? p.commissionIls : p.commissionUsd,
      options,
    )),
    target: finiteOrNull(currency === 'ILS' ? p.expectedNetPnLIls : p.expectedNetPnLUsd),
  }));
}
function performanceBreakdown(beforeTax: number, afterTax: number, paidFees: number | undefined) {
  const fees = paidFees ?? 0;
  return { gross: finiteOrNull(beforeTax + fees), fees: finiteOrNull(fees), tax: finiteOrNull(beforeTax - afterTax), net: finiteOrNull(afterTax) };
}
function selectActual(beforeTax: number, afterTax: number, fees: number | undefined, options: PerformanceOptions) {
  // Keep missing historical values unknown even if another basis happens to be present.
  if (!Number.isFinite(beforeTax)) return Number.NaN;
  const actual = options.includeTaxes === false ? beforeTax : afterTax;
  return actual + (options.includeFees === false ? fees ?? 0 : 0);
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
