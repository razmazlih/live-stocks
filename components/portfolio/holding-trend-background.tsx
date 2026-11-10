'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SparklineEvent } from '@/components/charts/sparkline';
import type { HistoricalPoint } from '@/types';
import type { HoldingChartReference } from '@/lib/holding-chart-history';

const WIDTH = 1000;
const HEIGHT = 160;
const PADDING = 8;
const DURATION = 420;
const EMPTY_EVENTS: SparklineEvent[] = [];
const COLORS = { profit: '#059669', loss: '#e11d48', neutral: '#64748b', belowTarget: '#2563eb' };
const validPrice = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

interface HoldingTrendBackgroundProps {
  points: HistoricalPoint[];
  tone?: 'profit' | 'loss' | 'neutral';
  expanded?: boolean;
  baseline?: number;
  targetPrice?: number;
  events?: SparklineEvent[];
  references?: HoldingChartReference[];
  locale?: 'he' | 'en';
}

/** One persistent price path morphs from a decorative trend to the detailed chart. */
export function HoldingTrendBackground({ points, tone = 'neutral', expanded = false, baseline, targetPrice, events = EMPTY_EVENTS, references, locale = 'he' }: HoldingTrendBackgroundProps) {
  const color = COLORS[tone];
  const gradientId = useId();
  const strokeId = `${gradientId}-stroke`;
  const areaMaskId = `${gradientId}-mask`;
  const [progress, setProgress] = useState(expanded ? 1 : 0);
  const progressRef = useRef(progress);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const target = expanded ? 1 : 0;
    const start = progressRef.current;
    if (start === target) return;
    if (reducedMotion || typeof requestAnimationFrame === 'undefined') {
      progressRef.current = target;
      return;
    }
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = Math.min(Math.max((now - started) / DURATION, 0), 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      progressRef.current = start + (target - start) * eased;
      setProgress(progressRef.current);
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [expanded, reducedMotion]);

  const data = useMemo(() => {
    const history = Array.from(new Map(points
      .filter((point) => Number.isFinite(point.timestamp) && validPrice(point.close))
      .map((point) => [point.timestamp, point])).values())
      .sort((left, right) => left.timestamp - right.timestamp);
    if (history.length < 2) return null;
    const trades = events.filter((event) => (event.type === 'BUY' || event.type === 'SELL') && Number.isFinite(event.timestamp) && validPrice(event.price) && event.quantity > 0 && Number.isFinite(event.quantity));
    let low = history[0].close;
    let high = low;
    let start = history[0].timestamp;
    let end = history[history.length - 1].timestamp;
    for (const point of history) {
      low = Math.min(low, point.close);
      high = Math.max(high, point.close);
    }
    for (const trade of trades) {
      start = Math.min(start, trade.timestamp);
      end = Math.max(end, trade.timestamp);
    }
    const referencePoints = references === undefined
      ? [history[0].timestamp, history[history.length - 1].timestamp].map((timestamp) => ({ timestamp, baseline: validPrice(baseline) ? baseline : null, target: validPrice(targetPrice) ? targetPrice : null }))
      : Array.from(new Map(references.filter((point) => Number.isFinite(point.timestamp)).map((point) => [point.timestamp, point])).values()).sort((a, b) => a.timestamp - b.timestamp);
    const referenceAt = (timestamp: number) => {
      let left = 0;
      let right = referencePoints.length - 1;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        const point = referencePoints[middle];
        if (point.timestamp === timestamp) return { baseline: validPrice(point.baseline ?? undefined) ? point.baseline : null, target: validPrice(point.target ?? undefined) ? point.target : null };
        if (point.timestamp < timestamp) left = middle + 1;
        else right = middle - 1;
      }
      const before = referencePoints[right];
      const after = referencePoints[left];
      // Unknown spans and times outside recorded reference history stay unknown.
      if (!before || !after) return { baseline: null, target: null };
      const ratio = (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
      const interpolate = (key: 'baseline' | 'target') => validPrice(before[key] ?? undefined) && validPrice(after[key] ?? undefined)
        ? before[key]! + (after[key]! - before[key]!) * ratio : null;
      return { baseline: interpolate('baseline'), target: interpolate('target') };
    };
    let expandedLow = low;
    let expandedHigh = high;
    const referencePrices = referencePoints.filter((point) => point.timestamp >= start && point.timestamp <= end).flatMap((point) => [point.baseline, point.target]);
    for (const price of [...referencePrices, ...trades.map((trade) => trade.price)]) {
      if (validPrice(price ?? undefined)) {
        expandedLow = Math.min(expandedLow, price!);
        expandedHigh = Math.max(expandedHigh, price!);
      }
    }
    const x = (timestamp: number) => PADDING + (timestamp - start) / (end - start) * (WIDTH - PADDING * 2);
    const classify = (price: number, timestamp: number) => {
      const reference = referenceAt(timestamp);
      return reference.baseline === null ? COLORS.neutral : price < reference.baseline ? COLORS.loss : reference.target === null ? COLORS.neutral : price >= reference.target ? COLORS.profit : COLORS.belowTarget;
    };
    const stops: { offset: number; color: string }[] = [];
    for (let index = 1; index < history.length; index++) {
      const left = history[index - 1];
      const right = history[index];
      const priceAt = (timestamp: number) => left.close + (right.close - left.close) * (timestamp - left.timestamp) / (right.timestamp - left.timestamp);
      const times = [left.timestamp, ...referencePoints.filter((point) => point.timestamp > left.timestamp && point.timestamp < right.timestamp).map((point) => point.timestamp), right.timestamp];
      for (let part = 1; part < times.length; part++) {
        const fromTime = times[part - 1];
        const toTime = times[part];
        const before = referenceAt(fromTime);
        const after = referenceAt(toTime);
        const middle = referenceAt((fromTime + toTime) / 2);
        const cuts = [0, 1];
        for (const key of ['baseline', 'target'] as const) {
          if (before[key] === null || after[key] === null || middle[key] === null) continue;
          const fromGap = priceAt(fromTime) - before[key]!;
          const toGap = priceAt(toTime) - after[key]!;
          if (fromGap * toGap < 0) cuts.push(fromGap / (fromGap - toGap));
        }
        cuts.sort((a, b) => a - b);
        for (let cut = 1; cut < cuts.length; cut++) {
          const from = fromTime + (toTime - fromTime) * cuts[cut - 1];
          const to = fromTime + (toTime - fromTime) * cuts[cut];
          if (to <= from) continue;
          const center = (from + to) / 2;
          const segmentColor = classify(priceAt(center), center);
          stops.push({ offset: x(from) / WIDTH, color: segmentColor }, { offset: x(to) / WIDTH, color: segmentColor });
        }
      }
    }
    return { history, trades, referencePoints, low, high, expandedLow, expandedHigh, x, stops, classify };

  }, [points, events, baseline, targetPrice, references]);

  if (!data) return null;
  const domainProgress = reducedMotion || typeof requestAnimationFrame === 'undefined' ? Number(expanded) : progress;
  const low = data.low + (data.expandedLow - data.low) * domainProgress;
  const high = data.high + (data.expandedHigh - data.high) * domainProgress;
  const y = (price: number) => high > low ? HEIGHT - 24 - (price - low) / (high - low) * (HEIGHT - 48) : HEIGHT / 2;
  const coordinates = data.history.map((point) => ({ x: data.x(point.timestamp), y: y(point.close) }));
  const line = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const area = `${line} L${last.x},${HEIGHT} L${first.x},${HEIGHT} Z`;
  const referencePath = (key: 'baseline' | 'target') => {
    let connected = false;
    return data.referencePoints.map((point) => {
      const value = point[key];
      if (!validPrice(value ?? undefined)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${data.x(point.timestamp).toFixed(2)},${y(value!).toFixed(2)}`;
    }).filter(Boolean).join(' ');
  };
  const baselinePath = referencePath('baseline');
  const targetPath = referencePath('target');
  const transition = reducedMotion ? 'none' : 'stop-color 420ms ease';
  const detailStyle = { opacity: expanded ? 1 : 0, transition: reducedMotion ? 'none' : 'opacity 420ms ease' };
  const markerStyle = { transform: 'scale(var(--chart-marker-x, 1), var(--chart-marker-y, 1))', transformOrigin: '0 0' };

  return <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full select-none" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0.012" />
      </linearGradient>
      <mask id={areaMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={WIDTH} height={HEIGHT}><rect width={WIDTH} height={HEIGHT} fill={`url(#${gradientId})`} /></mask>
      <linearGradient data-price-stroke="true" id={strokeId} x1="0" x2={WIDTH} y1="0" y2="0" gradientUnits="userSpaceOnUse">
        {data.stops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={expanded ? stop.color : color} style={{ transition }} />)}
      </linearGradient>
    </defs>
    <path data-price-area="true" d={area} fill={`url(#${strokeId})`} mask={`url(#${areaMaskId})`} />
    <g style={detailStyle}>
      {baselinePath ? <path data-reference="baseline" d={baselinePath} fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /> : null}
      {targetPath ? <path data-reference="target" d={targetPath} fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
    </g>
    <path data-price-line="true" d={line} fill="none" stroke={`url(#${strokeId})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <g data-current-price="true" transform={`translate(${last.x},${last.y})`}><circle cx="0" cy="0" r="3" style={markerStyle} fill={expanded ? data.classify(data.history[data.history.length - 1].close, data.history[data.history.length - 1].timestamp) : color} stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" /></g>
    <g style={detailStyle}>
      {data.trades.map((trade, index) => <g key={trade.id ?? index} data-event={trade.type} data-event-time={trade.timestamp} data-event-price={trade.price} style={{ pointerEvents: expanded ? 'all' : 'none' }} transform={`translate(${data.x(trade.timestamp)},${y(trade.price)})`}>
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
