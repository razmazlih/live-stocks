'use client';

import { ChevronDown, Info, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sparkline, type SparklineEvent } from '@/components/charts/sparkline';
import { Skeleton } from '@/components/ui/skeleton';
import { STOCK_DETAIL_TIME_RANGES } from '@/lib/display/time-ranges';
import type { HoldingChartReference } from '@/lib/holding-chart-history';
import type { StockHoldingCycle } from '@/lib/stock-holding-cycles';
import type { HistoricalPoint, Locale, TimeRange } from '@/types';
import styles from './stock-detail-chart.module.css';

export interface StockDetailChartProps {
  chartData: HistoricalPoint[];
  historicalLoading: boolean;
  historicalError: boolean;
  displayedRange: TimeRange | null;
  range: TimeRange;
  locale: Locale;
  timeRangeLabels: Record<TimeRange, string>;
  onRangeChange(range: TimeRange): void;
  onRetry(): void;
  scope: 'current' | 'all';
  onScopeChange(scope: 'current' | 'all'): void;
  holdingCycles: StockHoldingCycle[];
  holdingReferences?: HoldingChartReference[];
  events: SparklineEvent[];
  entryTimestamp?: number;
  annualGrowthRate: number;
  yearsHeld: number;
  marketOnly?: boolean;
  baseline?: number;
  projectedPrice?: number;
  requiredExitPrice?: number;
  priceFormatter(value: number): string;
}

