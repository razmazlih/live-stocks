'use client';

import { useMemo } from 'react';
import { Sparkline, type SparklineEvent } from '@/components/charts/sparkline';
import { useApp } from '@/lib/context';
import type { HistoricalPoint, PositionMetrics } from '@/types';

export function StockMiniChart({ metric, points, compact = false, targetPrice }: { metric: PositionMetrics; points: HistoricalPoint[]; compact?: boolean; targetPrice?: number | null }) {
  const { locale } = useApp();
  const he = locale === 'he';
  const history = useMemo(() => Array.from(new Map(points
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close >= 0)
    .map((point) => [point.timestamp, point])).values()).sort((left, right) => left.timestamp - right.timestamp), [points]);
  const events = useMemo(() => {
    if (history.length < 2) return [];
    const position = metric.position;
    const lots = position.lots ?? [];
    const recordedEvents: SparklineEvent[] = lots.flatMap((lot, index) => {
      const timestamp = new Date(lot.executedAt).getTime();
      if ((lot.type !== 'BUY' && lot.type !== 'SELL') || !Number.isFinite(timestamp) || !Number.isFinite(lot.price) || lot.price <= 0 || !Number.isFinite(lot.quantity) || lot.quantity <= 0) return [];
      return [{ id: lot.id ?? `${position.symbol}-${lot.type}-${index}`, timestamp, type: lot.type, price: lot.price, quantity: lot.quantity, typeLabel: lot.type === 'BUY' ? he ? 'כניסה' : 'Entry' : he ? 'יציאה' : 'Exit' }];
    });
    // A legacy position can have a recorded entry without any transaction lots.
    const entryTimestamp = new Date(position.entryDate).getTime();
    if (!lots.length && Number.isFinite(entryTimestamp) && Number.isFinite(position.entryPrice) && position.entryPrice > 0 && Number.isFinite(position.quantity) && position.quantity > 0) {
      recordedEvents.push({ id: `${position.symbol}-recorded-entry`, timestamp: entryTimestamp, type: 'BUY', price: position.entryPrice, quantity: position.quantity, typeLabel: he ? 'כניסה' : 'Entry' });
    }
    return recordedEvents.sort((left, right) => left.timestamp - right.timestamp);
  }, [history, metric.position, he]);
  const buyCount = events.filter((event) => event.type === 'BUY').length;
  const sellCount = events.length - buyCount;
  const className = compact ? 'w-32 shrink-0' : 'w-full';
  if (history.length < 2) return <span className={`${className} inline-flex min-h-11 items-center text-xs text-slate-400`}>{he ? 'אין נתוני גרף' : 'No chart data'}</span>;
  const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const start = date(Math.min(history[0].timestamp, ...events.map((event) => event.timestamp)));
  const end = date(Math.max(history[history.length - 1].timestamp, ...events.map((event) => event.timestamp)));
  const baseline = Number.isFinite(metric.position.entryPrice) ? metric.position.entryPrice : undefined;
  const target = targetPrice === null ? undefined : Number.isFinite(targetPrice ?? metric.projectedPrice) ? targetPrice ?? metric.projectedPrice : undefined;
  return <div role="img" aria-label={he ? `גרף מחיר ${metric.position.symbol}, מ־${start} עד ${end}; ${buyCount} כניסות, ${sellCount} יציאות` : `${metric.position.symbol} price chart, ${start} to ${end}; ${buyCount} entries, ${sellCount} exits`} className={className} dir="ltr">
    <div ref={(element) => { element?.setAttribute('inert', ''); }} aria-hidden="true" className="pointer-events-none">
    <Sparkline includeEventsInDomain events={events} points={history} width={compact ? 128 : 320} height={compact ? 44 : 60} interactive={false} baseline={baseline} projectedPrice={target} baselineColor="#cbd5e1" projectedLineColor="#94a3b8" belowEntryColor="#dc2626" betweenProjectedColor="#2563eb" aboveProjectedColor="#059669" />
    </div>
  </div>;
}
