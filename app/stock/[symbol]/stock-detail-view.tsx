'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ArrowLeft, Activity, RefreshCcw, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BankBadge } from '@/components/branding/bank-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
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
import { DashboardPageShell } from '@/components/dashboard/page-shell';

import { getSupabaseClient } from '@/lib/supabase';
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
import { computeOpenLots, mapPositionRow, summarizeLots } from '@/lib/positions';
import { cn } from '@/lib/utils';
import {
  CandleData,
  HistoricalPoint,
  Position,
  PositionLocation,
  PositionLotType,
  PositionMetrics,
  StockQuote,
  TimeRange,
} from '@/types';

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'All'];
const DAY_SECONDS = 60 * 60 * 24;
const FALLBACK_X_AXIS_DOMAIN: [number | string, number | string] = ['dataMin', 'dataMax'];
const TOOLTIP_CONTAINER_CLASS =
  'w-[min(17rem,calc(100vw-0.75rem))] space-y-3 rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/96 p-3.5 text-[11px] text-[var(--color-slate-700)] shadow-sm sm:w-[230px] sm:max-w-none sm:p-4 sm:text-sm';

function getDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEarliestValidDate(dates: Array<string | undefined>): string | undefined {
  let earliestValue: string | undefined;
  let earliestTimestamp = Number.POSITIVE_INFINITY;

  for (const value of dates) {
    if (!value) {
      continue;
    }

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      continue;
    }

    if (timestamp < earliestTimestamp) {
      earliestTimestamp = timestamp;
      earliestValue = value;
    }
  }

  return Number.isFinite(earliestTimestamp) ? earliestValue : undefined;
}

function combinePositions(positions: Position[]): Position | null {
  if (!positions.length) {
    return null;
  }

  const combinedLots = positions.flatMap((pos) => pos.lots ?? []);
  const summary = combinedLots.length ? summarizeLots(combinedLots) : undefined;

  const fallbackQuantity = positions.reduce((sum, pos) => sum + Math.max(pos.quantity, 0), 0);
  const quantity = summary && summary.totalQuantity > 0 ? summary.totalQuantity : fallbackQuantity;

  const entryPrice = summary && summary.totalQuantity > 0
    ? summary.averageEntryPrice
    : fallbackQuantity > 0
      ? positions.reduce((sum, pos) => sum + pos.entryPrice * Math.max(pos.quantity, 0), 0) /
        fallbackQuantity
      : positions[0].entryPrice;

  const entryDate = summary?.earliestEntryDate
    ?? getEarliestValidDate(positions.map((pos) => pos.entryDate))
    ?? positions[0].entryDate;

  return {
    ...positions[0],
    id: positions.length === 1 ? positions[0].id : undefined,
    entryPrice,
    quantity,
    entryDate,
    location: positions[0].location,
    lots: combinedLots,
  };
}

interface LocationBreakdown {
  location: PositionLocation;
  quantity: number;
  averageEntryPrice: number;
  entryDate?: string;
}