export function StockDetailChart({
  chartData, historicalLoading, historicalError, displayedRange, range, locale,
  timeRangeLabels, onRangeChange, onRetry, scope, onScopeChange, holdingCycles,
  holdingReferences, events, entryTimestamp, annualGrowthRate, yearsHeld,
  marketOnly = false, baseline, projectedPrice, requiredExitPrice, priceFormatter,
}: StockDetailChartProps) {
  const he = locale === 'he';
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotHeight, setPlotHeight] = useState(220);
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => {
      const height = plot.getBoundingClientRect().height;
      if (height > 0) setPlotHeight(height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, [chartData.length]);
  const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const first = chartData[0];
  const last = chartData.at(-1);
  const start = first ? Math.min(first.timestamp, ...events.map(event => event.timestamp)) : undefined;
  const end = last ? Math.max(last.timestamp, ...events.map(event => event.timestamp)) : undefined;
  const references = [
    { label: he ? 'עלות ממוצעת' : 'Average cost', value: baseline, tone: styles.cost },
    { label: he ? 'יעד נוכחי' : 'Current target', value: projectedPrice, tone: styles.target },
    ...(requiredExitPrice === undefined ? [] : [{ label: he ? 'יציאה · כל הסבבים' : 'Exit · all cycles', value: requiredExitPrice, tone: styles.exit }]),
  ];

  return <section className={styles.panel} aria-label={marketOnly ? (he ? 'גרף מחיר' : 'Price chart') : he ? 'גרף מחיר ויעדי המניה' : 'Stock price and targets'} aria-busy={historicalLoading}>
    <div className={styles.heading}>
      <div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-slate-900">{marketOnly ? (he ? 'היסטוריית מחירים' : 'Price history') : he ? 'המחיר בדרך ליעד' : 'Price on the way to your target'}</h2><span className={styles.unit}>USD</span></div>
      {holdingCycles.length > 1 ? <div className={styles.scope} role="group" aria-label={he ? 'תצוגת סבבי החזקה' : 'Holding cycle view'}>
        {(['all', 'current'] as const).map(option => <button key={option} type="button" aria-pressed={scope === option} onClick={() => onScopeChange(option)}>
          {option === 'all' ? he ? 'כל הסבבים' : 'All cycles' : he ? 'ההחזקה הנוכחית' : 'Current holding'}
        </button>)}
      </div> : null}
    </div>

    {!marketOnly && <div className={styles.references} data-count={references.length}>
      {references.map(reference => <div key={reference.label} className={reference.tone}>
        <span className={styles.referenceLabel}><i aria-hidden="true" />{reference.label}</span>
        <bdi className={styles.referenceValue}>{typeof reference.value === 'number' && Number.isFinite(reference.value) ? priceFormatter(reference.value) : '—'}</bdi>
      </div>)}
    </div>}

    <div className={styles.ranges} role="group" aria-label={he ? 'טווח הגרף' : 'Chart range'}>
      {STOCK_DETAIL_TIME_RANGES.map(option => <button key={option} type="button" aria-pressed={range === option} disabled={historicalLoading && range === option} onClick={() => onRangeChange(option)}>{timeRangeLabels[option]}</button>)}
    </div>

    {((historicalLoading && chartData.length > 0) || historicalError) ? <div role="status" className={styles.status}>
      {chartData.length > 0 && displayedRange ? <span>{he ? `מוצגים נתוני ${timeRangeLabels[displayedRange]}. ` : `Showing ${timeRangeLabels[displayedRange]} data. `}</span> : null}
      {historicalLoading ? <span>{he ? 'מעדכן את הגרף…' : 'Updating chart…'}</span> : <><span>{he ? 'הגרף לא התעדכן.' : 'Chart could not be updated.'}</span><button type="button" onClick={onRetry}><RotateCcw aria-hidden="true" className="h-3 w-3" />{he ? 'נסה שוב' : 'Try again'}</button></>}
    </div> : null}

    {historicalLoading && chartData.length === 0 ? <Skeleton className={styles.plot} /> : chartData.length < 2 ? <div className={`${styles.plot} ${styles.empty}`}>
      <p>{chartData.length === 1 ? he ? 'עדיין אין מספיק מחירי סגירה בטווח הזה. בחר טווח ארוך יותר.' : 'Not enough closing prices in this range yet. Choose a longer range.' : he ? 'אין נתוני מחיר זמינים בטווח הזה' : 'No price history available in this range'}</p>
    </div> : <div ref={plotRef} className={styles.plot} dir="ltr">
      <Sparkline
        points={chartData} height={plotHeight} color="var(--color-emerald-500)"
        baseline={baseline} baselineColor="rgba(var(--color-slate-400-rgb), 0.55)"
        projectedPrice={projectedPrice} requiredExitPrice={requiredExitPrice}
        projectedLineColor="rgba(var(--color-primary-500-rgb), 0.85)"
        requiredExitLabel={he ? 'מחיר יציאה נדרש' : 'Required exit price'}
        belowEntryColor="var(--color-rose-500)" betweenProjectedColor="var(--color-primary-500)" aboveProjectedColor="var(--color-emerald-500)"
        activeFromTimestamp={entryTimestamp} inactiveBeforeColor="var(--color-slate-400)"
        annualGrowthRate={annualGrowthRate} yearsHeld={yearsHeld}
        events={events} includeEventsInDomain holdingPeriods={holdingCycles} holdingReferences={holdingReferences}
        className="h-full w-full" showYAxis yAxisWidth={72} priceFormatter={priceFormatter} timeFormatter={date} interactive
      />
    </div>}
    {start !== undefined && end !== undefined ? <div className={styles.dates} dir="ltr"><span>{date(start)}</span><span>{date(end)}</span></div> : null}

    {holdingCycles.length > 1 ? <ol className={styles.cycles} aria-label={he ? 'ציר סבבי ההחזקה' : 'Holding cycle timeline'}>
      {holdingCycles.map((cycle, index) => <li key={cycle.id} data-current={cycle.current}>
        <i aria-hidden="true" /><span className="font-medium">{he ? `סבב ${index + 1}` : `Cycle ${index + 1}`}</span><span>{cycle.current ? he ? 'פעיל' : 'Active' : he ? 'נסגר' : 'Closed'}</span><span className={styles.cycleDates}>{date(cycle.start)}{cycle.end === null ? he ? ' — היום' : ' — today' : ` — ${date(cycle.end)}`}</span>
      </li>)}
    </ol> : null}

    {!marketOnly && <details className={styles.key}>
      <summary><span className="inline-flex items-center gap-1.5"><Info aria-hidden="true" className="h-3.5 w-3.5" />{he ? 'מקרא הגרף' : 'Chart key'}</span><ChevronDown aria-hidden="true" className="h-3.5 w-3.5" /></summary>
      <div className={styles.keyBody}>
        <p>{he ? 'הקו: אדום מתחת לעלות, כחול מתחת ליעד, ירוק ביעד ומעלה, אפור ללא החזקה. נקודה ירוקה: קנייה; אדומה: מכירה. הפס התחתון מסמן סבבי החזקה.' : 'Line: red below cost, blue below target, green at or above target, gray outside holdings. Green dot: buy; red: sell. Bottom rail: holding cycles.'}</p>
        <p>{he ? 'היעד הסגול כולל את תוצאות כל המכירות הקודמות; הכחול מתייחס להחזקה הנוכחית. מחירי סגירה ועסקאות בפועל בלבד. היעד אישי ואינו תחזית שוק.' : 'The purple target includes all prior sale results; blue covers the current holding. Actual closing prices and recorded trades only. Your personal target is not a market forecast.'}</p>
      </div>
    </details>}
  </section>;
}
