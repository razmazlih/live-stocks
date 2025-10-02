'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft } from 'lucide-react';

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
import {
  CandleData,
  HistoricalPoint,
  Position,
  PositionMetrics,
  StockQuote,
  TimeRange,
} from '@/types';

const AVAILABLE_RANGES: TimeRange[] = ['1W', '1M', '3M', '1Y', 'All'];
const DAY_SECONDS = 60 * 60 * 24;

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
    case 'YTD': {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      return { from: Math.floor(startOfYear), resolution: 'D' };
    }
    case '1Y':
      return { from: now - 365 * DAY_SECONDS, resolution: 'W' };
    case 'All': {
      const defaultRange = now - 5 * 365 * DAY_SECONDS;
      const entryTimestamp = entryDate ? Math.floor(new Date(entryDate).getTime() / 1000) : defaultRange;
      const earliest = Math.min(entryTimestamp, defaultRange);
      const clamped = Math.min(earliest, now - DAY_SECONDS);
      return { from: clamped, resolution: 'M' };
    }
    default:
      return { from: now - 30 * DAY_SECONDS, resolution: 'D' };
  }
}

function getDateLabel(timestamp: number, range: TimeRange, locale: string) {
  const date = new Date(timestamp);
  if (range === '1D') {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1W') {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  if (range === '1M' || range === '3M') {
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

interface StockDetailViewProps {
  symbol: string;
}

export function StockDetailView({ symbol }: StockDetailViewProps) {
  const normalizedSymbol = symbol.toUpperCase();
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';

  const [loading, setLoading] = useState(true);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [range, setRange] = useState<TimeRange>('1M');
  const [historical, setHistorical] = useState<HistoricalPoint[]>([]);

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

        const mappedPosition: Position = {
          id: data.id,
          symbol: data.symbol,
          display: data.display,
          imageUrl: data.image_url,
          entryPrice: parseFloat(data.entry_price.toString()),
          quantity: parseFloat(data.quantity.toString()),
          entryDate: data.entry_date,
        };

        if (cancelled) {
          return;
        }

        setPosition(mappedPosition);

        const quoteUrl = `/api/quote?symbol=${encodeURIComponent(normalizedSymbol)}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`;
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
  }, [locale, normalizedSymbol, settings.annualGrowthRate, settings.finnhubToken]);

  const fetchHistorical = useCallback(
    async (selectedRange: TimeRange, entryDate?: string) => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const { from, resolution } = getRangeParams(selectedRange, entryDate);

        const url = `/api/candles?symbol=${encodeURIComponent(normalizedSymbol)}&resolution=${resolution}&from=${from}&to=${now}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`;
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
    (valueUsd: number) => formatCurrency(convertValue(valueUsd), settings.currency, locale),
    [convertValue, locale, settings.currency]
  );

  const chartData = useMemo(() =>
    historical.map((point) => ({
      timestamp: point.timestamp,
      label: getDateLabel(point.timestamp, range, localeCode),
      value: convertValue(point.close),
    })),
    [convertValue, historical, localeCode, range]
  );

  const dailyChangeValue = quote?.d;
  const dailyChangePercent = quote?.dp ?? metrics?.dailyChangePercent;
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(localeCode, { maximumFractionDigits: 0 }),
    [localeCode]
  );

  const pnlValue = metrics ? convertValue(metrics.positionPnLUsd) : 0;
  const projectedValue = metrics ? convertValue(metrics.projectedPnLUsd) : 0;
  const combinedValue = metrics ? convertValue(metrics.combined) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]">
      <div className="max-w-6xl mx-auto p-6">
        <header className="mb-6 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t.stock.back}
            </Button>
          </Link>
        </header>

        {loading ? (
          <div className="text-center py-20 text-gray-500">{t.common.loading}</div>
        ) : error ? (
          <div className="text-center py-20 text-gray-500">{error}</div>
        ) : !position || !metrics ? (
          <div className="text-center py-20 text-gray-500">{t.dashboard.noPositions}</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 rounded-full border-2 border-white shadow-sm">
                  <AvatarImage src={position.imageUrl} alt={position.display} />
                  <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                    {position.symbol.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-3xl font-bold text-[#0F172A]">{position.display}</h1>
                  <div className="flex items-center gap-2 text-gray-600 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-sm">
                      {position.symbol}
                    </Badge>
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

              <div className="text-right space-y-1">
                <div className="text-sm text-gray-500">{t.stock.priceToday}</div>
                <div className="text-2xl font-semibold text-[#0F172A]">
                  {formatDisplayCurrency(metrics.currentPrice)}
                </div>
                <div
                  className={`text-sm font-medium ${
                    dailyChangeValue === undefined
                      ? 'text-gray-500'
                      : dailyChangeValue >= 0
                        ? 'text-[#4AA956]'
                        : 'text-[#D22E2E]'
                  }`}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white/85 border border-white/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.stock.overview}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>{t.dashboard.quantity}</span>
                    <span className="font-medium text-gray-900">
                      {formatNumber(position.quantity, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.costBasis}</span>
                    <span className="font-medium text-gray-900">
                      {formatDisplayCurrency(position.entryPrice * position.quantity)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.currentValue}</span>
                    <span className="font-medium text-gray-900">
                      {formatDisplayCurrency(metrics.currentValue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.breakEven}</span>
                    <span className="font-medium text-gray-900">
                      {formatDisplayCurrency(metrics.projectedPrice)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/85 border border-white/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.dashboard.performance}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>{t.dashboard.pnl}</span>
                    <span
                      className={`font-medium ${
                        pnlValue >= 0 ? 'text-[#4AA956]' : 'text-[#D22E2E]'
                      }`}
                    >
                      {formatDisplayCurrency(metrics.positionPnLUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.roi}</span>
                    <span className="font-medium text-gray-900">
                      {formatPercent(metrics.roiPercent, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.dashboard.projected}</span>
                    <span
                      className={`font-medium ${
                        projectedValue >= 0 ? 'text-[#4AA956]' : 'text-[#D22E2E]'
                      }`}
                    >
                      {formatDisplayCurrency(metrics.projectedPnLUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.dashboard.combined}</span>
                    <span
                      className={`font-medium ${
                        combinedValue >= 0 ? 'text-[#4AA956]' : 'text-[#D22E2E]'
                      }`}
                    >
                      {formatDisplayCurrency(metrics.combined)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/85 border border-white/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.stock.range}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>{t.stock.open}</span>
                    <span className="font-medium text-gray-900">
                      {quote?.o !== undefined
                        ? formatDisplayCurrency(quote.o)
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.high}</span>
                    <span className="font-medium text-gray-900">
                      {quote?.h !== undefined
                        ? formatDisplayCurrency(quote.h)
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.low}</span>
                    <span className="font-medium text-gray-900">
                      {quote?.l !== undefined
                        ? formatDisplayCurrency(quote.l)
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.previousClose}</span>
                    <span className="font-medium text-gray-900">
                      {quote?.pc !== undefined
                        ? formatDisplayCurrency(quote.pc)
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.stock.volume}</span>
                    <span className="font-medium text-gray-900">
                      {quote?.v !== undefined ? numberFormatter.format(quote.v) : '--'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white/85 border border-white/50 shadow-xl">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.stock.history}
                  </CardTitle>
                  <p className="text-sm text-gray-500">{t.stock.range}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_RANGES.map((option) => (
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
              </CardHeader>
              <CardContent className="h-80">
                {historicalLoading ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-500">
                    {t.common.loading}
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-500">
                    {t.stock.historyUnavailable}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.7} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          formatCurrency(value as number, settings.currency, locale)
                        }
                      />
                      <Tooltip
                        formatter={(value) =>
                          formatCurrency(value as number, settings.currency, locale)
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#3B82F6"
                        fill="url(#priceArea)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
