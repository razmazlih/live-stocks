'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pencil, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/charts/sparkline';
import { formatCurrency, formatPercent } from '@/lib/calculations';
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
  startDateText?: string;
  startDateLabel?: string;
  hoverValueLabel?: string;
  axisLabels?: {
    high: string;
    mid: string;
    low: string;
  };
  asOfLabel?: (value: string) => string;
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
  priceLabel = 'Last price',
  changeLabel = 'Change since start',
  noteLabel = 'Notes',
  emptySeriesLabel = 'No data available for this range.',
  errorLabel = 'Failed to load data.',
  loadingLabel = 'Loading…',
  refreshLabel = 'Refresh',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  startDateText,
  startDateLabel = 'Start date',
  hoverValueLabel = 'Price at pointer',
  axisLabels,
  asOfLabel,
}: TickerCardProps) {
  const sortedHistorical = useMemo(() => {
    if (!historical || historical.length === 0) {
      return [] as HistoricalPoint[];
    }
    return [...historical].sort((a, b) => a.timestamp - b.timestamp);
  }, [historical]);

  const firstPoint = sortedHistorical[0] ?? null;
  const lastPoint = sortedHistorical[sortedHistorical.length - 1] ?? null;

  const startPrice = typeof firstPoint?.close === 'number' ? firstPoint.close : null;
  const endPrice = typeof lastPoint?.close === 'number' ? lastPoint.close : null;
  const fallbackQuote =
    quote && typeof quote.c === 'number' && Number.isFinite(quote.c) ? quote.c : null;

  const [hoveredPoint, setHoveredPoint] = useState<{ close: number; timestamp: number } | null>(null);

  useEffect(() => {
    setHoveredPoint(null);
  }, [sortedHistorical]);

  const priceText = useMemo(() => {
    if (typeof endPrice === 'number') {
      return formatCurrency(endPrice, currency, locale);
    }

    if (typeof fallbackQuote === 'number') {
      return formatCurrency(fallbackQuote, currency, locale);
    }

    return '--';
  }, [currency, endPrice, fallbackQuote, locale]);

  const changeFromStart = useMemo(() => {
    if (typeof startPrice !== 'number' || typeof endPrice !== 'number') {
      return null;
    }

    const difference = endPrice - startPrice;
    const percent = startPrice !== 0 ? (difference / startPrice) * 100 : null;

    return { difference, percent };
  }, [endPrice, startPrice]);

  const changeText = useMemo(() => {
    if (!changeFromStart) {
      return '--';
    }

    const parts: string[] = [];

    if (typeof changeFromStart.difference === 'number' && Number.isFinite(changeFromStart.difference)) {
      const formatted = formatCurrency(changeFromStart.difference, currency, locale);
      parts.push(changeFromStart.difference > 0 ? `+${formatted}` : formatted);
    }

    if (typeof changeFromStart.percent === 'number' && Number.isFinite(changeFromStart.percent)) {
      const formattedPercent = formatPercent(changeFromStart.percent, locale);
      parts.push(changeFromStart.percent > 0 ? `+${formattedPercent}` : formattedPercent);
    }

    return parts.length ? parts.join(' · ') : '--';
  }, [changeFromStart, currency, locale]);

  const changeTone = useMemo(
    () => resolveTone(changeFromStart?.difference ?? null),
    [changeFromStart?.difference]
  );

  const trendColor = useMemo(() => {
    if (!sortedHistorical || sortedHistorical.length < 2) {
      return '#2563EB';
    }

    const first = sortedHistorical[0]?.close ?? 0;
    const last = sortedHistorical[sortedHistorical.length - 1]?.close ?? 0;
    if (last > first) {
      return '#047857';
    }
    if (last < first) {
      return '#b91c1c';
    }
    return '#2563EB';
  }, [sortedHistorical]);

  const axisValues = useMemo(() => {
    if (!sortedHistorical.length) {
      return null;
    }

    const values = sortedHistorical
      .map((point) => point.close)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    if (!values.length) {
      return null;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const mid = min + (max - min) / 2;

    return { min, mid, max };
  }, [sortedHistorical]);

  const formattedAxis = useMemo(() => {
    if (!axisValues) {
      return null;
    }

    return {
      high: formatCurrency(axisValues.max, currency, locale),
      mid: formatCurrency(axisValues.mid, currency, locale),
      low: formatCurrency(axisValues.min, currency, locale),
    };
  }, [axisValues, currency, locale]);

  const axisLabelHigh = axisLabels?.high ?? 'High';
  const axisLabelMid = axisLabels?.mid ?? 'Mid';
  const axisLabelLow = axisLabels?.low ?? 'Low';

  const activePoint = useMemo(() => {
    if (hoveredPoint) {
      return hoveredPoint;
    }

    if (!lastPoint) {
      return null;
    }

    return { close: lastPoint.close, timestamp: lastPoint.timestamp };
  }, [hoveredPoint, lastPoint]);

  const hoverPriceText = useMemo(() => {
    if (!activePoint) {
      return '--';
    }
    return formatCurrency(activePoint.close, currency, locale);
  }, [activePoint, currency, locale]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale]
  );

  const activeDateText = activePoint ? dateFormatter.format(new Date(activePoint.timestamp)) : null;

  const hoverCaption = hoveredPoint
    ? hoverValueLabel
    : activeDateText
      ? asOfLabel
        ? asOfLabel(activeDateText)
        : activeDateText
      : null;

  const startDateDisplay = startDateText ?? '—';
  const showStartDate = Boolean(startDateLabel);
  const hoverCaptionText = hoverCaption ?? '—';

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_24px_40px_-24px_rgba(30,64,175,0.35)] backdrop-blur-sm transition-all hover:shadow-[0_36px_60px_-30px_rgba(30,64,175,0.45)] dark:border-slate-800/80 dark:bg-slate-900/70 dark:shadow-[0_24px_40px_-24px_rgba(15,23,42,0.65)]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 bg-gradient-to-r from-blue-50/40 via-transparent to-transparent px-6 py-4 dark:border-slate-800/80 dark:from-slate-800/30">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {ticker.symbol.toUpperCase()}
            </span>
            <span className="rounded-full bg-blue-100/70 px-2 py-0.5 text-xs font-medium text-blue-700 shadow-sm dark:bg-slate-800/80 dark:text-slate-200">
              {range}
            </span>
          </div>
          {ticker.display ? (
            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{ticker.display}</p>
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
      </div>
      <div className="flex flex-1 flex-col gap-5 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{priceLabel}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{priceText}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{changeLabel}</p>
            <p className={cn('mt-2 text-xl font-semibold', changeTone)}>{changeText}</p>
          </div>
          {showStartDate ? (
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{startDateLabel}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{startDateDisplay}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/60">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              {loadingLabel}
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-center text-sm text-rose-500 dark:text-rose-400">
              {error || errorLabel}
            </div>
          ) : sortedHistorical.length > 1 ? (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
                <div className="relative h-40 flex-1 md:h-48">
                  <Sparkline
                    points={sortedHistorical}
                    color={trendColor}
                    className="h-full w-full"
                    interactive
                    onHoverPoint={setHoveredPoint}
                    hoverFormatter={(point) => formatCurrency(point.close, currency, locale)}
                  />
                </div>
                {formattedAxis ? (
                  <div className="flex w-24 flex-col justify-between rounded-xl border border-slate-200/70 bg-white/80 p-3 text-right text-[11px] text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/50">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{axisLabelHigh}</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-600 dark:text-slate-200">{formattedAxis.high}</span>
                    </div>
                    <div className="border-y border-slate-200/70 py-3 dark:border-slate-700/60">
                      <span className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{axisLabelMid}</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-600 dark:text-slate-200">{formattedAxis.mid}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{axisLabelLow}</span>
                      <span className="mt-1 block text-sm font-semibold text-slate-600 dark:text-slate-200">{formattedAxis.low}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 text-xs text-slate-500 dark:border-slate-700/60 dark:bg-slate-900/60">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-slate-600 dark:text-slate-200">{hoverCaptionText}</span>
                  {activeDateText ? (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{activeDateText}</span>
                  ) : null}
                </div>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{hoverPriceText}</span>
              </div>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
              {emptySeriesLabel}
            </div>
          )}
        </div>

        {ticker.note ? (
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-600 shadow-inner dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300">
            <span className="block font-semibold text-slate-500 dark:text-slate-300">{noteLabel}</span>
            <span className="mt-1 block whitespace-pre-line">{ticker.note}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
