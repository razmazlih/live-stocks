'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { ArrowLeft, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import {
  calculatePositionMetrics,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import { computeOpenLots, mapPositionRow } from '@/lib/positions';
import { cn } from '@/lib/utils';
import {
  CandleData,
  HistoricalPoint,
  Position,
  PositionLotType,
  PositionMetrics,
  StockQuote,
  TimeRange,
} from '@/types';

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];
const DAY_SECONDS = 60 * 60 * 24;
const FALLBACK_X_AXIS_DOMAIN: [number | string, number | string] = ['dataMin', 'dataMax'];
const TOOLTIP_CONTAINER_CLASS =
  'min-w-[220px] space-y-3 rounded-2xl bg-slate-900/95 p-4 text-sm text-slate-200 shadow-xl ring-1 ring-black/20 backdrop-blur';

function getDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface TradeMarkerDatum {
  id: string;
  timestamp: number;
  tradePrice: number;
  quantity: number;
  type: PositionLotType;
  isTradeMarker: true;
}

interface TradeMarkerShapeProps {
  cx?: number;
  cy?: number;
  payload?: TradeMarkerDatum;
}

function TradeMarkerShape({ cx, cy, payload }: TradeMarkerShapeProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
    return null;
  }

  const isBuy = payload.type === 'BUY';
  const fill = isBuy ? '#059669' : '#DC2626';
  const arrowPath = isBuy ? 'M -4 2 L 0 -3 L 4 2 Z' : 'M -4 -2 L 0 3 L 4 -2 Z';

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={6.5} fill="white" fillOpacity={0.92} />
      <circle r={5} fill={fill} />
      <path d={arrowPath} fill="white" />
    </g>
  );
}

type CandleResponse = CandleData & { error?: string };
type QuoteResponse = StockQuote & { error?: string };

function getRangeParams(range: TimeRange, entryDate?: string) {
  const now = Math.floor(Date.now() / 1000);
  switch (range) {
    case '1D':
      return { from: now - DAY_SECONDS, resolution: '60' };
    case '1W':
      return { from: now - 7 * DAY_SECONDS, resolution: 'D' };
    case '1M':
      return { from: now - 30 * DAY_SECONDS, resolution: 'D' };
    case '3M':
      return { from: now - 90 * DAY_SECONDS, resolution: 'D' };
    case '6M':
      return { from: now - 180 * DAY_SECONDS, resolution: 'D' };
    case 'YTD': {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      return { from: Math.floor(startOfYear), resolution: 'D' };
    }
    case '1Y':
      return { from: now - 365 * DAY_SECONDS, resolution: 'D' };
    case 'All': {
      const defaultRange = now - 5 * 365 * DAY_SECONDS;
      const entryTimestamp = entryDate ? Math.floor(new Date(entryDate).getTime() / 1000) : defaultRange;
      const earliest = Math.min(entryTimestamp, defaultRange);
      const clamped = Math.min(earliest, now - DAY_SECONDS);
      return { from: clamped, resolution: 'W' };
    }
    default:
      return { from: now - 30 * DAY_SECONDS, resolution: 'D' };
  }
}

