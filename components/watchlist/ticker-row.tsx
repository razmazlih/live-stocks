'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';

import { useMemo, type CSSProperties } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline } from '@/components/charts/sparkline';
import { TickerActions, TickerIdentity, type TickerCardProps } from './ticker-card';
import { getWatchlistDisplayData, watchlistTrendColor, watchlistTrendTone } from '@/lib/watchlist-display';
import { cn } from '@/lib/utils';

export const WATCHLIST_ROW_COLUMNS = 'minmax(110px,1.4fr) minmax(72px,.8fr) minmax(58px,.65fr) minmax(64px,.7fr) 76px';
export interface TickerRowProps extends TickerCardProps { selected: boolean; onSelect: () => void }

export function TickerRow(props: TickerRowProps) {
  const { ticker, locale, selected, onSelect, loading, error, currency = 'USD' } = props;
  const { historical, quote, basePrice, baseDate, currentPrice } = props;
  const data = useMemo(() => getWatchlistDisplayData({ historical, quote, basePrice, baseDate, currentPrice }), [historical, quote, basePrice, baseDate, currentPrice]);
  const he = locale === 'he';
  const numberSkeleton = <span aria-hidden="true" className="inline-block h-3 w-10 animate-pulse rounded bg-primary/10 motion-reduce:animate-none" />;
  return <div className={cn('relative flex min-w-0 items-center gap-0.5 border-b border-slate-100 transition-colors', selected ? 'rounded-lg border-transparent bg-blue-50/90' : 'hover:bg-slate-50', props.className)} dir={he ? 'rtl' : 'ltr'}>
    {selected ? <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-blue-600" /> : null}
    <button type="button" id={`watchlist-select-${ticker.id ?? ticker.symbol}`} aria-label={he ? `הצגת גרף ${ticker.symbol}` : `View ${ticker.symbol} chart`} aria-pressed={selected} onClick={onSelect} style={{ '--watchlist-columns': WATCHLIST_ROW_COLUMNS } as CSSProperties} className="grid min-h-[84px] min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg px-3 py-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:min-h-[76px] sm:grid-cols-[var(--watchlist-columns)] sm:gap-x-2">
      <span className="col-start-1 row-start-1 min-w-0 sm:col-auto sm:row-auto"><TickerIdentity ticker={ticker} compact />{error || props.stale ? <span className="mt-1 block truncate text-[10px] font-normal text-amber-700">{error ? (he ? 'לא עודכן · מוצגים נתונים אחרונים' : 'Update failed · last available data') : (he ? 'מחיר אחרון זמין' : 'Last available price')}</span> : null}</span>
      <span className="col-start-2 row-start-1 text-end text-sm font-semibold tabular-nums text-slate-950 sm:col-auto sm:row-auto">{data.currentPrice === null && loading ? numberSkeleton : <AnimatedNumber value={data.currentPrice} locale={locale} currency={currency} identity={ticker.symbol} />}</span>
      <span className={cn('col-start-1 row-start-2 text-start text-xs font-medium tabular-nums sm:col-auto sm:row-auto sm:text-end sm:text-sm', watchlistTrendTone(data.dailyPercent))}><span className="me-1 text-[10px] font-normal text-slate-500 sm:hidden">{props.extended ? (he ? 'מהסגירה' : 'Since close') : (he ? 'יומי' : 'Daily')}</span>{data.dailyPercent === null && loading ? numberSkeleton : <AnimatedNumber value={data.dailyPercent} locale={locale} kind="percent" signed identity={ticker.symbol} />}</span>
      <span className={cn('col-start-2 row-start-2 text-end text-xs font-medium tabular-nums sm:col-auto sm:row-auto sm:text-sm', watchlistTrendTone(data.periodPercent))}><span className="me-1 text-[10px] font-normal text-slate-500 sm:hidden">{he ? 'בטווח' : 'Period'}</span>{data.periodPercent === null && loading ? numberSkeleton : <AnimatedNumber value={data.periodPercent} locale={locale} kind="percent" signed identity={ticker.symbol + props.range} />}</span>
      <span className="hidden w-[76px] sm:block" aria-hidden="true" dir="ltr">{data.history.length > 1 ? <Sparkline points={data.history} width={76} height={30} color={watchlistTrendColor(data.periodPercent)} interactive={false} /> : loading ? <Skeleton className="h-5 w-full" /> : <span className="text-[10px] font-normal text-slate-400">{he ? 'אין גרף' : 'No chart'}</span>}</span>
    </button>
    <TickerActions {...props} />
  </div>;
}
