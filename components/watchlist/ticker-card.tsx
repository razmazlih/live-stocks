'use client';

import { useCallback, useMemo, useState } from 'react';
import { Activity, LineChart, MessageSquareText, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/charts/sparkline';
import { formatCurrency, formatPercent, formatDate } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { HistoricalPoint, Locale, StockQuote, TimeRange, WatchlistTicker } from '@/types';

interface TickerCardProps {
  ticker: WatchlistTicker;
  quote?: StockQuote | null;
  historical?: HistoricalPoint[] | null;
  range: TimeRange;
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

function resolveTone(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value === 0) {
    return 'text-slate-500';
  }
  return value > 0 ? 'text-emerald-600' : 'text-rose-600';
}

export function TickerCard({
  ticker,
  quote,
  historical,
  range,
  locale,
  currency = 'USD',
  loading = false,
  error,
  onEdit,
  onDelete,
  onRefresh,
  className,
  priceLabel = 'Price',
  changeLabel = 'Change',
  noteLabel = 'Notes',
  emptySeriesLabel = 'No data available for this range.',
  errorLabel = 'Failed to load data.',
  loadingLabel = 'Loading…',
  refreshLabel = 'Refresh',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  basePrice,
  baseDate,
  currentPrice,
  basePriceLabel = 'Starting price',
  hoverLabel = 'Price on',
  startDateLabel = 'Start date',
}: TickerCardProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ price: number; timestamp: number } | null>(null);
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 112 : 144;

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';

  const tooltipFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [localeCode]
  );

  const formatTooltipTimestamp = useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return tooltipFormatter.format(date);
    },
    [tooltipFormatter]
  );

  const derivedBasePrice = useMemo(() => {
    if (typeof basePrice === 'number' && Number.isFinite(basePrice)) {
      return basePrice;
    }

    const firstPoint = Array.isArray(historical)
      ? historical.find((point) => typeof point?.close === 'number' && Number.isFinite(point.close))
      : null;

    return typeof firstPoint?.close === 'number' ? firstPoint.close : null;
  }, [basePrice, historical]);

  const derivedBaseDate = useMemo(() => {
    if (baseDate instanceof Date && !Number.isNaN(baseDate.getTime())) {
      return baseDate;
    }

    const firstPoint = Array.isArray(historical)
      ? historical.find((point) => Number.isFinite(point?.timestamp))
      : null;

    if (firstPoint?.timestamp) {
      const date = new Date(firstPoint.timestamp);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  }, [baseDate, historical]);

  const derivedCurrentPrice = useMemo(() => {
    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice)) {
      return currentPrice;
    }

    if (quote && typeof quote.c === 'number' && Number.isFinite(quote.c)) {
      return quote.c;
    }

    const lastPoint =
      Array.isArray(historical) && historical.length > 0 ? historical[historical.length - 1] : null;

    return typeof lastPoint?.close === 'number' && Number.isFinite(lastPoint.close)
      ? lastPoint.close
      : null;
  }, [currentPrice, quote, historical]);

  const showSparkline = Array.isArray(historical) && historical.length > 1;

  const effectiveHoveredPoint = showSparkline ? hoveredPoint : null;

  const effectiveBasePrice = useMemo(() => {
    if (
      effectiveHoveredPoint &&
      typeof effectiveHoveredPoint.price === 'number' &&
      Number.isFinite(effectiveHoveredPoint.price)
    ) {
      return effectiveHoveredPoint.price;
    }

    return derivedBasePrice;
  }, [effectiveHoveredPoint, derivedBasePrice]);

  const effectiveBaseDate = useMemo(() => {
    if (effectiveHoveredPoint && typeof effectiveHoveredPoint.timestamp === 'number') {
      const date = new Date(effectiveHoveredPoint.timestamp);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return derivedBaseDate;
  }, [effectiveHoveredPoint, derivedBaseDate]);

  const activePrice = derivedCurrentPrice ?? null;

  const priceText = useMemo(() => {
    if (typeof activePrice === 'number' && Number.isFinite(activePrice)) {
      return formatCurrency(activePrice, currency, locale);
    }

    return '--';
  }, [activePrice, currency, locale]);

  const basePriceText = useMemo(() => {
    if (typeof effectiveBasePrice === 'number' && Number.isFinite(effectiveBasePrice)) {
      return formatCurrency(effectiveBasePrice, currency, locale);
    }

    return '--';
  }, [effectiveBasePrice, currency, locale]);

  const baseDateText = useMemo(() => {
    if (!effectiveBaseDate) {
      return null;
    }

    return formatDate(effectiveBaseDate, locale);
  }, [effectiveBaseDate, locale]);

  const changeAbsolute = useMemo(() => {
    if (
      typeof effectiveBasePrice === 'number' &&
      Number.isFinite(effectiveBasePrice) &&
      typeof derivedCurrentPrice === 'number' &&
      Number.isFinite(derivedCurrentPrice)
    ) {
      return derivedCurrentPrice - effectiveBasePrice;
    }

    return null;
  }, [effectiveBasePrice, derivedCurrentPrice]);

  const changePercent = useMemo(() => {
    if (
      changeAbsolute === null ||
      typeof effectiveBasePrice !== 'number' ||
      !Number.isFinite(effectiveBasePrice) ||
      effectiveBasePrice === 0
    ) {
      return null;
    }

    return (changeAbsolute / effectiveBasePrice) * 100;
  }, [changeAbsolute, effectiveBasePrice]);

  const changeText = useMemo(() => {
    const parts: string[] = [];

    if (changeAbsolute !== null && Number.isFinite(changeAbsolute)) {
      const formatted = formatCurrency(changeAbsolute, currency, locale);
      parts.push(changeAbsolute > 0 ? `+${formatted}` : formatted);
    }

    if (changePercent !== null && Number.isFinite(changePercent)) {
      const formattedPercent = formatPercent(changePercent, locale);
      parts.push(changePercent > 0 ? `+${formattedPercent}` : formattedPercent);
    }

    return parts.length ? parts.join('\n') : '--';
  }, [changeAbsolute, changePercent, currency, locale]);

  const changeTone = useMemo(
    () => resolveTone(changeAbsolute ?? changePercent),
    [changeAbsolute, changePercent]
  );

  const trendColor = useMemo(() => {
    if (!historical || historical.length < 2) {
      return 'var(--color-primary-500)';
    }

    const first = historical[0]?.close ?? 0;
    const last = historical[historical.length - 1]?.close ?? 0;
    if (last > first) {
      return 'var(--color-green-600)';
    }
    if (last < first) {
      return 'var(--color-red-600)';
    }
    return 'var(--color-primary-500)';
  }, [historical]);

  const hoverMeta =
    effectiveHoveredPoint && typeof effectiveHoveredPoint.timestamp === 'number'
      ? `${hoverLabel} ${formatTooltipTimestamp(effectiveHoveredPoint.timestamp)}`
      : null;
  const statusStripeClassName = loading
    ? 'bg-amber-500'
    : error
      ? 'bg-rose-500'
      : showSparkline
        ? 'bg-emerald-500'
        : 'bg-slate-300';
  const chartSurfaceClassName = loading
    ? 'border-amber-200 bg-amber-50/80'
    : error
      ? 'border-rose-200 bg-rose-50/80'
      : showSparkline
        ? 'border-emerald-100 bg-[color:var(--color-slate-50)]/80'
        : 'border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80';
  const hasActions = Boolean(onRefresh || onEdit || onDelete);
  const priceLabelClassName = 'text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500';
  const basePriceLabelText = hoverMeta ?? basePriceLabel;
  const basePriceLabelClassName = cn(
    'text-[0.65rem] font-semibold text-slate-500',
    hoverMeta ? null : 'uppercase tracking-wide'
  );
  const changeSurfaceClassName =
    changeAbsolute === null || !Number.isFinite(changeAbsolute)
      ? 'border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]'
      : changeAbsolute > 0
        ? 'border-emerald-100 bg-emerald-50/60'
        : changeAbsolute < 0
          ? 'border-rose-100 bg-rose-50/60'
          : 'border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]';
  const changeBadgeClassName =
    changeAbsolute === null || !Number.isFinite(changeAbsolute)
      ? 'border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] text-slate-500'
      : changeAbsolute > 0
        ? 'border-emerald-100 bg-white text-emerald-700'
        : changeAbsolute < 0
          ? 'border-rose-100 bg-white text-rose-700'
          : 'border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] text-slate-500';
  const baseSurfaceClassName = hoverMeta
    ? 'border-blue-100 bg-blue-50/55'
    : 'border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]';
  const chartLabel = loading
    ? loadingLabel
    : error
      ? errorLabel
      : hoverMeta ?? (baseDateText ? `${startDateLabel} ${baseDateText}` : basePriceLabel);
  const chartBadgeClassName = loading
    ? 'border-amber-200 bg-white text-amber-700'
    : error
      ? 'border-rose-200 bg-white text-rose-700'
      : showSparkline
        ? 'border-emerald-100 bg-white text-emerald-700'
        : 'border-[color:var(--color-slate-200)] bg-white text-slate-500';

  const priceFormatter = useCallback(
    (value: number) => formatCurrency(value, currency, locale),
    [currency, locale]
  );

  const timeFormatter = useCallback(
    (timestamp: number) => formatTooltipTimestamp(timestamp),
    [formatTooltipTimestamp]
  );

  return (
    <Card
      className={cn(
        'relative flex h-full min-w-0 flex-col overflow-hidden border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] shadow-[0_18px_38px_-28px_rgba(15,23,42,0.58)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_44px_-28px_rgba(15,23,42,0.62)] focus-within:-translate-y-0.5 focus-within:shadow-[0_24px_44px_-28px_rgba(15,23,42,0.62)]',
        className
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1.5', statusStripeClassName)} aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.72),transparent_70%)]"
        aria-hidden
      />
      <div className="relative flex flex-1 min-w-0 flex-col gap-3.5 p-3.5 sm:gap-5 sm:p-5">
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[1.08rem] font-semibold tracking-tight text-slate-900 sm:text-[1.12rem]">
                  {ticker.symbol.toUpperCase()}
                </span>
                <span className="rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]/88 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-sm">
                  {range}
                </span>
                {ticker.note ? (
                  <span
                    title={noteLabel}
                    aria-label={noteLabel}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-100 bg-blue-50/80 text-blue-700 shadow-sm"
                  >
                    <MessageSquareText className="h-3 w-3" />
                  </span>
                ) : null}
              </div>
              {ticker.display ? (
                <p className="text-sm leading-5 text-slate-600">{ticker.display}</p>
              ) : null}
              {(hoverMeta || baseDateText) ? (
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/85 bg-[color:var(--color-neutral-white)]/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
                  <Activity className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <span className="min-w-0 break-words">
                    {hoverMeta ?? (startDateLabel ? `${startDateLabel} ${baseDateText}` : baseDateText)}
                  </span>
                </div>
              ) : null}
            </div>
            {hasActions ? (
              <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 rounded-[1.25rem] border border-[color:var(--color-slate-200)]/90 bg-[color:var(--color-neutral-white)]/88 p-1 shadow-[0_14px_28px_-22px_rgba(15,23,42,0.62)] backdrop-blur-sm">
                {onRefresh ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 rounded-[0.95rem] text-slate-500 transition-[background-color,color,transform] hover:-translate-y-0.5 hover:bg-white hover:text-slate-900"
                    onClick={() => onRefresh(ticker)}
                    disabled={loading}
                  >
                    <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : undefined)} />
                    <span className="sr-only">{refreshLabel}</span>
                  </Button>
                ) : null}
                {onEdit ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 rounded-[0.95rem] text-slate-500 transition-[background-color,color,transform] hover:-translate-y-0.5 hover:bg-white hover:text-slate-900"
                    onClick={() => onEdit(ticker)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">{editLabel}</span>
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 rounded-[0.95rem] text-slate-500 transition-[background-color,color,transform] hover:-translate-y-0.5 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => onDelete(ticker)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">{deleteLabel}</span>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <div className="grid min-w-0 gap-2.5 sm:grid-cols-2 sm:gap-3">
          <div className="min-w-0 rounded-[24px] border border-[color:var(--color-slate-200)]/90 bg-[linear-gradient(155deg,rgba(255,255,255,0.98),rgba(241,245,249,0.88),rgba(219,234,254,0.55))] p-3.5 shadow-[0_16px_32px_-24px_rgba(15,23,42,0.5)] sm:col-span-2 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={priceLabelClassName}>{priceLabel}</p>
                <p className="mt-1 break-words text-[clamp(1.35rem,1.45vw+1rem,1.95rem)] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">
                  {priceText}
                </p>
              </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border border-white/90 bg-white/82 text-blue-600 shadow-sm">
                <LineChart className="h-4.5 w-4.5" />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm', changeBadgeClassName)}>
                {changeLabel}
              </span>
              {hoverMeta ? (
                <span className="rounded-full border border-blue-100 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-blue-700 shadow-sm">
                  {hoverMeta}
                </span>
              ) : null}
            </div>
          </div>
          <div className={cn('min-w-0 rounded-[22px] border p-3 shadow-sm', changeSurfaceClassName)}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {changeLabel}
              </p>
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]', changeBadgeClassName)}>
                {range}
              </span>
            </div>
            <p
              className={cn(
                'mt-2 break-words whitespace-pre-line text-[clamp(1rem,1.12vw+0.84rem,1.4rem)] font-semibold leading-tight tabular-nums',
                changeTone
              )}
            >
              {changeText}
            </p>
          </div>
          <div className={cn('min-w-0 rounded-[22px] border p-3 shadow-sm', baseSurfaceClassName)}>
            <p className={basePriceLabelClassName}>{basePriceLabelText}</p>
            <p className="mt-2 break-words text-[clamp(0.98rem,1.1vw+0.8rem,1.28rem)] font-semibold leading-snug text-slate-800 tabular-nums">
              {basePriceText}
            </p>
            {hoverMeta ? null : baseDateText ? (
              <p className="mt-1 text-[0.68rem] leading-5 text-slate-400">
                {startDateLabel ? `${startDateLabel} ${baseDateText}` : baseDateText}
              </p>
            ) : null}
          </div>
        </div>

        <div className={cn('viz-panel viz-panel-strong overflow-hidden rounded-[24px] border', chartSurfaceClassName)}>
          <div className="flex items-start justify-between gap-3 border-b border-black/5 px-3.5 py-3 sm:px-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="viz-chip inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.9rem] border-white/90 bg-white/82 text-slate-600 shadow-sm">
                  {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LineChart className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{range}</p>
                  <p className="min-w-0 break-words text-xs leading-5 text-slate-600">{chartLabel}</p>
                </div>
              </div>
            </div>
            <span className={cn('viz-chip shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm', chartBadgeClassName)}>
              {showSparkline && !loading && !error ? changeLabel : range}
            </span>
          </div>
          <div className="p-2.5 sm:p-4">
            {loading ? (
              <div
                className="viz-panel flex items-center justify-center gap-2 rounded-[20px] bg-white/55 text-sm text-slate-500"
                style={{ height: chartHeight }}
              >
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{loadingLabel}</span>
              </div>
            ) : error ? (
              <div
                className="viz-panel flex items-center justify-center rounded-[20px] bg-white/55 px-4 text-center text-sm text-rose-600"
                style={{ height: chartHeight }}
              >
                {error || errorLabel}
              </div>
            ) : showSparkline ? (
              <div className="viz-chart-surface rounded-[20px] bg-white/45" style={{ height: chartHeight }}>
                <Sparkline
                  points={historical ?? []}
                  color={trendColor}
                  className="h-full w-full"
                  showYAxis
                  height={chartHeight}
                  yAxisWidth={48}
                  interactive
                  onHoverPoint={setHoveredPoint}
                  priceFormatter={priceFormatter}
                  timeFormatter={timeFormatter}
                />
              </div>
            ) : (
              <div
                className="viz-panel flex items-center justify-center rounded-[20px] bg-white/55 px-4 text-center text-sm text-slate-500"
                style={{ height: chartHeight }}
              >
                {emptySeriesLabel}
              </div>
            )}
          </div>
        </div>

        {ticker.note ? (
          <div className="rounded-[22px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(248,250,252,0.88),rgba(255,255,255,0.9))] p-3 text-[0.8rem] text-slate-600 shadow-sm sm:p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[0.9rem] border border-[color:var(--color-slate-200)] bg-white/82 text-slate-500 shadow-sm">
                <MessageSquareText className="h-3.5 w-3.5" />
              </span>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {noteLabel}
              </p>
            </div>
            <div className="mt-3 rounded-[18px] border border-[color:var(--color-slate-200)]/80 bg-white/82 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <p className="break-words whitespace-pre-line leading-6 text-slate-600">{ticker.note}</p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
