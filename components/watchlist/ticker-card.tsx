'use client';

import { useCallback, useMemo } from 'react';
import { RefreshCw, Pencil, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/charts/sparkline';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import type { HistoricalPoint, Locale, StockQuote, WatchlistTicker } from '@/types';

interface TickerCardProps {
  ticker: WatchlistTicker;
  quote?: StockQuote | null;
  historical?: HistoricalPoint[] | null;
  locale: Locale;
  periodLabel?: string;
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
  locale,
  periodLabel,
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
  emptySeriesLabel = 'No data available for this period.',
  errorLabel = 'Failed to load data.',
  loadingLabel = 'Loading…',
  refreshLabel = 'Refresh',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
}: TickerCardProps) {
  const sortedHistorical = useMemo(() => {
    if (!Array.isArray(historical)) {
      return [] as HistoricalPoint[];
    }

    return [...historical].sort((a, b) => a.timestamp - b.timestamp);
  }, [historical]);

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const formatPriceValue = useCallback(
    (value: number) => formatCurrency(value, currency, locale),
    [currency, locale],
  );

  const formatTimestampValue = useCallback(
    (timestamp: number) => dateTimeFormatter.format(new Date(timestamp)),
    [dateTimeFormatter],
  );

  const priceText = useMemo(() => {
    if (quote && typeof quote.c === 'number' && Number.isFinite(quote.c)) {
      return formatCurrency(quote.c, currency, locale);
    }

    if (sortedHistorical.length > 0) {
      const lastPoint = sortedHistorical[sortedHistorical.length - 1];
      if (lastPoint && typeof lastPoint.close === 'number' && Number.isFinite(lastPoint.close)) {
        return formatCurrency(lastPoint.close, currency, locale);
      }
    }

    return '--';
  }, [currency, locale, quote, sortedHistorical]);

  const changeInfo = useMemo(() => {
    const summary = {
      text: '--',
      delta: 0,
      hasValue: false,
    };

    if (sortedHistorical.length > 0) {
      let startPrice: number | null = null;
      let lastPrice: number | null = null;

      for (const point of sortedHistorical) {
        if (typeof point.close === 'number' && Number.isFinite(point.close)) {
          if (startPrice === null) {
            startPrice = point.close;
          }
          lastPrice = point.close;
        }
      }

      const latestPrice = (() => {
        if (quote && typeof quote.c === 'number' && Number.isFinite(quote.c)) {
          return quote.c;
        }
        return lastPrice;
      })();

      if (typeof startPrice === 'number' && Number.isFinite(startPrice) && typeof latestPrice === 'number' && Number.isFinite(latestPrice)) {
        const delta = latestPrice - startPrice;
        const percentChange = startPrice !== 0 ? (delta / startPrice) * 100 : null;

        const parts: string[] = [];
        const absoluteFormatted = formatCurrency(delta, currency, locale);
        parts.push(delta > 0 ? `+${absoluteFormatted}` : absoluteFormatted);

        if (percentChange !== null && Number.isFinite(percentChange)) {
          const formattedPercent = formatPercent(percentChange, locale);
          parts.push(percentChange > 0 ? `+${formattedPercent}` : formattedPercent);
        }

        return {
          text: parts.join(' · '),
          delta,
          hasValue: true,
        };
      }
    }

    if (quote) {
      const { d: absoluteChange, dp: percentChange } = quote;
      const parts: string[] = [];

      if (typeof absoluteChange === 'number' && Number.isFinite(absoluteChange)) {
        const formatted = formatCurrency(absoluteChange, currency, locale);
        parts.push(absoluteChange > 0 ? `+${formatted}` : formatted);
      }

      if (typeof percentChange === 'number' && Number.isFinite(percentChange)) {
        const formattedPercent = formatPercent(percentChange, locale);
        parts.push(percentChange > 0 ? `+${formattedPercent}` : formattedPercent);
      }

      if (parts.length) {
        return {
          text: parts.join(' · '),
          delta: typeof absoluteChange === 'number' && Number.isFinite(absoluteChange) ? absoluteChange : 0,
          hasValue: true,
        };
      }
    }

    return summary;
  }, [currency, locale, quote, sortedHistorical]);

  const changeText = changeInfo.text;
  const changeTone = useMemo(
    () => resolveTone(changeInfo.hasValue ? changeInfo.delta : 0),
    [changeInfo.delta, changeInfo.hasValue],
  );

  const trendColor = useMemo(() => {
    if (sortedHistorical.length < 2) {
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

  return (
    <Card className={cn('flex h-full flex-col border-slate-200 dark:border-slate-800', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {ticker.symbol.toUpperCase()}
            </span>
            {periodLabel ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {periodLabel}
              </span>
            ) : null}
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
      <div className="flex flex-1 flex-col gap-4 px-6 py-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{priceLabel}</p>
            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{priceText}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{changeLabel}</p>
            <p className={cn('mt-1 text-base font-semibold', changeTone)}>{changeText}</p>
          </div>
        </div>
        <div className="h-36 w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              {loadingLabel}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-rose-500 dark:text-rose-400">
              {error || errorLabel}
            </div>
          ) : sortedHistorical.length > 1 ? (
            <Sparkline
              points={sortedHistorical}
              color={trendColor}
              className="h-full w-full"
              showPriceAxis
              enableHover
              priceFormatter={formatPriceValue}
              timeFormatter={formatTimestampValue}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
              {emptySeriesLabel}
            </div>
          )}
        </div>
        {ticker.note ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
            <span className="block font-semibold text-slate-500 dark:text-slate-300">{noteLabel}</span>
            <span className="mt-1 block whitespace-pre-line">{ticker.note}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
