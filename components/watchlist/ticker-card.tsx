'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pencil, Trash2 } from 'lucide-react';

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

  const accentGradient = useMemo(() => {
    const base = trendColor ?? 'var(--color-primary-500)';
    return `linear-gradient(90deg, ${base} 0%, ${base}CC 45%, ${base}66 100%)`;
  }, [trendColor]);

  const hoverMeta =
    effectiveHoveredPoint && typeof effectiveHoveredPoint.timestamp === 'number'
      ? `${hoverLabel} ${formatTooltipTimestamp(effectiveHoveredPoint.timestamp)}`
      : null;
  const priceLabelClassName = 'text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500';
  const basePriceLabelText = hoverMeta ?? basePriceLabel;
  const basePriceLabelClassName = cn(
    'text-[0.65rem] font-semibold text-slate-500',
    hoverMeta ? null : 'uppercase tracking-wide'
  );

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
        'card-surface relative flex h-full flex-col overflow-hidden transition-transform duration-500',
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1" aria-hidden style={{ background: accentGradient }} />
      <div className="relative flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
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

        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          <div className="min-w-0 rounded-xl border border-slate-100 bg-overlay-slate-50 p-2.5 sm:col-span-2 sm:p-3">
            <p className={priceLabelClassName}>{priceLabel}</p>
            <p className="mt-1 break-words text-[clamp(1.15rem,1.2vw+0.95rem,1.7rem)] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">
              {priceText}
            </p>
          </div>
          <div className="card-surface min-w-0 rounded-xl p-2.5 sm:p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{changeLabel}</p>
            <p className={cn('mt-1 break-words whitespace-pre-line text-[clamp(0.95rem,1.05vw+0.8rem,1.35rem)] font-semibold leading-tight tabular-nums', changeTone)}>
              {changeText}
            </p>
          </div>
          <div className="card-surface min-w-0 rounded-xl p-2.5 sm:p-3">
            <p className={basePriceLabelClassName}>{basePriceLabelText}</p>
            <p className="mt-1 break-words text-[clamp(0.95rem,1.1vw+0.8rem,1.25rem)] font-semibold leading-snug text-slate-800 tabular-nums">
              {basePriceText}
            </p>
            {hoverMeta ? null : baseDateText ? (
              <p className="mt-1 text-[0.68rem] text-slate-400">
                {startDateLabel ? `${startDateLabel} ${baseDateText}` : baseDateText}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-overlay-slate-100 bg-[color:var(--color-slate-50)]/70 p-2.5 sm:p-3">
          {loading ? (
            <div className="flex items-center justify-center text-xs text-slate-500" style={{ height: chartHeight }}>
              {loadingLabel}
            </div>
          ) : error ? (
            <div
              className="flex items-center justify-center text-center text-xs text-rose-500"
              style={{ height: chartHeight }}
            >
              {error || errorLabel}
            </div>
          ) : showSparkline ? (
            <div style={{ height: chartHeight }}>
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
              className="flex items-center justify-center text-center text-xs text-slate-500"
              style={{ height: chartHeight }}
            >
              {emptySeriesLabel}
            </div>
          )}
        </div>

        {ticker.note ? (
          <div className="rounded-xl border border-slate-100 bg-[color:var(--color-slate-50)]/70 p-2.5 text-[0.8rem] text-slate-600 sm:p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{noteLabel}</p>
            <p className="mt-1 whitespace-pre-line">{ticker.note}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