function buildLocationBreakdowns(positions: Position[]): LocationBreakdown[] {
  if (!positions.length) {
    return [];
  }

  const aggregations = new Map<PositionLocation, { quantity: number; cost: number; dates: string[] }>();

  for (const pos of positions) {
    const quantity = Math.max(pos.quantity, 0);
    const cost = pos.entryPrice * quantity;
    const existing = aggregations.get(pos.location);

    if (existing) {
      existing.quantity += quantity;
      existing.cost += cost;
      if (pos.entryDate) {
        existing.dates.push(pos.entryDate);
      }
    } else {
      aggregations.set(pos.location, {
        quantity,
        cost,
        dates: pos.entryDate ? [pos.entryDate] : [],
      });
    }
  }

  return Array.from(aggregations.entries())
    .map(([location, info]) => ({
      location,
      quantity: info.quantity,
      averageEntryPrice: info.quantity > 0 ? info.cost / info.quantity : 0,
      entryDate: getEarliestValidDate(info.dates),
    }))
    .sort((a, b) => {
      if (a.location === b.location) {
        return 0;
      }
      return a.location === 'bank_one' ? -1 : 1;
    });
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
  const fill = isBuy ? 'var(--color-green-300)' : 'var(--color-red-500)';
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
  const withRtlMark = (value: string) => (locale.startsWith('he') ? `\u200F${value}` : value);
  const date = new Date(timestamp);
  if (range === '1D') {
    return withRtlMark(date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
  }
  if (range === '1W') {
    return withRtlMark(date.toLocaleDateString(locale, { weekday: 'short' }));
  }
  if (range === '1M' || range === '3M' || range === '6M') {
    return withRtlMark(date.toLocaleDateString(locale, { month: 'short', day: 'numeric' }));
  }
  return withRtlMark(date.toLocaleDateString(locale, { month: 'short', year: 'numeric' }));
}

function formatTooltipLabel(timestamp: number, range: TimeRange, locale: string) {
  const withRtlMark = (value: string) => (locale.startsWith('he') ? `\u200F${value}` : value);
  const date = new Date(timestamp);
  if (range === '1D') {
    return withRtlMark(date.toLocaleString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }));
  }
  return withRtlMark(date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }));
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
      <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-8 w-56" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-7 w-24 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-7 w-28 rounded-full" />
                </div>
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
            <div className="w-full max-w-none space-y-3 rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/80 p-4 shadow-sm xl:max-w-md">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-2 w-full" />
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80 p-4 shadow-sm">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-9 w-full rounded-full" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>

        <div className="space-y-5 sm:space-y-6">
          <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
            <CardHeader>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-slate-50)] px-4 py-3"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-52" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </CardContent>
          </Card>
        </div>
      </div>
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
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [range, setRange] = useState<TimeRange>('1M');
  const [showVolume, setShowVolume] = useState(true);
  const [historical, setHistorical] = useState<HistoricalPoint[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const position = useMemo(() => combinePositions(positions), [positions]);
  const locationBreakdowns = useMemo(() => buildLocationBreakdowns(positions), [positions]);
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

  const badgeLocations = useMemo<PositionLocation[]>(() => {
    if (locationBreakdowns.length > 0) {
      return locationBreakdowns.map((entry) => entry.location);
    }
    return position ? [position.location] : [];
  }, [locationBreakdowns, position]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseClient();
        const { data, error: positionError } = await supabase
          .from('positions')
          .select('*, position_lots(*)')
          .eq('symbol', normalizedSymbol);

        if (positionError) {
          throw positionError;
        }

        const mappedPositions = (data ?? []).map(mapPositionRow);

        if (!mappedPositions.length) {
          if (!cancelled) {
            setError(locale === 'he' ? 'הפוזיציה לא נמצאה' : 'Position not found');
            setPositions([]);
            setMetrics(null);
            setQuote(null);
          }
          return;
        }

        const combinedPosition = combinePositions(mappedPositions);

        if (!combinedPosition) {
          if (!cancelled) {
            setError(locale === 'he' ? 'הפוזיציה לא נמצאה' : 'Position not found');
            setPositions([]);
            setMetrics(null);
            setQuote(null);
          }
          return;
        }

        if (cancelled) {
          return;
        }

        setPositions(mappedPositions);

        const trimmedToken = settings.finnhubToken?.trim();
        const quoteParams = trimmedToken
          ? new URLSearchParams({
              symbol: normalizedSymbol,
              token: trimmedToken,
            })
          : null;
        if (quoteParams && reloadKey > 0) {
          quoteParams.set('forceRefresh', '1');
        }
        const quoteUrl = quoteParams ? `/api/quote?${quoteParams.toString()}` : null;
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

        const currentPrice = fetchedQuote?.c ?? combinedPosition.entryPrice;
        const dailyChange = fetchedQuote?.d;

        const computedMetrics = calculatePositionMetrics(
          combinedPosition,
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
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{dateLabel}</div>
          {priceEntry && (
            <div className="flex items-center justify-between gap-3 text-[11px] sm:text-sm">
              <span className="text-slate-400">{t.stock.detailView.chartPriceLabel}</span>
              <span className="font-semibold text-slate-900">
                {formatDualCurrency(priceEntry.value as number)}
              </span>
            </div>
          )}
          {showVolume && volumeEntry && (
            <div className="flex items-center justify-between gap-3 text-[11px] sm:text-sm">
              <span className="text-slate-400">{t.stock.detailView.tooltip.volume}</span>
              <span className="font-semibold text-slate-900">{formatVolume(volumeEntry.value as number)}</span>
            </div>
          )}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {t.stock.detailView.tooltip.tradesHeading}
            </div>
            {tradesForDay.length === 0 ? (
              <div className="mt-1 text-[11px] text-slate-500">
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
                      className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700 shadow-sm ring-1 ring-slate-200/70"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span className={isBuy ? 'text-emerald-400' : 'text-rose-400'}>{tradeLabel}</span>
                        <span className="text-slate-500">{timeLabel}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
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
  const avgCostVsNowPercent =
    metrics && metrics.position.entryPrice > 0
      ? ((metrics.currentPrice - metrics.position.entryPrice) / metrics.position.entryPrice) * 100
      : undefined;
  const avgCostVsNowLabel =
    avgCostVsNowPercent !== undefined ? formatPercent(avgCostVsNowPercent, locale) : '--';
  const avgCostVsNowClass =
    avgCostVsNowPercent === undefined
      ? 'text-slate-500'
      : avgCostVsNowPercent >= 0
        ? 'text-emerald-600'
        : 'text-rose-600';
  const profitPerShare = metrics ? metrics.currentPrice - metrics.position.entryPrice : 0;
  const profitPerShareLabel = formatDualCurrency(profitPerShare);
  const profitPerShareClass =
    profitPerShare === 0 ? 'text-slate-600' : profitPerShare > 0 ? 'text-emerald-600' : 'text-rose-600';
  const entryGapPercent = avgCostVsNowPercent;
  const entryGapLabel = entryGapPercent !== undefined ? formatPercent(entryGapPercent, locale) : '--';
  const entryGapClass =
    entryGapPercent === undefined
      ? 'text-slate-500'
      : entryGapPercent >= 0
        ? 'text-emerald-600'
        : 'text-rose-600';
  const entryGapProgress = metrics
    ? Math.min(100, Math.max(24, 50 + Math.min(Math.abs(avgCostVsNowPercent ?? 0), 35)))
    : 50;
  const transactionsCountLabel = formatNumber(transactions.length, locale);
  const openLotsCountLabel = formatNumber(openLots.length, locale);
  const chartRangeLabel = t.timeRange[range];
  const accountCountLabel = formatNumber(locationBreakdowns.length || 1, locale);
  const supportText =
    metrics && entryGapPercent !== undefined
      ? (locale === 'he'
          ? `הפער מול מחיר הכניסה הוא ${entryGapLabel}.`
          : `The gap vs. entry price is ${entryGapLabel}.`)
      : locale === 'he'
        ? 'אין עדיין פער מחיר מחושב.'
        : 'No entry gap is available yet.';

  const quickFacts = metrics
    ? [
        {
          key: 'currentValue',
          label: t.stock.detailView.quickFacts.currentValue,
          value: currentValueDisplay,
        },
        {
          key: 'investedAmount',
          label: t.stock.detailView.quickFacts.investedAmount,
          value: investedAmountDisplay,
        },
        {
          key: 'totalGain',
          label: t.stock.detailView.quickFacts.totalGain,
          value: totalGainDisplay,
          secondary: totalGainPercentLabel,
          accentClass: totalGainClass,
          secondaryClass: totalGainClass,
        },
        {
          key: 'dailyChange',
          label: t.stock.detailView.quickFacts.dailyChange,
          value: dailyChangeDisplay,
          secondary: dailyChangePercentLabel,
          accentClass: dailyChangeClass,
          secondaryClass: dailyChangeClass,
        },
        {
          key: 'holdingTime',
          label: t.stock.detailView.quickFacts.holdingTime,
          value: holdingPeriodLabel,
        },
      ]
    : [];
  const quickFactCards = quickFacts.map((fact) => ({
    ...fact,
    subdued:
      fact.key === 'totalGain'
        ? totalGainUsd >= 0
        : fact.key === 'dailyChange'
          ? dailyChangeValue === undefined
            ? true
            : dailyChangeValue >= 0
          : true,
  }));

  return (
    <DashboardPageShell direction={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="space-y-6 sm:space-y-7">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-4 py-2 text-sm font-medium text-[var(--color-slate-700)] shadow-sm">
              <ArrowLeft className="h-4 w-4 text-[var(--color-primary-600)]" />
              <span className="font-medium">{t.stock.back}</span>
            </div>
            {historicalLoading && (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1.5 text-sm text-[var(--color-slate-600)] shadow-sm sm:self-auto">
                <RefreshCcw className="h-4 w-4 animate-spin" />
                {t.common.loading}
              </div>
            )}
          </header>

          {loading ? (
            <StockDetailSkeleton />
          ) : error ? (
            <Card className="border border-rose-200 bg-rose-50/80 text-rose-700 shadow-sm">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="text-lg font-semibold">{t.stock.detailView.states.error}</div>
                <div className="max-w-xl text-sm leading-6 text-rose-700/90">{error}</div>
                <Button
                  variant="outline"
                  onClick={() => setReloadKey((value) => value + 1)}
                  className="rounded-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                >
                  {t.stock.detailView.states.retry}
                </Button>
              </CardContent>
            </Card>
          ) : !position || !metrics ? (
            <Card className="border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
              <CardContent className="flex items-center justify-center py-20 text-sm text-[var(--color-slate-500)]">
                {t.stock.detailView.states.empty}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5 sm:space-y-6">
              <Card className="relative overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-sm">
                <CardContent className="relative z-10 p-5 sm:p-6 lg:p-7">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                      <Avatar className="h-16 w-16 rounded-full border-2 border-[color:var(--color-slate-200)] shadow-sm">
                        <StockAvatarImage
                          symbol={position.symbol}
                          display={position.display}
                          imageUrl={position.imageUrl}
                        />
                        <AvatarFallback className="bg-blue-100 font-semibold text-blue-600">
                          {position.symbol.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-3">
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                          {locale === 'he' ? 'תצוגת פוזיציה' : 'Position overview'}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h1 className="text-[clamp(2rem,7vw,3.5rem)] font-black tracking-tight text-[var(--color-primary-900)]">
                            {position.display}
                          </h1>
                          <Badge
                            variant="secondary"
                            className="rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--color-primary-700)]"
                          >
                            {position.symbol}
                          </Badge>
                          {badgeLocations.map((bank) => (
                            <BankBadge key={`header-${bank}`} bank={bank} locale={locale} size="sm" />
                          ))}
                        </div>
                        <p className="max-w-2xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                          {locale === 'he'
                            ? 'עמוד המניה מרכז מחיר חי, מסלול היסטורי, פער מול מחיר כניסה וכל העסקאות הרלוונטיות.'
                            : 'Live price, history, entry gap, and transaction context in one focused detail view.'}
                        </p>
                <div className="grid gap-2 text-sm text-[var(--color-slate-600)] sm:grid-cols-2 lg:grid-cols-3">
                          <span className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-2">
                            {t.dashboard.quantity}{' '}
                            <span className="font-semibold text-[var(--color-primary-900)]">
                              {formatNumber(position.quantity, locale)}
                            </span>
                          </span>
                          <span className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-2">
                            {t.dashboard.entryPrice}{' '}
                            <span className="font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(position.entryPrice)}
                            </span>
                          </span>
                          <span className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-2">
                            {t.dashboard.since}{' '}
                            <span className="font-semibold text-[var(--color-primary-900)]">
                              {formatDate(position.entryDate, locale)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full max-w-none rounded-[30px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 p-4 shadow-sm xl:max-w-md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {t.stock.priceToday}
                          </div>
                          <div className="text-[clamp(1.9rem,8vw,2.75rem)] font-semibold text-[var(--color-primary-900)]">
                            {formatUsdCurrency(metrics.currentPrice)}
                          </div>
                        </div>
                        <div className={cn('min-w-0 rounded-2xl px-3 py-2 text-right text-sm font-semibold', dailyChangeClass)}>
                          <div>{dailyChangeDisplay}</div>
                          <div className="text-xs opacity-80">
                            {dailyChangePercent !== undefined ? dailyChangePercentLabel : '--'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80 px-4 py-3">
                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          <span>{locale === 'he' ? 'מחיר כניסה' : 'Entry price'}</span>
                          <span>{locale === 'he' ? 'מחיר נוכחי' : 'Current price'}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-[color:var(--color-slate-200)]/70">
                          <div
                            className={cn(
                              'h-2 rounded-full',
                              profitPerShare >= 0
                                ? 'bg-emerald-500'
                                : 'bg-rose-500'
                            )}
                            style={{ width: `${entryGapProgress}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-slate-500)]">
                          <span>{formatDualCurrency(position.entryPrice)}</span>
                          <span className={entryGapClass}>{entryGapLabel}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--color-slate-500)]">
                          {supportText}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
                <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)] shadow-sm">
                          <Activity className="h-3.5 w-3.5" />
                          <span>{locale === 'he' ? 'תצוגת מצב' : 'Position snapshot'}</span>
                        </div>
                      <CardTitle className="mt-3 text-lg font-semibold text-[var(--color-primary-900)]">
                        {t.stock.detailView.quickFactsTitle}
                      </CardTitle>
                      <p className="text-sm text-[var(--color-slate-600)]">{t.stock.detailView.quickFactsSubtitle}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--color-slate-600)]">
                      <span className="rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1.5 shadow-sm">
                        {locale === 'he' ? 'חשבונות' : 'Accounts'} {accountCountLabel}
                      </span>
                      <span className="rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1.5 shadow-sm">
                        {locale === 'he' ? 'פעולות' : 'Trades'} {transactionsCountLabel}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {quickFactCards.map((fact) => (
                      <div
                        key={fact.key}
                        className={cn(
                          'relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-transform duration-200',
                          fact.subdued
                            ? 'border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90'
                            : 'border-[color:var(--color-emerald-100)]/70 bg-[color:var(--color-emerald-50)]/80'
                        )}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {fact.label}
                        </div>
                        <div className={cn('mt-2 text-lg font-semibold text-[var(--color-primary-900)]', fact.accentClass)}>
                          {fact.value}
                        </div>
                        {fact.secondary && (
                          <div className={cn('text-sm font-medium', fact.secondaryClass)}>
                            {fact.secondary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,2.05fr)_minmax(0,0.95fr)] xl:items-start">
                <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
                  <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                          <CardTitle className="text-lg font-semibold text-[var(--color-primary-900)]">
                            {t.stock.detailView.chartTitle}
                          </CardTitle>
                          <p className="text-sm text-[var(--color-slate-600)]">{t.stock.detailView.chartSubtitle}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-[var(--color-slate-600)]">
                          <span className="rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1.5 shadow-sm">
                            {chartRangeLabel}
                          </span>
                          <span className="rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1.5 shadow-sm">
                            {formatDualCurrency(metrics.currentPrice)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex w-full flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible lg:pb-0">
                          {TIME_RANGES.map((option) => (
                            <Button
                              key={option}
                              variant={range === option ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setRange(option)}
                              disabled={historicalLoading && range === option}
                              className={cn(
                                'min-h-10 shrink-0 rounded-full px-3.5',
                                range === option
                                  ? 'bg-[var(--color-primary-600)] text-white hover:bg-[var(--color-primary-700)]'
                                  : 'border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-[var(--color-slate-700)] hover:border-[color:var(--color-primary-200)] hover:text-[var(--color-primary-700)]'
                              )}
                            >
                              {t.timeRange[option]}
                            </Button>
                          ))}
                        </div>
                        <div className="inline-flex w-full items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-2 text-sm text-[var(--color-slate-700)] shadow-sm sm:w-auto">
                          <Switch checked={showVolume} onCheckedChange={setShowVolume} id="volume-toggle" />
                          <label htmlFor="volume-toggle" className="cursor-pointer">
                            {t.stock.detailView.showVolume}
                          </label>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-6">
                    {historicalLoading ? (
                      <Skeleton className="h-80 w-full rounded-2xl" />
                    ) : chartData.length === 0 ? (
                      <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/90 text-sm text-[var(--color-slate-500)]">
                        {t.stock.historyUnavailable}
                      </div>
                    ) : (
                      <>
                        <div className={cn('w-full min-w-0', showVolume ? 'h-[320px] sm:h-[372px]' : 'h-[280px] sm:h-[312px]')}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 18, right: 12, bottom: 0, left: 2 }}>
                              <defs>
                                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="var(--color-primary-700)" stopOpacity={0.42} />
                                  <stop offset="100%" stopColor="var(--color-primary-400)" stopOpacity={0.05} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                strokeDasharray="4 4"
                                stroke="rgba(var(--color-slate-400-rgb), 0.16)"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="timestamp"
                                type="number"
                                domain={xAxisDomain ?? FALLBACK_X_AXIS_DOMAIN}
                                allowDataOverflow
                                tickLine={false}
                                axisLine={false}
                                tickMargin={10}
                                minTickGap={24}
                                tick={{ fill: 'var(--color-slate-600)', fontSize: 9 }}
                                tickFormatter={(value) => formatAxisLabel(value as number, range, localeCode)}
                              />
                              <YAxis
                                yAxisId="price"
                                domain={priceDomain}
                                width={58}
                                tickLine={false}
                                axisLine={false}
                                tickMargin={6}
                                padding={{ top: 10, bottom: 10 }}
                                tick={{ fill: 'var(--color-slate-600)', fontSize: 9 }}
                                tickFormatter={(value) => formatCurrency(value as number, 'USD', locale)}
                              />
                              <Tooltip
                                cursor={{ stroke: 'rgba(var(--color-primary-500-rgb), 0.25)', strokeWidth: 2 }}
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
                                  barSize={13}
                                  radius={[7, 7, 0, 0]}
                                  fill="rgba(var(--color-primary-400-rgb), 0.18)"
                                />
                              )}
                              <Area
                                type="monotone"
                                dataKey="close"
                                yAxisId="price"
                                stroke="var(--color-primary-700)"
                                strokeWidth={3}
                                activeDot={{ r: 5, fill: 'var(--color-primary-500)', strokeWidth: 0 }}
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
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90 px-4 py-3 text-sm shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'מחיר כניסה' : 'Entry price'}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(position.entryPrice)}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90 px-4 py-3 text-sm shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'מחיר נוכחי' : 'Current price'}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(metrics.currentPrice)}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90 px-4 py-3 text-sm shadow-sm">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'פער מול כניסה' : 'Gap vs entry'}
                            </div>
                            <div className={cn('mt-1 font-semibold', entryGapClass)}>{entryGapLabel}</div>
                          </div>
                        </div>
                        <p className="mt-4 text-xs leading-5 text-[var(--color-slate-500)]">
                          {t.stock.detailView.chartHelper}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
                    <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80">
                      <div className="flex flex-col gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)] shadow-sm">
                          <TrendingUp className="h-3.5 w-3.5" />
                          <span>{locale === 'he' ? 'מצב הפוזיציה' : 'Position pulse'}</span>
                        </div>
                        <CardTitle className="text-lg font-semibold text-[var(--color-primary-900)]">
                          {locale === 'he' ? 'תמונת מצב מדויקת' : 'At-a-glance status'}
                        </CardTitle>
                        <p className="text-sm text-[var(--color-slate-600)]">
                          {locale === 'he'
                            ? 'סיכום קצר של מה שחשוב עכשיו, בלי להעמיס פרטים.'
                            : 'A compact summary of what matters now, without noise.'}
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5 text-sm sm:p-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90 px-4 py-3">
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'רווח למניה' : 'Profit per share'}</span>
                          <span className={cn('font-semibold', profitPerShareClass)}>{profitPerShareLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90 px-4 py-3">
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'פער מול מחיר ממוצע' : 'Move vs avg. cost'}</span>
                          <span className={cn('font-semibold', avgCostVsNowClass)}>{avgCostVsNowLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-slate-50)] px-4 py-3">
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'משך החזקה' : 'Holding period'}</span>
                          <span className="font-semibold text-[var(--color-primary-900)]">{holdingPeriodLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-slate-50)] px-4 py-3">
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'מספר פעולות' : 'Transactions'}</span>
                          <span className="font-semibold text-[var(--color-primary-900)]">{transactionsCountLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[color:var(--color-slate-50)] px-4 py-3">
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'לוטים פתוחים' : 'Open lots'}</span>
                          <span className="font-semibold text-[var(--color-primary-900)]">{openLotsCountLabel}</span>
                        </div>
                      </div>
                      {locationBreakdowns.length > 1 && (
                        <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 p-4">
                          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'פיזור לפי חשבון' : 'By account'}
                          </div>
                          <div className="space-y-2">
                            {locationBreakdowns.map((breakdown) => (
                              <div
                                key={`${breakdown.location}-breakdown`}
                                className="flex items-center justify-between gap-3 text-sm"
                              >
                                <span className="inline-flex items-center gap-2 text-[var(--color-slate-700)]">
                                  <BankBadge bank={breakdown.location} locale={locale} size="sm" />
                                  {breakdown.location === 'bank_two' ? t.positions.bankTwo : t.positions.bankOne}
                                </span>
                                <span className="text-[var(--color-slate-600)]">
                                  {formatNumber(breakdown.quantity, locale)} · {formatDualCurrency(breakdown.averageEntryPrice)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
                    <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80">
                      <CardTitle className="text-lg font-semibold text-[var(--color-primary-900)]">
                        {locale === 'he' ? 'אות אנליטי' : 'Analysis signal'}
                      </CardTitle>
                      <p className="text-sm text-[var(--color-slate-600)]">
                        {locale === 'he'
                          ? 'תוספת עדינה שמדגישה את איכות האחזקה בלי להסיח את הדעת.'
                          : 'A quiet addon that highlights position quality without visual clutter.'}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5 sm:p-6">
                      <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/90 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-[var(--color-slate-600)]">
                            {locale === 'he' ? 'מצב מול מחיר כניסה' : 'Entry relationship'}
                          </span>
                          <span className={cn('text-sm font-semibold', entryGapClass)}>{entryGapLabel}</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-[color:var(--color-slate-200)]/70">
                          <div
                            className={cn(
                              'h-2 rounded-full',
                              entryGapPercent !== undefined && entryGapPercent >= 0
                                ? 'bg-emerald-500'
                                : 'bg-rose-500'
                            )}
                            style={{
                              width: `${entryGapProgress}%`,
                            }}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-slate-500)]">
                          <span>{formatDualCurrency(position.entryPrice)}</span>
                          <span>{formatDualCurrency(metrics.currentPrice)}</span>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl bg-[color:var(--color-slate-50)]/90 px-4 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'סה״כ פוזיציה' : 'Position value'}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[var(--color-primary-900)]">
                            {currentValueDisplay}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-[color:var(--color-slate-50)]/90 px-4 py-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'השקעה' : 'Invested'}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[var(--color-primary-900)]">
                            {investedAmountDisplay}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card className="overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm">
                <CardHeader className="flex flex-col gap-3 border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/80 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-[var(--color-primary-900)]">
                      {t.positions.transactionsTitle}
                    </CardTitle>
                    <p className="text-sm text-[var(--color-slate-600)]">{t.stock.detailView.transactionsHelper}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {openLots.length > 0 ? (
                      <div className="rounded-full border border-emerald-100 bg-emerald-50/90 px-3 py-2 text-sm font-medium text-emerald-800">
                        {locale === 'he'
                          ? `לוטים פתוחים: ${openLotsCountLabel}`
                          : `Open lots: ${openLotsCountLabel}`}
                      </div>
                    ) : (
                      <div className="rounded-full border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-3 py-2 text-xs text-[var(--color-slate-500)]">
                        {t.positions.noTransactions}
                      </div>
                    )}
                    <div className="rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/90 px-3 py-2 text-xs text-[var(--color-slate-600)] shadow-sm">
                      {locale === 'he' ? 'מספר חשבונות:' : 'Accounts:'} {accountCountLabel}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 text-sm text-[var(--color-slate-600)] sm:p-6">
                  {transactions.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/95">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[color:var(--color-slate-50)]/80">
                            <TableHead>{t.positions.transactionType}</TableHead>
                            <TableHead className="text-right">{t.positions.transactionQuantity}</TableHead>
                            <TableHead className="text-right">{t.positions.transactionPrice}</TableHead>
                            <TableHead className="text-right">{t.positions.transactionCommission}</TableHead>
                            <TableHead className="text-right">{t.positions.transactionDate}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((lot) => {
                            const badgeTone =
                              lot.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
                            const label = lot.type === 'BUY' ? t.positions.buy : t.positions.sell;
                            return (
                              <TableRow key={`${lot.id}-${lot.executedAt}`} className="hover:bg-[color:var(--color-slate-50)]/70">
                                <TableCell>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>
                                    {label}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatNumber(lot.quantity, locale)}
                                </TableCell>
                                <TableCell className="text-right">{formatDualCurrency(lot.price)}</TableCell>
                                <TableCell className="text-right text-xs text-[var(--color-slate-500)]">
                                  {lot.hasCommission && lot.commissionAmount > 0
                                    ? t.positions.transactionCommissionShort(
                                        formatDualCurrency(lot.commissionAmount),
                                      )
                                    : t.positions.transactionCommissionWaived}
                                </TableCell>
                                <TableCell className="text-right text-xs text-[var(--color-slate-500)]">
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
            </div>
          )}
        </div>
      </div>
    </DashboardPageShell>
  );
}
