'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import { Progress } from '@/components/ui/progress';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { mapSupabasePosition } from '@/lib/positions';
import {
  calculatePositionMetrics,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import { analyzeStock } from '@/lib/stock-analysis';
import { cn } from '@/lib/utils';
import {
  CandleData,
  ChecklistItem,
  ChecklistKey,
  HistoricalPoint,
  Position,
  PositionMetrics,
  StockAnalysisResult,
  StockQuote,
  TimeRange,
} from '@/types';

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];
const DAY_SECONDS = 60 * 60 * 24;

const VERDICT_BADGES: Record<StockAnalysisResult['verdict'], string> = {
  BUY: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  SELL: 'bg-rose-100 text-rose-700 border border-rose-200',
  NEUTRAL: 'bg-slate-200 text-slate-700 border border-slate-300',
};

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

function buildChecklistDetail(
  key: ChecklistKey,
  item: ChecklistItem,
  t: ReturnType<typeof useTranslation>['t'],
  formatPrice: (value?: number) => string,
  formatVolume: (value?: number) => string
) {
  const details = t.stock.detailView.details;
  switch (key) {
    case 'trend':
      return item.passed
        ? details.trendPositive
        : details.trendNegative.replace('{{ema}}', formatPrice((item.context as Record<string, number | undefined>)?.ema50));
    case 'rsi':
      return item.passed ? details.rsiPositive : details.rsiNegative;
    case 'macd':
      return item.passed ? details.macdPositive : details.macdNegative;
    case 'volume':
      return item.passed
        ? details.volumePositive.replace(
            '{{volume}}',
            formatVolume((item.context as Record<string, number | undefined>)?.currentVolume as number | undefined)
          )
        : details.volumeNegative;
    case 'supportResistance':
      return item.passed ? details.srPositive : details.srNegative;
    case 'riskReward':
      return item.passed
        ? details.rrPositive.replace(
            '{{rr}}',
            ((item.context as Record<string, number | undefined>)?.rr ?? 0).toFixed(2)
          )
        : details.rrNegative;
    default:
      return '';
  }
}

function buildVerdictNarrative(
  checklist: ChecklistItem[],
  riskReward: StockAnalysisResult['riskReward'],
  t: ReturnType<typeof useTranslation>['t']
) {
  if (!checklist.length) {
    return t.stock.detailView.reasons.none;
  }
  const positives = checklist.filter((item) => item.passed).map((item) => t.stock.detailView.criteria[item.key]);
  const negatives = checklist.filter((item) => !item.passed).map((item) => t.stock.detailView.criteria[item.key]);

  const lines: string[] = [];
  if (positives.length) {
    lines.push(`${t.stock.detailView.reasons.positives}${positives.slice(0, 3).join(' · ')}`);
  }
  if (negatives.length) {
    lines.push(`${t.stock.detailView.reasons.negatives}${negatives.slice(0, 2).join(' · ')}`);
  }
  if (riskReward.rr !== undefined) {
    lines.push(`${t.stock.detailView.reasons.riskReward}: ${riskReward.rr.toFixed(2)}`);
  }

  return lines.join(' ');
}

function StockDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-white/70 border border-white/50 shadow">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card className="bg-white/70 border border-white/50 shadow">
          <CardHeader>
            <Skeleton className="h-6 w-28" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
      <Card className="bg-white/70 border border-white/50 shadow">
        <CardHeader>
          <Skeleton className="h-6 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: positionError } = await supabase
          .from('positions')
          .select('*')
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

        const mappedPosition: Position = mapSupabasePosition(data);

        if (cancelled) {
          return;
        }

        setPosition(mappedPosition);

        const quoteUrl = `/api/quote?symbol=${encodeURIComponent(normalizedSymbol)}${
          settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
        }`;
        const [quoteResponse, rateResponse] = await Promise.all([
          fetch(quoteUrl),
          fetch('/api/exchange-rate'),
        ]);

        let fetchedQuote: StockQuote | null = null;
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

  const convertValue = useCallback(
    (valueUsd: number) => (settings.currency === 'ILS' ? valueUsd * usdToIls : valueUsd),
    [settings.currency, usdToIls]
  );

  const formatDisplayCurrency = useCallback(
    (valueUsd?: number) =>
      valueUsd !== undefined
        ? formatCurrency(convertValue(valueUsd), settings.currency, locale)
        : '--',
    [convertValue, locale, settings.currency]
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

  const currentPriceUsd = metrics?.currentPrice ?? quote?.c ?? position?.entryPrice ?? 0;

  const analysis = useMemo(
    () => analyzeStock({ points: historical, currentPrice: currentPriceUsd }),
    [historical, currentPriceUsd]
  );

  const chartData = useMemo(
    () =>
      analysis.series.map((point) => ({
        timestamp: point.timestamp,
        close: convertValue(point.close),
        ema20: point.ema20 !== undefined ? convertValue(point.ema20) : undefined,
        ema50: point.ema50 !== undefined ? convertValue(point.ema50) : undefined,
        ema200: point.ema200 !== undefined ? convertValue(point.ema200) : undefined,
        bbUpper: point.bbUpper !== undefined ? convertValue(point.bbUpper) : undefined,
        bbLower: point.bbLower !== undefined ? convertValue(point.bbLower) : undefined,
        volume: point.volume,
      })),
    [analysis.series, convertValue]
  );

  const tooltipLabels = useMemo(
    () => ({
      close: t.stock.detailView.indicatorLabels.close,
      ema20: t.stock.detailView.indicatorLabels.ema20,
      ema50: t.stock.detailView.indicatorLabels.ema50,
      ema200: t.stock.detailView.indicatorLabels.ema200,
      bbUpper: t.stock.detailView.indicatorLabels.bbUpper,
      bbLower: t.stock.detailView.indicatorLabels.bbLower,
    }),
    [t.stock.detailView.indicatorLabels]
  );

  const verdictNarrative = useMemo(
    () => buildVerdictNarrative(analysis.checklist, analysis.riskReward, t),
    [analysis.checklist, analysis.riskReward, t]
  );

  const checklistRows = useMemo(
    () =>
      analysis.checklist.map((item) => ({
        key: item.key,
        label: t.stock.detailView.criteria[item.key],
        statusLabel: item.passed ? t.stock.detailView.status.yes : t.stock.detailView.status.no,
        statusClass: item.passed
          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
          : 'bg-rose-100 text-rose-700 border border-rose-200',
        detail: buildChecklistDetail(item.key, item, t, formatDisplayCurrency, formatVolume),
      })),
    [analysis.checklist, formatDisplayCurrency, formatVolume, t]
  );

  const dailyChangeValue = quote?.d;
  const dailyChangePercent = quote?.dp ?? metrics?.dailyChangePercent;

  const verdictBadgeClass = VERDICT_BADGES[analysis.verdict];

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
                    <Badge className={cn('text-sm uppercase font-semibold', verdictBadgeClass)}>
                      {analysis.verdict}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <span>
                      {t.dashboard.quantity}:{' '}
                      <span className="font-medium text-gray-900">
                        {formatNumber(position.quantity, locale)}
                      </span>
                    </span>
                    <span>
                      {t.dashboard.entryPrice}:{' '}
                      <span className="font-medium text-gray-900">
                        {formatDisplayCurrency(position.entryPrice)}
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
                  {formatDisplayCurrency(metrics.currentPrice)}
                </div>
                <div
                  className={cn(
                    'text-sm font-medium',
                    dailyChangeValue === undefined
                      ? 'text-gray-500'
                      : dailyChangeValue >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  )}
                >
                  {dailyChangeValue === undefined ? (
                    '--'
                  ) : (
                    <>
                      {formatDisplayCurrency(dailyChangeValue)}{' '}
                      {dailyChangePercent !== undefined && `(${formatPercent(dailyChangePercent, locale)})`}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <Card className="bg-white/85 border border-white/60 shadow-xl">
                <CardHeader className="gap-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-gray-900">
                        {t.stock.history}
                      </CardTitle>
                      <p className="text-sm text-gray-500">{t.stock.detailView.subtitle}</p>
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
                    <div>
                      <div className={cn('w-full', showVolume ? 'h-[360px]' : 'h-[280px]')}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} syncId="price-volume" margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis
                              dataKey="timestamp"
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => formatAxisLabel(value as number, range, localeCode)}
                            />
                            <YAxis
                              yAxisId="price"
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => formatCurrency(value as number, settings.currency, locale)}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (name === 'volume') {
                                  return [formatVolume(value as number), t.stock.detailView.tooltip.volume];
                                }
                                const label = tooltipLabels[name as keyof typeof tooltipLabels] ?? name;
                                return [
                                  formatCurrency(value as number, settings.currency, locale),
                                  label,
                                ];
                              }}
                              labelFormatter={(value) => formatTooltipLabel(value as number, range, localeCode)}
                            />
                            <Legend verticalAlign="top" height={32} />
                            <Line type="monotone" dataKey="close" name={tooltipLabels.close} stroke="#2563EB" strokeWidth={2} dot={false} yAxisId="price" />
                            <Line type="monotone" dataKey="ema20" name={tooltipLabels.ema20} stroke="#0EA5E9" strokeWidth={1.5} dot={false} yAxisId="price" strokeDasharray="5 5" />
                            <Line type="monotone" dataKey="ema50" name={tooltipLabels.ema50} stroke="#EC4899" strokeWidth={1.5} dot={false} yAxisId="price" />
                            <Line type="monotone" dataKey="ema200" name={tooltipLabels.ema200} stroke="#F59E0B" strokeWidth={1.5} dot={false} yAxisId="price" />
                            <Line type="monotone" dataKey="bbUpper" name={tooltipLabels.bbUpper} stroke="#93C5FD" strokeWidth={1} dot={false} yAxisId="price" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="bbLower" name={tooltipLabels.bbLower} stroke="#93C5FD" strokeWidth={1} dot={false} yAxisId="price" strokeDasharray="4 4" />
                            {analysis.supportResistance.supports.slice(-2).map((level) => (
                              <ReferenceLine
                                key={`support-${level}`}
                                y={convertValue(level)}
                                yAxisId="price"
                                stroke="#10B981"
                                strokeDasharray="3 3"
                              />
                            ))}
                            {analysis.supportResistance.resistances.slice(0, 2).map((level) => (
                              <ReferenceLine
                                key={`resistance-${level}`}
                                y={convertValue(level)}
                                yAxisId="price"
                                stroke="#F87171"
                                strokeDasharray="3 3"
                              />
                            ))}
                            {analysis.supportResistance.lastBreakout && (
                              <ReferenceDot
                                x={analysis.supportResistance.lastBreakout.timestamp}
                                y={convertValue(analysis.supportResistance.lastBreakout.price)}
                                r={5}
                                fill="#10B981"
                                stroke="white"
                                yAxisId="price"
                              />
                            )}
                            {analysis.supportResistance.lastBreakdown && (
                              <ReferenceDot
                                x={analysis.supportResistance.lastBreakdown.timestamp}
                                y={convertValue(analysis.supportResistance.lastBreakdown.price)}
                                r={5}
                                fill="#F87171"
                                stroke="white"
                                yAxisId="price"
                              />
                            )}
                            {analysis.periodHigh && (
                              <ReferenceLine
                                y={convertValue(analysis.periodHigh)}
                                yAxisId="price"
                                stroke="#3B82F6"
                                strokeDasharray="1 6"
                              />
                            )}
                            {analysis.periodLow && (
                              <ReferenceLine
                                y={convertValue(analysis.periodLow)}
                                yAxisId="price"
                                stroke="#3B82F6"
                                strokeDasharray="1 6"
                              />
                            )}
                            <Brush
                              dataKey="timestamp"
                              height={24}
                              travellerWidth={10}
                              tickFormatter={(value) => formatAxisLabel(value as number, range, localeCode)}
                            />
                            {showVolume && (
                              <YAxis
                                yAxisId="volume"
                                orientation="right"
                                tickLine={false}
                                axisLine={false}
                                hide
                              />
                            )}
                            {showVolume && (
                              <Bar
                                yAxisId="volume"
                                dataKey="volume"
                                name={t.stock.detailView.tooltip.volume}
                                barSize={12}
                                fill="rgba(148, 163, 184, 0.4)"
                              />
                            )}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="mt-6">
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">RSI(14)</h4>
                        <ResponsiveContainer width="100%" height={120}>
                          <LineChart data={analysis.series} syncId="price-volume" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="timestamp" hide />
                            <YAxis domain={[0, 100]} ticks={[20, 30, 50, 70, 80]} width={20} />
                            <Tooltip
                              formatter={(value) => [Number(value).toFixed(2), 'RSI']}
                              labelFormatter={(value) => formatTooltipLabel(value as number, range, localeCode)}
                            />
                            <ReferenceLine y={30} stroke="#F87171" strokeDasharray="4 4" />
                            <ReferenceLine y={70} stroke="#FBBF24" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="rsi14" stroke="#6366F1" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-6">
                <Card className="bg-white/85 border border-white/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {t.stock.detailView.verdictTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-gray-600">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-4xl font-bold text-[#0F172A]">{analysis.score}</div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">
                          {t.stock.detailView.score}
                        </div>
                      </div>
                      <div className="flex-1">
                        <Progress value={analysis.score} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.rr}</span>
                        <span className="font-medium text-gray-900">
                          {analysis.riskReward.rr ? analysis.riskReward.rr.toFixed(2) : '--'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.stop}</span>
                        <span className="font-medium text-gray-900">
                          {formatDisplayCurrency(analysis.riskReward.stop)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.target}</span>
                        <span className="font-medium text-gray-900">
                          {formatDisplayCurrency(analysis.riskReward.target)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-gray-700">
                      {verdictNarrative}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/85 border border-white/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {t.stock.detailView.indicatorSummary}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-gray-600">
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-1">
                      <div className="rounded-lg bg-slate-100/70 p-3">
                        <div className="text-xs uppercase text-gray-500">EMA</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between">
                            <span>20</span>
                            <span className="font-medium text-gray-900">
                              {formatDisplayCurrency(analysis.indicators.ema20)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>50</span>
                            <span className="font-medium text-gray-900">
                              {formatDisplayCurrency(analysis.indicators.ema50)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>200</span>
                            <span className="font-medium text-gray-900">
                              {formatDisplayCurrency(analysis.indicators.ema200)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-100/70 p-3">
                        <div className="text-xs uppercase text-gray-500">RSI & MACD</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between">
                            <span>RSI</span>
                            <span className="font-medium text-gray-900">
                              {analysis.indicators.rsi ? analysis.indicators.rsi.toFixed(2) : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>MACD</span>
                            <span className="font-medium text-gray-900">
                              {analysis.indicators.macd ? analysis.indicators.macd.toFixed(2) : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Signal</span>
                            <span className="font-medium text-gray-900">
                              {analysis.indicators.macdSignal ? analysis.indicators.macdSignal.toFixed(2) : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-100/70 p-3">
                      <div className="text-xs uppercase text-gray-500">ATR</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span>{t.stock.detailView.atr}</span>
                        <span className="font-medium text-gray-900">
                          {formatDisplayCurrency(analysis.indicators.atr)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-100/70 p-3">
                      <div className="text-xs uppercase text-gray-500">{t.stock.detailView.volumeBlock}</div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span>{t.stock.volume}</span>
                          <span className="font-medium text-gray-900">
                            {formatVolume(analysis.volume.latest)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t.stock.detailView.averageVolume20}</span>
                          <span className="font-medium text-gray-900">
                            {formatVolume(analysis.volume.average20)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-100/70 p-3">
                      <div className="text-xs uppercase text-gray-500">
                        {t.stock.detailView.divergences}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="bg-white text-gray-700">
                          RSI: {t.stock.detailView.divergence[analysis.divergences.rsi]}
                        </Badge>
                        <Badge variant="outline" className="bg-white text-gray-700">
                          MACD: {t.stock.detailView.divergence[analysis.divergences.macd]}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/85 border border-white/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {t.stock.detailView.supportResistance}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm text-gray-600">
                    <div>
                      <div className="text-xs uppercase text-gray-500">{t.stock.detailView.supports}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {analysis.supportResistance.supports.length === 0 && <span>--</span>}
                        {analysis.supportResistance.supports.map((level) => (
                          <Badge key={`support-chip-${level}`} variant="outline" className="bg-emerald-50 text-emerald-700">
                            {formatDisplayCurrency(level)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-500">{t.stock.detailView.resistances}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {analysis.supportResistance.resistances.length === 0 && <span>--</span>}
                        {analysis.supportResistance.resistances.map((level) => (
                          <Badge key={`resistance-chip-${level}`} variant="outline" className="bg-rose-50 text-rose-700">
                            {formatDisplayCurrency(level)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.periodHigh}</span>
                        <span className="font-medium text-gray-900">
                          {formatDisplayCurrency(analysis.periodHigh)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.periodLow}</span>
                        <span className="font-medium text-gray-900">
                          {formatDisplayCurrency(analysis.periodLow)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.lastBreakout}</span>
                        <span className="font-medium text-gray-900">
                          {analysis.supportResistance.lastBreakout
                            ? `${formatDisplayCurrency(analysis.supportResistance.lastBreakout.price)} · ${formatDate(
                                new Date(analysis.supportResistance.lastBreakout.timestamp).toISOString(),
                                locale
                              )}`
                            : '--'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.stock.detailView.lastBreakdown}</span>
                        <span className="font-medium text-gray-900">
                          {analysis.supportResistance.lastBreakdown
                            ? `${formatDisplayCurrency(analysis.supportResistance.lastBreakdown.price)} · ${formatDate(
                                new Date(analysis.supportResistance.lastBreakdown.timestamp).toISOString(),
                                locale
                              )}`
                            : '--'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="bg-white/85 border border-white/60 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.stock.detailView.checklistTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap text-gray-500">
                          {t.stock.detailView.columns.criterion}
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-gray-500">
                          {t.stock.detailView.columns.status}
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-gray-500">
                          {t.stock.detailView.columns.details}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checklistRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="whitespace-nowrap font-medium text-gray-900">
                            {row.label}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className={cn('text-xs font-semibold uppercase', row.statusClass)}>
                              {row.statusLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-[240px] text-sm text-gray-600">
                            {row.detail}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-gray-500">{t.stock.detailView.tableMobileHint}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
