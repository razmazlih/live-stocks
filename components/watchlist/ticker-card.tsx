'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pencil, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/charts/sparkline';
import { formatCurrency, formatPercent, formatDate } from '@/lib/calculations';
import { cn } from '@/lib/utils';
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

  const activePrice = hoveredPoint?.price ?? derivedCurrentPrice ?? null;

  const priceText = useMemo(() => {
    if (typeof activePrice === 'number' && Number.isFinite(activePrice)) {
      return formatCurrency(activePrice, currency, locale);
    }

    return '--';
  }, [activePrice, currency, locale]);

  const basePriceText = useMemo(() => {
    if (typeof derivedBasePrice === 'number' && Number.isFinite(derivedBasePrice)) {
      return formatCurrency(derivedBasePrice, currency, locale);
    }

    return '--';
  }, [derivedBasePrice, currency, locale]);

  const baseDateText = useMemo(() => {
    if (!derivedBaseDate) {
      return null;
    }

    return formatDate(derivedBaseDate, locale);
  }, [derivedBaseDate, locale]);

  const changeAbsolute = useMemo(() => {
    if (
      typeof derivedBasePrice === 'number' &&
      Number.isFinite(derivedBasePrice) &&
      typeof derivedCurrentPrice === 'number' &&
      Number.isFinite(derivedCurrentPrice)
    ) {
      return derivedCurrentPrice - derivedBasePrice;
    }

    return null;
  }, [derivedBasePrice, derivedCurrentPrice]);

  const changePercent = useMemo(() => {
    if (
      changeAbsolute === null ||
      typeof derivedBasePrice !== 'number' ||
      !Number.isFinite(derivedBasePrice) ||
      derivedBasePrice === 0
    ) {
      return null;
    }

    return (changeAbsolute / derivedBasePrice) * 100;
  }, [changeAbsolute, derivedBasePrice]);

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

    return parts.length ? parts.join(' · ') : '--';
  }, [changeAbsolute, changePercent, currency, locale]);

  const changeTone = useMemo(
    () => resolveTone(changeAbsolute ?? changePercent),
    [changeAbsolute, changePercent]
  );

  const trendColor = useMemo(() => {
    if (!historical || historical.length < 2) {
      return '#2563EB';
    }

    const first = historical[0]?.close ?? 0;
    const last = historical[historical.length - 1]?.close ?? 0;
    if (last > first) {
      return '#047857';
    }
    if (last < first) {
      return '#b91c1c';
    }
    return '#2563EB';
  }, [historical]);

  const accentGradient = useMemo(() => {
    const base = trendColor ?? '#2563EB';
    return `linear-gradient(90deg, ${base} 0%, ${base}CC 45%, ${base}66 100%)`;
  }, [trendColor]);

  const hoverMeta = hoveredPoint ? `${hoverLabel} ${formatTooltipTimestamp(hoveredPoint.timestamp)}` : null;
  const activePriceLabel = hoverMeta ?? priceLabel;
  const priceLabelClassName = cn(
    'text-[0.65rem] font-semibold text-slate-500',
    hoverMeta ? null : 'uppercase tracking-wide'
  );

  const showSparkline = Array.isArray(historical) && historical.length > 1;

  const priceFormatter = useCallback(
    (value: number) => formatCurrency(value, currency, locale),
    [currency, locale]
  );

  const timeFormatter = useCallback(
    (timestamp: number) => formatTooltipTimestamp(timestamp),
    [formatTooltipTimestamp]
  );

  useEffect(() => {
    if (!showSparkline) {
      setHoveredPoint(null);
    }
  }, [showSparkline]);

  return (
    <Card
      className={cn(
        'relative flex h-full flex-col overflow-hidden border border-slate-200/70 bg-white/95 shadow-sm ring-1 ring-slate-200/60 transition-shadow hover:-translate-y-0.5 hover:shadow-lg',
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1" aria-hidden style={{ background: accentGradient }} />
      <div className="relative flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-slate-900">
                {ticker.symbol.toUpperCase()}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">
                {range}
              </span>
            </div>
            {ticker.display ? (
              <p className="text-xs text-slate-500">{ticker.display}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {onRefresh ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onRefresh(ticker)}
                disabled={loading}
              >
                <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : undefined)} />
                <span className="sr-only">{refreshLabel}</span>
              </Button>
            ) : null}
            {onEdit ? (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(ticker)}>
                <Pencil className="h-4 w-4" />
                <span className="sr-only">{editLabel}</span>
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-rose-500 hover:text-rose-600"
                onClick={() => onDelete(ticker)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{deleteLabel}</span>
              </Button>
            ) : null}
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:col-span-2">
            <p className={priceLabelClassName}>{activePriceLabel}</p>
            <p className="mt-1 break-words text-[clamp(1.15rem,1.2vw+0.95rem,1.7rem)] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">
              {priceText}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-100 bg-white/90 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{changeLabel}</p>
            <p className={cn('mt-1 break-words text-[clamp(0.95rem,1.05vw+0.8rem,1.35rem)] font-semibold leading-tight tabular-nums', changeTone)}>
              {changeText}
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-100 bg-white/90 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{basePriceLabel}</p>
            <p className="mt-1 break-words text-[clamp(0.95rem,1.1vw+0.8rem,1.25rem)] font-semibold leading-snug text-slate-800 tabular-nums">
              {basePriceText}
            </p>
            {baseDateText ? (
              <p className="mt-1 text-[0.68rem] text-slate-400">
                {startDateLabel ? `${startDateLabel} ${baseDateText}` : baseDateText}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100/80 bg-slate-50/70 p-3">
          {loading ? (
            <div className="flex h-36 items-center justify-center text-xs text-slate-500">{loadingLabel}</div>
          ) : error ? (
            <div className="flex h-36 items-center justify-center text-center text-xs text-rose-500">
              {error || errorLabel}
            </div>
          ) : showSparkline ? (
            <div className="h-36">
              <Sparkline
                points={historical ?? []}
                color={trendColor}
                className="h-full w-full"
                showYAxis
                height={144}
                yAxisWidth={48}
                interactive
                onHoverPoint={setHoveredPoint}
                priceFormatter={priceFormatter}
                timeFormatter={timeFormatter}
              />
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center text-center text-xs text-slate-500">
              {emptySeriesLabel}
            </div>
          )}
        </div>

        {ticker.note ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[0.8rem] text-slate-600">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{noteLabel}</p>
            <p className="mt-1 whitespace-pre-line">{ticker.note}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
