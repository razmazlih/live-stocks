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

  const trendSummary = useMemo(() => {
    if (!historical || historical.length < 2) {
      return { color: '#2563EB', state: 'flat' as const };
    }

    const first = historical[0]?.close ?? 0;
    const last = historical[historical.length - 1]?.close ?? first;

    if (last > first) {
      return { color: '#047857', state: 'up' as const };
    }

    if (last < first) {
      return { color: '#b91c1c', state: 'down' as const };
    }

    return { color: '#2563EB', state: 'flat' as const };
  }, [historical]);

  const trendColor = trendSummary.color;
  const trendState = trendSummary.state;

  const accentGradientClass = useMemo(() => {
    switch (trendState) {
      case 'up':
        return 'from-emerald-300 via-emerald-500 to-emerald-600';
      case 'down':
        return 'from-rose-300 via-rose-500 to-rose-600';
      default:
        return 'from-sky-300 via-blue-500 to-indigo-500';
    }
  }, [trendState]);

  const tone = useMemo(() => {
    switch (trendState) {
      case 'up':
        return {
          ring: 'ring-emerald-200/70',
          border: 'border-emerald-200/70',
          priceTile: 'border-emerald-100/80 bg-emerald-50/70',
          changeTile: 'border-emerald-100/80 bg-emerald-50/60',
          sparkline: 'border-emerald-100/70 bg-emerald-50/55',
          badge: 'bg-emerald-100/90 text-emerald-700',
          axis: {
            label: 'rgba(4, 120, 87, 0.82)',
            background: 'linear-gradient(180deg, rgba(240, 253, 244, 0.9) 0%, rgba(217, 249, 233, 0.4) 100%)',
            border: 'rgba(52, 211, 153, 0.45)',
          },
        } as const;
      case 'down':
        return {
          ring: 'ring-rose-200/70',
          border: 'border-rose-200/70',
          priceTile: 'border-rose-100/80 bg-rose-50/60',
          changeTile: 'border-rose-100/80 bg-rose-50/55',
          sparkline: 'border-rose-100/70 bg-rose-50/50',
          badge: 'bg-rose-100/90 text-rose-700',
          axis: {
            label: 'rgba(190, 18, 60, 0.82)',
            background: 'linear-gradient(180deg, rgba(254, 242, 242, 0.9) 0%, rgba(254, 226, 226, 0.38) 100%)',
            border: 'rgba(248, 113, 113, 0.4)',
          },
        } as const;
      default:
        return {
          ring: 'ring-slate-200/70',
          border: 'border-slate-200/70',
          priceTile: 'border-slate-100 bg-slate-50/70',
          changeTile: 'border-slate-100 bg-white/90',
          sparkline: 'border-slate-100/80 bg-slate-50/60',
          badge: 'bg-indigo-100/90 text-indigo-700',
          axis: {
            label: 'rgba(30, 64, 175, 0.82)',
            background: 'linear-gradient(180deg, rgba(239, 246, 255, 0.9) 0%, rgba(219, 234, 254, 0.4) 100%)',
            border: 'rgba(147, 197, 253, 0.45)',
          },
        } as const;
    }
  }, [trendState]);

  const axisTheme = tone.axis;

  const priceSizeClass = useMemo(() => {
    if (!priceText || priceText === '--') {
      return 'text-2xl sm:text-3xl';
    }

    const length = priceText.replace(/\s/g, '').length;

    if (length >= 16) {
      return 'text-lg sm:text-xl';
    }

    if (length >= 12) {
      return 'text-xl sm:text-2xl';
    }

    return 'text-2xl sm:text-3xl';
  }, [priceText]);

  const changeSizeClass = useMemo(() => {
    if (!changeText || changeText === '--') {
      return 'text-lg';
    }

    const length = changeText.replace(/\s/g, '').length;

    if (length >= 18) {
      return 'text-sm sm:text-base';
    }

    if (length >= 12) {
      return 'text-base';
    }

    return 'text-lg';
  }, [changeText]);

  const hoverMeta = hoveredPoint ? `${hoverLabel} ${formatTooltipTimestamp(hoveredPoint.timestamp)}` : null;

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
        'relative flex h-full flex-col overflow-hidden border bg-white/95 shadow-sm ring-1 transition-shadow hover:shadow-xl',
        className,
        tone.border,
        tone.ring
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80', accentGradientClass)} />
      <div className="relative flex flex-1 flex-col gap-6 p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">{ticker.symbol.toUpperCase()}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-white/40 backdrop-blur-sm',
                  tone.badge
                )}
              >
                {range}
              </span>
            </div>
            {ticker.display ? (
              <p className="text-sm text-slate-500">{ticker.display}</p>
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

        <div className="grid auto-rows-fr gap-3 sm:grid-cols-3">
          <div className={cn('rounded-2xl border p-4 shadow-sm backdrop-blur-sm min-w-0', tone.priceTile)}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{priceLabel}</p>
            <p
              className={cn(
                'mt-2 font-semibold tracking-tight text-slate-900 tabular-nums',
                priceSizeClass
              )}
            >
              {priceText}
            </p>
            {hoverMeta ? <p className="mt-1 text-xs text-slate-500/80">{hoverMeta}</p> : null}
          </div>
          <div className={cn('rounded-2xl border p-4 shadow-sm backdrop-blur-sm min-w-0', tone.changeTile)}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{changeLabel}</p>
            <p className={cn('mt-2 font-semibold tabular-nums tracking-tight', changeSizeClass, changeTone)}>
              {changeText}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{basePriceLabel}</p>
            <p className="mt-2 text-lg font-semibold text-slate-800 tabular-nums">{basePriceText}</p>
            {baseDateText ? (
              <p className="mt-1 text-xs text-slate-400">
                {startDateLabel ? `${startDateLabel} ${baseDateText}` : baseDateText}
              </p>
            ) : null}
          </div>
        </div>

        <div className={cn('rounded-3xl border p-4 shadow-sm backdrop-blur-sm', tone.sparkline)}>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">{loadingLabel}</div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center text-center text-sm text-rose-500">
              {error || errorLabel}
            </div>
          ) : showSparkline ? (
            <div className="h-48">
              <Sparkline
                points={historical ?? []}
                color={trendColor}
                className="h-full w-full"
                showYAxis
                axisLabelColor={axisTheme.label}
                axisBackground={axisTheme.background}
                axisBorderColor={axisTheme.border}
                axisGap={14}
                interactive
                onHoverPoint={setHoveredPoint}
                priceFormatter={priceFormatter}
                timeFormatter={timeFormatter}
              />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-center text-sm text-slate-500">
              {emptySeriesLabel}
            </div>
          )}
        </div>

        {ticker.note ? (
          <div className="rounded-2xl border border-slate-100/80 bg-white/90 p-4 text-sm text-slate-600 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{noteLabel}</p>
            <p className="mt-2 whitespace-pre-line">{ticker.note}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
