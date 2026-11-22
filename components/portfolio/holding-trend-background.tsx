'use client';

import { useId, useMemo } from 'react';
import type { SparklineEvent } from '@/components/charts/sparkline';
import type { HistoricalPoint } from '@/types';
import type { HoldingChartReference } from '@/lib/holding-chart-history';

const WIDTH = 1000;
const HEIGHT = 160;
const PADDING = 8;
const EMPTY_EVENTS: SparklineEvent[] = [];
const COLORS = { profit: '#059669', loss: '#e11d48', neutral: '#64748b', belowTarget: '#2563eb' };
const validNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
const validPrice = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

interface HoldingTrendBackgroundProps {
  points: HistoricalPoint[];
  profitPoints?: { timestamp: number; actual: number | null; target: number | null }[];
  tone?: 'profit' | 'loss' | 'neutral';
  expanded?: boolean;
  baseline?: number;
  /** Price context before this actual entry stays neutral, including when collapsed. */
  activeFromTimestamp?: number;
  targetPrice?: number;
  events?: SparklineEvent[];
  references?: HoldingChartReference[];
  locale?: 'he' | 'en';
}

/** One persistent price path morphs from a decorative trend to the detailed chart. */
export function HoldingTrendBackground({ points, profitPoints, tone = 'neutral', expanded = false, baseline, activeFromTimestamp, targetPrice, events = EMPTY_EVENTS, references, locale = 'he' }: HoldingTrendBackgroundProps) {
  const color = COLORS[tone];
  const gradientId = useId();
  const strokeId = `${gradientId}-stroke`;
  const areaMaskId = `${gradientId}-mask`;
  const data = useMemo(() => {
    const profitMode = profitPoints !== undefined;
    const activeEntry = !profitMode && validNumber(activeFromTimestamp) ? activeFromTimestamp : undefined;
    const validValue = profitMode ? validNumber : (value: number | null | undefined) => validPrice(value ?? undefined);
    const history: { timestamp: number; close: number | null }[] = profitMode
      ? Array.from(new Map(profitPoints.filter((point) => Number.isFinite(point.timestamp)).map((point) => [point.timestamp, { timestamp: point.timestamp, close: validNumber(point.actual) ? point.actual : null }])).values()).sort((a, b) => a.timestamp - b.timestamp)
      : Array.from(new Map(points.filter((point) => Number.isFinite(point.timestamp) && validPrice(point.close)).map((point) => [point.timestamp, { timestamp: point.timestamp, close: point.close }])).values()).sort((a, b) => a.timestamp - b.timestamp);
    const known = history.filter((point): point is { timestamp: number; close: number } => validNumber(point.close));
    if (known.length < 2) return null;
    const actualAt = (timestamp: number) => {
      let left = 0;
      let right = history.length - 1;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        if (history[middle].timestamp === timestamp) return history[middle].close;
        if (history[middle].timestamp < timestamp) left = middle + 1;
        else right = middle - 1;
      }
      const before = history[right];
      const after = history[left];
      if (!before || !after || !validNumber(before.close) || !validNumber(after.close)) return null;
      return before.close + (after.close - before.close) * (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
    };
    const trades = events.filter((event) => (event.type === 'BUY' || event.type === 'SELL') && Number.isFinite(event.timestamp) && validPrice(event.price) && event.quantity > 0 && Number.isFinite(event.quantity))
      .map((trade) => ({ ...trade, plotValue: profitMode ? actualAt(trade.timestamp) : trade.price }))
      .filter((trade): trade is SparklineEvent & { plotValue: number } => validNumber(trade.plotValue));
    let low = known[0].close;
    let high = low;
    let start = history[0].timestamp;
    let end = history[history.length - 1].timestamp;
    for (const point of known) {
      low = Math.min(low, point.close);
      high = Math.max(high, point.close);
    }
    for (const trade of trades) {
      start = Math.min(start, trade.timestamp);
      end = Math.max(end, trade.timestamp);
    }
    const suppliedReferences = profitMode
      ? profitPoints.map((point) => ({ timestamp: point.timestamp, baseline: 0, target: validNumber(point.target) ? point.target : null }))
      : references;
    const referencePoints = suppliedReferences === undefined
      ? [history[0].timestamp, history[history.length - 1].timestamp].map((timestamp) => ({ timestamp, baseline: validPrice(baseline) ? baseline : null, target: validPrice(targetPrice) ? targetPrice : null }))
      : Array.from(new Map(suppliedReferences.filter((point) => Number.isFinite(point.timestamp)).map((point) => [point.timestamp, point])).values()).sort((a, b) => a.timestamp - b.timestamp);
    const referenceAt = (timestamp: number) => {
      let left = 0;
      let right = referencePoints.length - 1;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        const point = referencePoints[middle];
        if (point.timestamp === timestamp) return { baseline: validValue(point.baseline) ? point.baseline : null, target: validValue(point.target) ? point.target : null };
        if (point.timestamp < timestamp) left = middle + 1;
        else right = middle - 1;
      }
      const before = referencePoints[right];
      const after = referencePoints[left];
      // Unknown spans and times outside recorded reference history stay unknown.
      if (!before || !after) return { baseline: null, target: null };
      const ratio = (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
      const interpolate = (key: 'baseline' | 'target') => validValue(before[key]) && validValue(after[key])
        ? before[key]! + (after[key]! - before[key]!) * ratio : null;
      return { baseline: interpolate('baseline'), target: interpolate('target') };
    };
    let expandedLow = low;
    let expandedHigh = high;
    const referencePrices = referencePoints.filter((point) => point.timestamp >= start && point.timestamp <= end).flatMap((point) => [point.baseline, point.target]);
    for (const value of [...referencePrices, ...trades.map((trade) => trade.plotValue)]) {
      if (validValue(value)) {
        expandedLow = Math.min(expandedLow, value!);
        expandedHigh = Math.max(expandedHigh, value!);
      }
    }
    const x = (timestamp: number) => PADDING + (timestamp - start) / (end - start) * (WIDTH - PADDING * 2);
    const classify = (value: number, timestamp: number) => {
      if (activeEntry !== undefined && timestamp < activeEntry) return COLORS.neutral;
      const reference = referenceAt(timestamp);
      return reference.baseline === null ? COLORS.neutral : value < reference.baseline ? COLORS.loss : reference.target === null ? COLORS.neutral : value >= reference.target ? COLORS.profit : COLORS.belowTarget;
    };
    const stops: { offset: number; color: string }[] = [];
    for (let index = 1; index < history.length; index++) {
      const left = history[index - 1];
      const right = history[index];
      if (!validNumber(left.close) || !validNumber(right.close)) continue;
      const leftValue = left.close;
      const rightValue = right.close;
      const valueAt = (timestamp: number) => leftValue + (rightValue - leftValue) * (timestamp - left.timestamp) / (right.timestamp - left.timestamp);
      const times = [...new Set([left.timestamp, ...referencePoints.filter((point) => point.timestamp > left.timestamp && point.timestamp < right.timestamp).map((point) => point.timestamp), ...(activeEntry !== undefined && activeEntry > left.timestamp && activeEntry < right.timestamp ? [activeEntry] : []), right.timestamp])].sort((a, b) => a - b);
      for (let part = 1; part < times.length; part++) {
        const fromTime = times[part - 1];
        const toTime = times[part];
        const before = referenceAt(fromTime);
        const after = referenceAt(toTime);
        const middle = referenceAt((fromTime + toTime) / 2);
        const cuts = [0, 1];
        for (const key of ['baseline', 'target'] as const) {
          if (before[key] === null || after[key] === null || middle[key] === null) continue;
          const fromGap = valueAt(fromTime) - before[key]!;
          const toGap = valueAt(toTime) - after[key]!;
          if (fromGap * toGap < 0) cuts.push(fromGap / (fromGap - toGap));
        }
        cuts.sort((a, b) => a - b);
        for (let cut = 1; cut < cuts.length; cut++) {
          const from = fromTime + (toTime - fromTime) * cuts[cut - 1];
          const to = fromTime + (toTime - fromTime) * cuts[cut];
          if (to <= from) continue;
          const center = (from + to) / 2;
          const segmentColor = classify(valueAt(center), center);
          // A constant-color run needs only its two boundary stops, even if
          // it spans hundreds of samples.
          const previous = stops.at(-1);
          const startOffset = x(from) / WIDTH;
          const endOffset = x(to) / WIDTH;
          if (previous?.color === segmentColor && previous.offset === startOffset) {
            previous.offset = endOffset;
          } else {
            stops.push({ offset: startOffset, color: segmentColor }, { offset: endOffset, color: segmentColor });
          }
        }
      }
    }
    return { history, known, trades, referencePoints, low, high, expandedLow, expandedHigh, x, stops, classify, validValue, activeEntry };
  }, [points, profitPoints, events, baseline, activeFromTimestamp, targetPrice, references]);

  if (!data) return null;
  // The browser interpolates the SVG presentation attributes and reverses an
  // in-flight transition when the user toggles again.
  const low = expanded ? data.expandedLow : data.low;
  const high = expanded ? data.expandedHigh : data.high;
  const y = (price: number) => high > low ? HEIGHT - 24 - (price - low) / (high - low) * (HEIGHT - 48) : HEIGHT / 2;
  const segments: { x: number; y: number }[][] = [];
  let activeSegment: { x: number; y: number }[] | null = null;
  for (const point of data.history) {
    if (!validNumber(point.close)) { activeSegment = null; continue; }
    if (!activeSegment) { activeSegment = []; segments.push(activeSegment); }
    activeSegment.push({ x: data.x(point.timestamp), y: y(point.close) });
  }
  const line = segments.map((segment) => segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')).join(' ');
  const area = segments.filter((segment) => segment.length >= 2).map((segment) => {
    const line = segment.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    return `${line} L${segment[segment.length - 1].x},${HEIGHT} L${segment[0].x},${HEIGHT} Z`;
  }).join(' ');
  const latest = data.known[data.known.length - 1];
  const last = { x: data.x(latest.timestamp), y: y(latest.close) };
  const referencePath = (key: 'baseline' | 'target') => {
    let connected = false;
    return data.referencePoints.map((point) => {
      const value = point[key];
      if (!data.validValue(value)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${data.x(point.timestamp).toFixed(2)},${y(value!).toFixed(2)}`;
    }).filter(Boolean).join(' ');
  };
  const baselinePath = referencePath('baseline');
  const targetPath = referencePath('target');
  const detailStyle = { opacity: expanded ? 1 : 0 };
  const markerStyle = { transform: 'scale(var(--chart-marker-x, 1), var(--chart-marker-y, 1))', transformOrigin: '0 0' };

  return <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full select-none" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0.012" />
      </linearGradient>
      <mask id={areaMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={WIDTH} height={HEIGHT}><rect width={WIDTH} height={HEIGHT} fill={`url(#${gradientId})`} /></mask>
      <linearGradient data-price-stroke="true" id={strokeId} x1="0" x2={WIDTH} y1="0" y2="0" gradientUnits="userSpaceOnUse">
        {data.stops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={expanded || data.activeEntry !== undefined ? stop.color : color} className="motion-safe:transition-[stop-color] motion-safe:duration-300" />)}
      </linearGradient>
    </defs>
    <path className="motion-safe:transition-[d] motion-safe:duration-300" data-price-area="true" d={area} fill={`url(#${strokeId})`} mask={`url(#${areaMaskId})`} />
    <g style={detailStyle} className="motion-safe:transition-opacity motion-safe:duration-300">
      {baselinePath ? <path className="motion-safe:transition-[d] motion-safe:duration-300" data-reference="baseline" d={baselinePath} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /> : null}
      {targetPath ? <path className="motion-safe:transition-[d] motion-safe:duration-300" data-reference="target" d={targetPath} fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
    </g>
    <path className="motion-safe:transition-[d] motion-safe:duration-300" data-price-line="true" d={line} fill="none" stroke={`url(#${strokeId})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <g className="motion-safe:transition-transform motion-safe:duration-300" data-current-price="true" transform={`translate(${last.x},${last.y})`}><circle cx="0" cy="0" r="3" style={markerStyle} fill={expanded || data.activeEntry !== undefined ? data.classify(latest.close, latest.timestamp) : color} stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" /></g>
    <g style={detailStyle} className="motion-safe:transition-opacity motion-safe:duration-300">
      {data.trades.map((trade, index) => <g className="motion-safe:transition-transform motion-safe:duration-300" key={trade.id ?? index} data-event={trade.type} data-event-time={trade.timestamp} data-event-price={trade.price} style={{ pointerEvents: expanded ? 'all' : 'none' }} transform={`translate(${data.x(trade.timestamp)},${y(trade.plotValue)})`}>
        <g style={markerStyle}>
          <circle r="7" fill={trade.type === 'BUY' ? '#059669' : '#e11d48'} fillOpacity="0.12" />
          {trade.type === 'BUY'
            ? <circle r="4" fill="#fff" stroke="#059669" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            : <rect x="-3.5" y="-3.5" width="7" height="7" rx="1" transform="rotate(45)" fill="#fff" stroke="#e11d48" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
          <circle r="1.4" fill={trade.type === 'BUY' ? '#059669' : '#e11d48'} />
        </g>
        <title>{`${trade.type === 'BUY' ? (locale === 'he' ? 'קנייה' : 'Buy') : (locale === 'he' ? 'מכירה' : 'Sell')} · ${trade.quantity} × $${trade.price} · ${new Date(trade.timestamp).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`}</title>
      </g>)}
    </g>
  </svg>;
}
