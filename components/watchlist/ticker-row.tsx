'use client';

import { useMemo, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sparkline } from '@/components/charts/sparkline';
import { TickerActions, TickerIdentity, type TickerCardProps } from './ticker-card';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { getWatchlistDisplayData, watchlistTrendColor, watchlistTrendTone } from '@/lib/watchlist-display';
import { cn } from '@/lib/utils';

export const WATCHLIST_ROW_COLUMNS = 'minmax(110px,1.4fr) minmax(72px,.8fr) minmax(58px,.65fr) minmax(64px,.7fr) 76px';
export interface TickerRowProps extends TickerCardProps { selected: boolean; onSelect: () => void }

export function TickerRow(props: TickerRowProps) {
  const { ticker, locale, selected, onSelect, loading, error, currency = 'USD' } = props;
  const { historical, quote, basePrice, baseDate, currentPrice } = props;
  const data = useMemo(() => getWatchlistDisplayData({ historical, quote, basePrice, baseDate, currentPrice }), [historical, quote, basePrice, baseDate, currentPrice]);
  const he = locale === 'he';
  const percent = (value: number | null) => value !== null ? `${value > 0 ? '+' : ''}${formatPercent(value, locale)}` : '—';
  return <div className={cn('relative flex min-w-0 items-center gap-0.5 border-b border-slate-100 transition-colors', selected ? 'rounded-lg border-transparent bg-blue-50/90' : 'hover:bg-slate-50', props.className)} dir={he ? 'rtl' : 'ltr'}>
    {selected ? <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-blue-600" /> : null}
    <button type="button" id={`watchlist-select-${ticker.id ?? ticker.symbol}`} aria-label={he ? `הצגת גרף ${ticker.symbol}` : `View ${ticker.symbol} chart`} aria-pressed={selected} onClick={onSelect} style={{ '--watchlist-columns': WATCHLIST_ROW_COLUMNS } as CSSProperties} className="grid min-h-[84px] min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg px-3 py-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:min-h-[76px] sm:grid-cols-[var(--watchlist-columns)] sm:gap-x-2">
      <span className="col-start-1 row-start-1 min-w-0 sm:col-auto sm:row-auto"><TickerIdentity ticker={ticker} compact />{loading ? <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-normal text-slate-500"><RefreshCw aria-hidden="true" className="h-2.5 w-2.5 animate-spin" />{he ? 'מעדכן…' : 'Updating…'}</span> : null}{error ? <span className="mt-1 block truncate text-[10px] font-normal text-amber-700">{he ? 'לא עודכן · מוצגים נתונים אחרונים' : 'Update failed · last available data'}</span> : null}</span>
      <span className="col-start-2 row-start-1 text-end text-sm font-semibold tabular-nums text-slate-950 sm:col-auto sm:row-auto"><bdi>{data.currentPrice !== null ? formatCurrency(data.currentPrice, currency, locale) : '—'}</bdi></span>
      <span className={cn('col-start-1 row-start-2 text-start text-xs font-medium tabular-nums sm:col-auto sm:row-auto sm:text-end sm:text-sm', watchlistTrendTone(data.dailyPercent))}><span className="me-1 text-[10px] font-normal text-slate-500 sm:hidden">{he ? 'יומי' : 'Daily'}</span><bdi>{percent(data.dailyPercent)}</bdi></span>
      <span className={cn('col-start-2 row-start-2 text-end text-xs font-medium tabular-nums sm:col-auto sm:row-auto sm:text-sm', watchlistTrendTone(data.periodPercent))}><span className="me-1 text-[10px] font-normal text-slate-500 sm:hidden">{he ? 'בטווח' : 'Period'}</span><bdi>{percent(data.periodPercent)}</bdi></span>
      <span className="hidden w-[76px] sm:block" aria-hidden="true" dir="ltr">{data.history.length > 1 ? <Sparkline points={data.history} width={76} height={30} color={watchlistTrendColor(data.periodPercent)} interactive={false} /> : <span className="text-[10px] font-normal text-slate-400">{he ? 'אין גרף' : 'No chart'}</span>}</span>
    </button>
    <TickerActions {...props} />
  </div>;
}
