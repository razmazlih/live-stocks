'use client';

import { useId, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, MoreVertical, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';
import { formatCurrency, formatDate, formatPercent } from '@/lib/calculations';
import { getWatchlistDisplayData, watchlistTrendColor, watchlistTrendTone } from '@/lib/watchlist-display';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { HistoricalPoint, Locale, StockQuote, TimeRange, WatchlistTicker } from '@/types';

export interface TickerCardProps {
  ticker: WatchlistTicker;
  quote?: StockQuote | null;
  historical?: HistoricalPoint[] | null;
  range: TimeRange;
  returnTo?: string;
  lastUpdated?: number | null;
  locale: Locale;
  currency?: 'USD' | 'ILS';
  loading?: boolean;
  error?: string | null;
  onEdit?: (ticker: WatchlistTicker) => void;
  onDelete?: (ticker: WatchlistTicker) => void;
  onRefresh?: (ticker: WatchlistTicker) => void;
  className?: string;
  priceLabel?: string;
  changeLabel?: string;
  noteLabel?: string;
  emptySeriesLabel?: string;
  errorLabel?: string;
  loadingLabel?: string;
  refreshLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  basePrice?: number | null;
  baseDate?: Date | null;
  currentPrice?: number | null;
  basePriceLabel?: string;
  hoverLabel?: string;
  startDateLabel?: string;
}

export function TickerIdentity({ ticker, compact = false }: { ticker: WatchlistTicker; compact?: boolean }) {
  return <span className="flex min-w-0 items-center gap-2.5 text-start">
    <Avatar aria-hidden="true" className={cn('shrink-0 rounded-xl bg-slate-100', compact ? 'h-9 w-9' : 'h-11 w-11')}>
      {ticker.imageUrl ? <AvatarImage src={ticker.imageUrl} alt="" className="object-contain p-1.5" /> : null}
      <AvatarFallback className="rounded-xl bg-slate-100 text-xs font-semibold text-slate-600">{ticker.symbol.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
    <span className="min-w-0"><span className={cn('block truncate font-semibold tracking-tight text-slate-950', compact ? 'text-base' : 'text-xl sm:text-2xl')}><bdi>{ticker.symbol.toUpperCase()}</bdi></span>{ticker.display ? <span className="mt-0.5 block truncate text-xs font-normal text-slate-500 sm:text-sm">{ticker.display}</span> : null}</span>
  </span>;
}

export function TickerActions({ ticker, locale, loading, onEdit, onRefresh, onDelete, refreshLabel, editLabel, deleteLabel }: TickerCardProps) {
  if (!onEdit && !onDelete && !onRefresh) return null;
  const he = locale === 'he';
  return <DropdownMenu dir={he ? 'rtl' : 'ltr'}>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-lg text-slate-500" aria-label={he ? `פעולות ${ticker.symbol}` : `${ticker.symbol} actions`}><MoreVertical aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-44 rounded-xl border-slate-200 bg-white p-1 text-sm">
      {onRefresh ? <DropdownMenuItem className="min-h-11" disabled={loading} onSelect={() => onRefresh(ticker)}><RefreshCw aria-hidden="true" />{refreshLabel ?? (he ? 'רענון מניה' : 'Refresh ticker')}</DropdownMenuItem> : null}
      {onEdit ? <DropdownMenuItem className="min-h-11" onSelect={() => onEdit(ticker)}><Pencil aria-hidden="true" />{editLabel ?? (he ? 'עריכת מניה' : 'Edit ticker')}</DropdownMenuItem> : null}
      {onDelete ? <DropdownMenuItem className="min-h-11 text-rose-600 focus:text-rose-700" onSelect={() => onDelete(ticker)}><Trash2 aria-hidden="true" />{deleteLabel ?? (he ? 'מחיקת מניה' : 'Delete ticker')}</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function TickerCard(props: TickerCardProps) {
  const { ticker, quote, range, returnTo = '/watchlist', lastUpdated, locale, currency = 'USD', loading = false, error, className, onEdit } = props;
  const he = locale === 'he';
  const rangeLabel = he ? ({ '1D': 'יום', '1W': 'שבוע', '1M': 'חודש', '3M': '3 חודשים', '6M': '6 חודשים', YTD: 'השנה', '1Y': 'שנה', All: 'הכל' } as const)[range] : range;
  const { historical, basePrice, baseDate, currentPrice } = props;
  const data = useMemo(() => getWatchlistDisplayData({ historical, quote, basePrice, baseDate, currentPrice }), [historical, quote, basePrice, baseDate, currentPrice]);
  const gradientId = `watchlist-focus-${useId().replace(/:/g, '')}`;
  const color = watchlistTrendColor(data.periodPercent);
  const money = (value: number | null) => value !== null ? formatCurrency(value, currency, locale) : '—';
  const percent = (value: number | null) => value !== null ? `${value > 0 ? '+' : ''}${formatPercent(value, locale)}` : '—';
  const seriesAvailable = data.history.length > 1;
  const formatAxisDate = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' });
  const validUpdated = typeof lastUpdated === 'number' && Number.isFinite(new Date(lastUpdated).getTime()) ? new Date(lastUpdated) : null;

  return <section aria-label={he ? `גרף ומידע ${ticker.symbol}` : `${ticker.symbol} chart and details`} className={cn('min-w-0 bg-white p-5 sm:p-6', className)} dir={he ? 'rtl' : 'ltr'}>
    <header className="flex items-start justify-between gap-3">
      <TickerIdentity ticker={ticker} />
      <Link id={`watchlist-link-${ticker.id ?? ticker.symbol}`} href={buildStockHref(ticker.symbol, returnTo)} onClick={() => rememberReturnContext(`watchlist-select-${ticker.id ?? ticker.symbol}`)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 sm:text-sm">{he ? 'לפרטי המניה' : 'Stock details'}<ArrowLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" /></Link>
    </header>

    <div className="mt-6 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
      <div><p className="sr-only">{props.priceLabel ?? (he ? 'מחיר' : 'Price')}</p><p className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl"><bdi>{money(data.currentPrice)}</bdi></p><p className="mt-2 text-xs text-slate-500">{currency} · {he ? 'היום' : 'Today'} <bdi className={cn('ms-1 font-semibold', watchlistTrendTone(data.dailyPercent))}>{percent(data.dailyPercent)}</bdi></p></div>
      <div className="text-end"><p className="text-xs text-slate-500">{props.changeLabel ?? (he ? 'שינוי בטווח' : 'Period change')} · <bdi>{rangeLabel}</bdi></p><p className={cn('mt-1 text-lg font-semibold tabular-nums', watchlistTrendTone(data.periodPercent))}><bdi>{percent(data.periodPercent)}</bdi></p><p className={cn('text-xs tabular-nums', watchlistTrendTone(data.periodAbsolute))}><bdi>{data.periodAbsolute !== null ? `${data.periodAbsolute > 0 ? '+' : ''}${money(data.periodAbsolute)}` : '—'}</bdi></p></div>
    </div>

    <div className="mt-5 min-h-[280px]">
      {loading ? <p role="status" className="mb-2 text-xs text-slate-500">{seriesAvailable ? he ? 'מעדכן… מוצגים הנתונים האחרונים עד לסיום.' : 'Updating… Showing the last available data until ready.' : props.loadingLabel ?? (he ? 'טוען…' : 'Loading…')}</p> : null}
      {error ? <p role="alert" className="mb-2 text-xs text-amber-700">{error || props.errorLabel}{seriesAvailable ? he ? ' מוצגים הנתונים האחרונים.' : ' Showing the last available data.' : ''}</p> : null}
      {seriesAvailable ? <div className="h-[260px] w-full" dir="ltr" role="img" aria-label={he ? `מחיר ${ticker.symbol} מ־${formatDate(new Date(data.history[0].timestamp), locale)} עד ${formatDate(new Date(data.history[data.history.length - 1].timestamp), locale)}` : `${ticker.symbol} prices from ${formatDate(new Date(data.history[0].timestamp), locale)} to ${formatDate(new Date(data.history[data.history.length - 1].timestamp), locale)}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data.history} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.18} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} axisLine={false} tickLine={false} minTickGap={36} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={formatAxisDate} />
            <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} width={62} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value: number) => new Intl.NumberFormat(he ? 'he-IL' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)} />
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div dir={he ? 'rtl' : 'ltr'} className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-md"><p className="text-slate-500">{props.hoverLabel ?? (he ? 'מחיר בתאריך' : 'Price on')} {formatDate(new Date(Number(label)), locale)}</p><p className="mt-1 font-semibold text-slate-900"><bdi>{money(typeof payload[0].value === 'number' ? payload[0].value : null)}</bdi></p></div> : null} />
            <Area dataKey="close" type="linear" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div> : !loading && !error ? <p className="flex h-[260px] items-center justify-center text-center text-sm text-slate-500">{props.emptySeriesLabel ?? (he ? 'אין נתונים לטווח שנבחר.' : 'No data available for this range.')}</p> : null}
    </div>

    <div className="grid grid-cols-2 gap-5 border-t border-slate-200 py-4 text-sm">
      <div><p className="text-xs text-slate-500">{props.basePriceLabel ?? (he ? 'מחיר בתחילת התקופה' : 'Starting price')}</p><p className="mt-1 font-semibold tabular-nums text-slate-900"><bdi>{money(data.basePrice)}</bdi></p>{data.baseDate ? <p className="mt-1 text-[11px] text-slate-400">{props.startDateLabel ? `${props.startDateLabel} ` : ''}{formatDate(data.baseDate, locale)}</p> : null}</div>
      <div className="text-end"><p className="text-xs text-slate-500">{he ? 'עודכן' : 'Updated'}</p><p className="mt-1 font-medium tabular-nums text-slate-900"><bdi>{validUpdated ? validUpdated.toLocaleTimeString(he ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</bdi></p></div>
    </div>

    <div className="border-t border-slate-200 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{props.noteLabel ?? (he ? 'הערה' : 'Notes')}</p>{onEdit ? <Button variant="ghost" size="icon" className="h-11 w-11 text-slate-500" onClick={() => onEdit(ticker)} aria-label={he ? `עריכת הערה ${ticker.symbol}` : `Edit ${ticker.symbol} note`}><Pencil aria-hidden="true" className="h-4 w-4" /></Button> : null}</div><p className="break-words whitespace-pre-line text-sm leading-relaxed text-slate-700">{ticker.note || (he ? 'אין הערה למניה.' : 'No note for this ticker.')}</p></div>
    <div className="flex justify-end border-t border-slate-100 pt-2"><TickerActions {...props} /></div>
  </section>;
}
