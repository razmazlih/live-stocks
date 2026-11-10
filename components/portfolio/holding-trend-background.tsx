'use client';

import { useId, useMemo } from 'react';
import type { HistoricalPoint } from '@/types';

const WIDTH = 1000;
const HEIGHT = 160;
const PADDING = 8;

/** Decorative price history, with a price-only domain and real elapsed-time spacing. */
export function HoldingTrendBackground({ points, tone = 'neutral' }: { points: HistoricalPoint[]; tone?: 'profit' | 'loss' | 'neutral' }) {
  const color = tone === 'profit' ? '#059669' : tone === 'loss' ? '#e11d48' : '#64748b';
  const gradientId = useId();
  const geometry = useMemo(() => {
    const history = Array.from(new Map(points
      .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close >= 0)
      .map((point) => [point.timestamp, point])).values())
      .sort((left, right) => left.timestamp - right.timestamp);
    if (history.length < 2) return null;

    let low = history[0].close;
    let high = low;
    for (const point of history) {
      low = Math.min(low, point.close);
      high = Math.max(high, point.close);
    }
    const start = history[0].timestamp;
    const duration = history[history.length - 1].timestamp - start;
    const priceRange = high - low;
    const coordinates = history.map((point) => ({
      x: PADDING + (point.timestamp - start) / duration * (WIDTH - PADDING * 2),
      y: priceRange > 0
        ? HEIGHT - 24 - (point.close - low) / priceRange * (HEIGHT - 48)
        : HEIGHT / 2,
    }));
    const line = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    return { line, area: `${line} L${last.x},${HEIGHT} L${first.x},${HEIGHT} Z`, last };
  }, [points]);

  if (!geometry) return null;

  return <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full select-none" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.22" />
        <stop offset="100%" stopColor={color} stopOpacity="0.025" />
      </linearGradient>
    </defs>
    <path d={geometry.area} fill={`url(#${gradientId})`} />
    <path d={geometry.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <circle cx={geometry.last.x} cy={geometry.last.y} r="3" fill={color} stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
  </svg>;
}