function formatAxisLabel(timestamp: number, range: TimeRange, locale: string) {
  const date = new Date(timestamp);
  if (range === '1D') {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1W') {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  if (range === '1M' || range === '3M' || range === '6M') {
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

function formatTooltipLabel(timestamp: number, range: TimeRange, locale: string) {
  const date = new Date(timestamp);
  if (range === '1D') {
    return date.toLocaleString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function buildHoldingPeriodLabel(
  yearsHeld: number | undefined,
  t: ReturnType<typeof useTranslation>['t'],
  locale: 'he' | 'en'
) {
  if (yearsHeld === undefined || !Number.isFinite(yearsHeld) || yearsHeld <= 0) {
    return t.stock.detailView.holdingPeriod.lessThanMonth;
  }

  const months = Math.round(yearsHeld * 12);
  if (months > 0 && months < 12) {
    return t.stock.detailView.holdingPeriod.months.replace('{{count}}', months.toString());
  }

  const yearsRounded = Math.max(Math.round(yearsHeld * 10) / 10, 0.1);
  return t.stock.detailView.holdingPeriod.years.replace(
    '{{count}}',
    formatNumber(yearsRounded, locale)
  );
}

function StockDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="ml-auto h-8 w-32" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      </div>
      <Card className="bg-white/70 border border-white/50 shadow">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-slate-100 bg-white/60 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="bg-white/70 border border-white/50 shadow">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
      <Card className="bg-white/70 border border-white/50 shadow">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </div>
  );
}

interface StockDetailViewProps {
  symbol: string;
}

export function StockDetailView({ symbol }: StockDetailViewProps) {
  const normalizedSymbol = symbol.toUpperCase();
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const isRtl = locale === 'he';

  const [loading, setLoading] = useState(true);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [range, setRange] = useState<TimeRange>('1M');
  const [showVolume, setShowVolume] = useState(true);
  const [historical, setHistorical] = useState<HistoricalPoint[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const openLots = useMemo(() => (position?.lots ? computeOpenLots(position.lots) : []), [position?.lots]);
  const transactions = useMemo(() => {
    if (!position?.lots) {
      return [];
    }
    return [...position.lots].sort((a, b) => {
      const aTime = new Date(a.executedAt).getTime();
      const bTime = new Date(b.executedAt).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0;
      }
      return bTime - aTime;
    });
  }, [position?.lots]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: positionError } = await supabase
          .from('positions')
          .select('*, position_lots(*), position_plans(*)')
          .eq('symbol', normalizedSymbol)
          .maybeSingle();

        if (positionError) {
          throw positionError;
        }

        if (!data) {
          if (!cancelled) {
            setError(locale === 'he' ? 'הפוזיציה לא נמצאה' : 'Position not found');
            setPosition(null);
            setMetrics(null);
          }
          return;
        }

        const mappedPosition = mapPositionRow(data);

        if (cancelled) {
          return;
        }

        setPosition(mappedPosition);

        const trimmedToken = settings.finnhubToken?.trim();
        const quoteUrl = trimmedToken
          ? `/api/quote?symbol=${encodeURIComponent(normalizedSymbol)}&token=${encodeURIComponent(trimmedToken)}`
          : null;
        const [quoteResponse, rateResponse] = await Promise.all([
          quoteUrl ? fetch(quoteUrl) : Promise.resolve<null | Response>(null),
          fetch('/api/exchange-rate'),
        ]);

        let fetchedQuote: StockQuote | null = null;
        if (quoteResponse) {
          if (quoteResponse.ok) {
            const quoteData = (await quoteResponse.json()) as QuoteResponse;
            if (!quoteData.error && quoteData.c) {
              fetchedQuote = quoteData;
            } else if (quoteData.error) {
              console.warn('Quote API error:', quoteData.error);
            }
          } else {
            console.warn(`Quote request failed with status ${quoteResponse.status}`);
          }
        }

        let rate = 3.7;
        if (rateResponse.ok) {
          const rateData = await rateResponse.json();
          rate = rateData.usdToIls || rate;
        } else {
          console.warn(`Exchange rate request failed with status ${rateResponse.status}`);
        }

        const currentPrice = fetchedQuote?.c ?? mappedPosition.entryPrice;
        const dailyChange = fetchedQuote?.d;

        const computedMetrics = calculatePositionMetrics(
          mappedPosition,
          currentPrice,
          rate,
          settings.annualGrowthRate,
          dailyChange
        );

        if (cancelled) {
          return;
        }

        setQuote(fetchedQuote);
        setUsdToIls(rate);
        setMetrics(computedMetrics);
      } catch (err) {
        console.error('Failed to load stock data:', err);
        if (!cancelled) {
          setError(locale === 'he' ? 'שגיאה בטעינת הנתונים' : 'Failed to load data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [locale, normalizedSymbol, reloadKey, settings.annualGrowthRate, settings.finnhubToken]);

  const fetchHistorical = useCallback(
    async (selectedRange: TimeRange, entryDate?: string) => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const { from, resolution } = getRangeParams(selectedRange, entryDate);

        const url = `/api/candles?symbol=${encodeURIComponent(normalizedSymbol)}&resolution=${resolution}&from=${from}&to=${now}${
          settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
        }`;
        const response = await fetch(url);

        if (!response.ok) {
          console.warn(`Candles request failed with status ${response.status}`);
          return [] as HistoricalPoint[];
        }

        const data = (await response.json()) as CandleResponse;
        if (data.error) {
          console.warn('Candles API error:', data.error);
          return [] as HistoricalPoint[];
        }

        return mapCandleDataToPoints(data);
      } catch (err) {
        console.error('Failed to load historical data:', err);
        return [] as HistoricalPoint[];
      }
    },
    [normalizedSymbol, settings.finnhubToken]
  );

  useEffect(() => {
    if (!position) {
      return;
    }

    let cancelled = false;

    const loadHistorical = async () => {
      setHistoricalLoading(true);
      try {
        const points = await fetchHistorical(range, position.entryDate);
        if (!cancelled) {
          setHistorical(points);
        }
      } finally {
        if (!cancelled) {
          setHistoricalLoading(false);
        }
      }
    };

    loadHistorical();

    return () => {
      cancelled = true;
    };
  }, [fetchHistorical, position, range]);

  const formatUsdCurrency = useCallback(
    (valueUsd?: number) => (valueUsd !== undefined ? formatCurrency(valueUsd, 'USD', locale) : '--'),
    [locale]
  );

  const formatDualCurrency = useCallback(
    (valueUsd?: number) =>
      valueUsd !== undefined
        ? `${formatCurrency(valueUsd, 'USD', locale)} · ${formatCurrency(valueUsd * usdToIls, 'ILS', locale)}`
        : '--',
    [locale, usdToIls]
  );

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        maximumFractionDigits: 0,
      }),
    [localeCode]
  );

  const formatVolume = useCallback(
    (value?: number) => (value !== undefined ? numberFormatter.format(value) : '--'),
    [numberFormatter]
  );

  const chartData = useMemo(
    () =>
      historical.map((point) => ({
        timestamp: point.timestamp,
        close: point.close,
        volume: point.volume,
      })),
    [historical]
  );

  const tradeMarkers = useMemo<TradeMarkerDatum[]>(() => {
    if (!transactions.length || !chartData.length) {
      return [];
    }

    const rangeStart = chartData[0]?.timestamp ?? Number.NEGATIVE_INFINITY;
    const rangeEnd = chartData[chartData.length - 1]?.timestamp ?? Number.POSITIVE_INFINITY;

    return transactions
      .map((lot) => {
        const timestamp = new Date(lot.executedAt).getTime();
        if (Number.isNaN(timestamp)) {
          return null;
        }

        return {
          id: lot.id ?? `${lot.executedAt}-${lot.type}-${lot.price}-${lot.quantity}`,
          timestamp,
          tradePrice: lot.price,
          quantity: lot.quantity,
          type: lot.type,
          isTradeMarker: true as const,
        } satisfies TradeMarkerDatum;
      })
      .filter((marker): marker is TradeMarkerDatum => {
        if (!marker) {
          return false;
        }
        return marker.timestamp >= rangeStart && marker.timestamp <= rangeEnd;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [chartData, transactions]);

  const tradesByDay = useMemo(() => {
    const grouped = new Map<string, TradeMarkerDatum[]>();
    for (const marker of tradeMarkers) {
      const key = getDateKey(marker.timestamp);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(marker);
      } else {
        grouped.set(key, [marker]);
      }
    }
    grouped.forEach((entries) => {
      entries.sort((a, b) => a.timestamp - b.timestamp);
    });
    return grouped;
  }, [tradeMarkers]);

  const priceDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) {
      return [0, 0];
    }

    let min = chartData[0].close;
    let max = chartData[0].close;

    for (const point of chartData) {
      if (point.close < min) {
        min = point.close;
      }
      if (point.close > max) {
        max = point.close;
      }
    }

    for (const marker of tradeMarkers) {
      if (marker.tradePrice < min) {
        min = marker.tradePrice;
      }
      if (marker.tradePrice > max) {
        max = marker.tradePrice;
      }
    }

    if (min === max) {
      const buffer = min === 0 ? 1 : Math.abs(min) * 0.01;
      return [min - buffer, max + buffer];
    }

    return [min, max];
  }, [chartData, tradeMarkers]);

  const xAxisDomain = useMemo<[number, number] | undefined>(() => {
    const { from } = getRangeParams(range, position?.entryDate);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(from) || from >= nowSeconds) {
      return undefined;
    }

    return [from * 1000, nowSeconds * 1000];
  }, [position?.entryDate, range]);

  const renderTooltip = useCallback(
    (tooltipProps: TooltipProps<number, string>) => {
      const { active, payload, label } = tooltipProps;

      if (!active || !payload?.length || typeof label !== 'number') {
        return null;
      }

      const dateLabel = formatTooltipLabel(label, range, localeCode);
      const priceEntry = payload.find((entry) => entry.dataKey === 'close');
      const volumeEntry = payload.find((entry) => entry.dataKey === 'volume');
      const tradesForDay = tradesByDay.get(getDateKey(label)) ?? [];
      const quantityLabel = t.stock.detailView.tradeMarkers.quantityLabel;

      return (
        <div className={TOOLTIP_CONTAINER_CLASS}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{dateLabel}</div>
          {priceEntry && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{t.stock.detailView.chartPriceLabel}</span>
              <span className="font-semibold text-slate-50">
                {formatDualCurrency(priceEntry.value as number)}
              </span>
            </div>
          )}
          {showVolume && volumeEntry && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{t.stock.detailView.tooltip.volume}</span>
              <span className="font-semibold text-slate-50">{formatVolume(volumeEntry.value as number)}</span>
            </div>
          )}
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t.stock.detailView.tooltip.tradesHeading}
            </div>
            {tradesForDay.length === 0 ? (
              <div className="mt-1 text-xs text-slate-500">
                {t.stock.detailView.tooltip.noTrades}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {tradesForDay.map((trade) => {
                  const isBuy = trade.type === 'BUY';
                  const tradeLabel = isBuy
                    ? t.stock.detailView.tradeMarkers.buy
                    : t.stock.detailView.tradeMarkers.sell;
                  const timeLabel = new Date(trade.timestamp).toLocaleTimeString(localeCode, {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={trade.id}
                      className="rounded-xl bg-slate-800/60 px-3 py-2 text-xs leading-5 text-slate-100"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className={isBuy ? 'text-emerald-400' : 'text-rose-400'}>{tradeLabel}</span>
                        <span className="text-slate-300">{timeLabel}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-200">
                        {`${formatDualCurrency(trade.tradePrice)} · ${quantityLabel}: ${formatNumber(
                          trade.quantity,
                          locale
                        )}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    },
    [formatDualCurrency, formatVolume, locale, localeCode, range, showVolume, t, tradesByDay]
  );

  const dailyChangeValue = quote?.d;
  const dailyChangePercent = quote?.dp ?? metrics?.dailyChangePercent;

  const investedAmountUsd = metrics ? metrics.position.entryPrice * metrics.position.quantity : 0;
  const investedAmountDisplay = metrics ? formatDualCurrency(investedAmountUsd) : '--';
  const currentValueDisplay = metrics ? formatDualCurrency(metrics.currentValue) : '--';
  const totalGainUsd = metrics ? metrics.currentValue - investedAmountUsd : 0;
  const totalGainDisplay = metrics ? formatDualCurrency(totalGainUsd) : '--';
  const totalGainPercentLabel =
    metrics?.roiPercent !== undefined ? formatPercent(metrics.roiPercent, locale) : '--';
  const totalGainClass =
    metrics && totalGainUsd !== 0
      ? totalGainUsd > 0
        ? 'text-emerald-600'
        : 'text-rose-600'
      : 'text-slate-600';
  const holdingPeriodLabel = metrics ? buildHoldingPeriodLabel(metrics.yearsHeld, t, locale) : '--';
  const dailyChangeDisplay =
    dailyChangeValue !== undefined ? formatDualCurrency(dailyChangeValue) : '--';
  const dailyChangePercentLabel =
    dailyChangePercent !== undefined ? formatPercent(dailyChangePercent, locale) : '--';
  const dailyChangeClass =
    dailyChangeValue === undefined
      ? 'text-slate-500'
      : dailyChangeValue >= 0
        ? 'text-emerald-600'
        : 'text-rose-600';

  const quickFacts = metrics
    ? [
        {
          key: 'currentValue',
          label: t.stock.detailView.quickFacts.currentValue,
          value: currentValueDisplay,
          helper: t.stock.detailView.quickFactsHelper.currentValue,
        },
        {
          key: 'investedAmount',
          label: t.stock.detailView.quickFacts.investedAmount,
          value: investedAmountDisplay,
          helper: t.stock.detailView.quickFactsHelper.investedAmount,
        },
        {
          key: 'totalGain',
          label: t.stock.detailView.quickFacts.totalGain,
          value: totalGainDisplay,
          secondary: totalGainPercentLabel,
          helper: t.stock.detailView.quickFactsHelper.totalGain,
          accentClass: totalGainClass,
          secondaryClass: totalGainClass,
        },
        {
          key: 'dailyChange',
          label: t.stock.detailView.quickFacts.dailyChange,
          value: dailyChangeDisplay,
          secondary: dailyChangePercentLabel,
          helper: t.stock.detailView.quickFactsHelper.dailyChange,
          accentClass: dailyChangeClass,
          secondaryClass: dailyChangeClass,
        },
        {
          key: 'holdingTime',
          label: t.stock.detailView.quickFacts.holdingTime,
          value: holdingPeriodLabel,
          helper: t.stock.detailView.quickFactsHelper.holdingTime,
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t.stock.back}
            </Button>
          </Link>
          {historicalLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              {t.common.loading}
            </div>
          )}
        </header>

        {loading ? (
          <StockDetailSkeleton />
        ) : error ? (
          <Card className="bg-white/80 border border-red-200 text-red-700">
            <CardContent className="flex flex-col items-center gap-4 py-10">
              <div className="text-lg font-semibold">{t.stock.detailView.states.error}</div>
              <div className="text-sm text-red-600/80">{error}</div>
              <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
                {t.stock.detailView.states.retry}
              </Button>
            </CardContent>
          </Card>
        ) : !position || !metrics ? (
          <Card className="bg-white/80 border border-white/60">
            <CardContent className="flex items-center justify-center py-20 text-sm text-gray-500">
              {t.stock.detailView.states.empty}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl bg-white/80 p-6 shadow-md backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 rounded-full border-2 border-white shadow-sm">
                    <AvatarImage src={position.imageUrl} alt={position.display} />
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-3xl font-bold text-[#0F172A]">{position.display}</h1>
                      <Badge variant="secondary" className="text-sm uppercase">
                        {position.symbol}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      <span>
                        {t.dashboard.quantity}{' '}
                        <span className="font-medium text-gray-900">
                          {formatNumber(position.quantity, locale)}
                        </span>
                      </span>
                      <span>
                        {t.dashboard.entryPrice}{' '}
                        <span className="font-medium text-gray-900">
                          {formatDualCurrency(position.entryPrice)}
                        </span>
                      </span>
                      <span>
                        {t.dashboard.since}{' '}
                        <span className="font-medium text-gray-900">
                          {formatDate(position.entryDate, locale)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{t.stock.priceToday}</div>
                  <div className="text-3xl font-semibold text-[#0F172A]">
                    {formatUsdCurrency(metrics.currentPrice)}
                  </div>
                  <div className={cn('text-sm font-medium', dailyChangeClass)}>
                    {dailyChangeDisplay}{' '}
                    {dailyChangePercent !== undefined && dailyChangePercentLabel !== '--'
                      ? `(${dailyChangePercentLabel})`
                      : ''}
                  </div>
                </div>
              </div>
            </div>

            <Card className="bg-white/85 border border-white/60 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.stock.detailView.quickFactsTitle}
                </CardTitle>
                <p className="text-sm text-gray-500">{t.stock.detailView.quickFactsSubtitle}</p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {quickFacts.map((fact) => (
                    <div
                      key={fact.key}
                      className="rounded-xl border border-slate-100 bg-white/70 p-4 shadow-sm"
                    >
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        {fact.label}
                      </div>
                      <div className={cn('mt-2 text-lg font-semibold text-slate-900', fact.accentClass)}>
                        {fact.value}
                      </div>
                      {fact.secondary && (
                        <div className={cn('text-sm font-medium', fact.secondaryClass)}>
                          {fact.secondary}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-gray-500">{fact.helper}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/85 border border-white/60 shadow-xl">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.positions.transactionsTitle}
                  </CardTitle>
                  <p className="text-sm text-gray-500">{t.stock.detailView.transactionsHelper}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">{t.dashboard.quantity}</div>
                    <div className="font-medium text-gray-900">{formatNumber(position.quantity, locale)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">{t.dashboard.entryPrice}</div>
                    <div className="font-medium text-gray-900">{formatDualCurrency(position.entryPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">{t.dashboard.weightedProjectedPrice}</div>
                    <div className="font-medium text-gray-900">{formatDualCurrency(metrics.projectedPrice)}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-gray-600">
                {openLots.length > 0 ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {t.positions.currentHolding}
                    </div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      {openLots.map((lot) => (
                        <div
                          key={`${lot.id ?? lot.executedAt}-open`}
                          className="rounded-md border border-slate-200 bg-slate-50/70 p-3"
                        >
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="font-semibold text-emerald-600">{t.positions.buy}</span>
                            <span>{formatDate(lot.executedAt, locale)}</span>
                          </div>
                          <div className="mt-2 text-sm font-medium text-gray-900">
                            {formatNumber(lot.quantity, locale)} · {formatDualCurrency(lot.price)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-gray-500">
                    {t.positions.noTransactions}
                  </div>
                )}

                {transactions.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.positions.transactionType}</TableHead>
                      <TableHead className="text-right">{t.positions.transactionQuantity}</TableHead>
                      <TableHead className="text-right">{t.positions.transactionPrice}</TableHead>
                      <TableHead className="text-right">{t.positions.transactionCommission}</TableHead>
                      <TableHead className="text-right">{t.positions.transactionDate}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((lot) => {
                          const badgeTone = lot.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
                          const label = lot.type === 'BUY' ? t.positions.buy : t.positions.sell;
                          return (
                        <TableRow key={`${lot.id}-${lot.executedAt}`}>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>
                              {label}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(lot.quantity, locale)}
                          </TableCell>
                          <TableCell className="text-right">{formatDualCurrency(lot.price)}</TableCell>
                          <TableCell className="text-right text-xs text-gray-500">
                            {lot.hasCommission && lot.commissionAmount > 0
                              ? t.positions.transactionCommissionShort(
                                  formatDualCurrency(lot.commissionAmount),
                                )
                              : t.positions.transactionCommissionWaived}
                          </TableCell>
                          <TableCell className="text-right text-xs text-gray-500">
                            {formatDate(lot.executedAt, locale)}
                          </TableCell>
                        </TableRow>
                      );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/85 border border-white/60 shadow-xl">
              <CardHeader className="gap-2">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {t.stock.detailView.chartTitle}
                    </CardTitle>
                    <p className="text-sm text-gray-500">{t.stock.detailView.chartSubtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {TIME_RANGES.map((option) => (
                        <Button
                          key={option}
                          variant={range === option ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setRange(option)}
                          disabled={historicalLoading && range === option}
                        >
                          {t.timeRange[option]}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Switch checked={showVolume} onCheckedChange={setShowVolume} id="volume-toggle" />
                      <label htmlFor="volume-toggle" className="cursor-pointer">
                        {t.stock.detailView.showVolume}
                      </label>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {historicalLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="flex h-80 items-center justify-center text-sm text-gray-500">
                    {t.stock.historyUnavailable}
                  </div>
                ) : (
                  <div className={cn('w-full', showVolume ? 'h-[360px]' : 'h-[300px]')}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 20, right: 24, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1D4ED8" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                        <XAxis
                          dataKey="timestamp"
                          type="number"
                          domain={xAxisDomain ?? FALLBACK_X_AXIS_DOMAIN}
                          allowDataOverflow
                          tickLine={false}
                          axisLine={false}
                          tickMargin={12}
                          minTickGap={24}
                          tick={{ fill: '#475569', fontSize: 12 }}
                          tickFormatter={(value) => formatAxisLabel(value as number, range, localeCode)}
                        />
                        <YAxis
                          yAxisId="price"
                          domain={priceDomain}
                          width={80}
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          padding={{ top: 12, bottom: 12 }}
                          tick={{ fill: '#475569', fontSize: 12 }}
                          tickFormatter={(value) => formatCurrency(value as number, 'USD', locale)}
                        />
                        <Tooltip
                          cursor={{ stroke: 'rgba(37, 99, 235, 0.25)', strokeWidth: 2 }}
                          wrapperStyle={{ outline: 'none' }}
                          content={renderTooltip}
                        />
                        {showVolume && (
                          <YAxis yAxisId="volume" orientation="right" tickLine={false} axisLine={false} hide />
                        )}
                        {showVolume && (
                          <Bar
                            yAxisId="volume"
                            dataKey="volume"
                            name={t.stock.detailView.tooltip.volume}
                            barSize={14}
                            radius={[6, 6, 0, 0]}
                            fill="rgba(59, 130, 246, 0.18)"
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="close"
                          yAxisId="price"
                          stroke="#1D4ED8"
                          strokeWidth={2.75}
                          activeDot={{ r: 4, fill: '#2563EB', strokeWidth: 0 }}
                          fill="url(#priceGradient)"
                          name={t.stock.detailView.chartPriceLabel}
                        />
                        {tradeMarkers.length > 0 && (
                          <Scatter
                            data={tradeMarkers}
                            dataKey="tradePrice"
                            yAxisId="price"
                            name={t.stock.detailView.tradeMarkers.seriesLabel}
                            shape={<TradeMarkerShape />}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-4 text-xs text-gray-500">{t.stock.detailView.chartHelper}</p>
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </div>
  );
}
