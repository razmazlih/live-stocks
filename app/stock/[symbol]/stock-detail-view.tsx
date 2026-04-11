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
import {
  getStockDetailRangeParams,
  STOCK_DETAIL_TIME_RANGES,
} from '@/lib/market/range-params';
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

const FALLBACK_X_AXIS_DOMAIN: [number | string, number | string] = ['dataMin', 'dataMax'];
const TOOLTIP_CONTAINER_CLASS =
  'viz-tooltip-shell w-[min(17rem,calc(100vw-0.75rem))] space-y-2.5 rounded-[1.45rem] p-3 text-[10px] text-[var(--color-slate-700)] sm:w-[270px] sm:max-w-none sm:space-y-3 sm:p-4 sm:text-sm';
const DETAIL_PANEL_CLASS =
  'relative overflow-hidden border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_22px_44px_-30px_rgba(15,23,42,0.22)] backdrop-blur-sm';
const DETAIL_PANEL_HEADER_CLASS =
  'border-b border-[color:var(--color-slate-200)]/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.82))]';
const DETAIL_MICRO_CHIP_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 px-3 py-1.5 text-xs font-medium text-[var(--color-slate-600)] shadow-sm';
const DETAIL_INFO_TILE_CLASS =
  'rounded-[1.35rem] border border-[color:var(--color-slate-200)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.94))] px-4 py-3 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.28)]';
const CHART_CONTROL_SHELL_CLASS =
  'viz-panel rounded-[1.45rem] border-[color:var(--color-slate-200)]/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,245,249,0.88))] shadow-[0_18px_34px_-30px_rgba(15,23,42,0.28)]';
const CHART_SURFACE_CLASS =
  'viz-panel viz-panel-strong rounded-[1.9rem] p-2.5 sm:p-4';
const CHART_LEGEND_PILL_CLASS =
  'viz-chip px-2.5 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-[11px]';

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
  const tone = isBuy
    ? {
        core: 'var(--color-green-500)',
        glow: 'rgba(16,185,129,0.2)',
        ring: 'rgba(5,150,105,0.42)',
      }
    : {
        core: 'var(--color-red-500)',
        glow: 'rgba(244,63,94,0.22)',
        ring: 'rgba(225,29,72,0.42)',
      };
  const arrowPath = isBuy
    ? 'M 0 -4.4 L 4.4 0.7 L 1.85 0.7 L 1.85 4.8 L -1.85 4.8 L -1.85 0.7 L -4.4 0.7 Z'
    : 'M 0 4.4 L 4.4 -0.7 L 1.85 -0.7 L 1.85 -4.8 L -1.85 -4.8 L -1.85 -0.7 L -4.4 -0.7 Z';

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={11} fill={tone.glow} />
      <circle r={8.1} fill="rgba(255,255,255,0.96)" stroke={tone.ring} strokeWidth={1.1} />
      <circle r={6.2} fill={tone.core} />
      <path d={arrowPath} fill="white" />
      <circle r={1.2} fill="rgba(255,255,255,0.7)" />
    </g>
  );
}

type CandleResponse = CandleData & { error?: string };
type QuoteResponse = StockQuote & { error?: string };

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
      <Card className={DETAIL_PANEL_CLASS}>
        <CardContent className="relative p-5 sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.65),rgba(16,185,129,0.3),rgba(59,130,246,0))]" />
          <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16),transparent_72%)] blur-3xl" />
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <Skeleton className="h-20 w-20 rounded-[1.75rem]" />
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-10 w-56" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-7 w-24 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-7 w-28 rounded-full" />
                </div>
                <Skeleton className="h-4 w-72" />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Skeleton className="h-12 rounded-2xl" />
                  <Skeleton className="h-12 rounded-2xl" />
                  <Skeleton className="h-12 rounded-2xl" />
                </div>
              </div>
            </div>
            <div className="w-full max-w-none space-y-3 rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.88))] p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)] xl:max-w-md">
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

      <Card className={DETAIL_PANEL_CLASS}>
        <CardHeader className={DETAIL_PANEL_HEADER_CLASS}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={`${DETAIL_INFO_TILE_CLASS} space-y-2`}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className={DETAIL_PANEL_CLASS}>
          <CardHeader className={DETAIL_PANEL_HEADER_CLASS}>
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
          <Card className={DETAIL_PANEL_CLASS}>
            <CardHeader className={DETAIL_PANEL_HEADER_CLASS}>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className={`${DETAIL_INFO_TILE_CLASS} flex items-center justify-between gap-3`}
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className={DETAIL_PANEL_CLASS}>
            <CardHeader className={DETAIL_PANEL_HEADER_CLASS}>
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
        const { from, resolution } = getStockDetailRangeParams(selectedRange, entryDate);

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
    const { from } = getStockDetailRangeParams(range, position?.entryDate);
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
      const priceValue = priceEntry ? formatDualCurrency(priceEntry.value as number) : '--';
      const tradeCountLabel = formatNumber(tradesForDay.length, locale);

      return (
        <div className={TOOLTIP_CONTAINER_CLASS}>
          <div className="viz-panel rounded-[1.2rem] p-2.5 sm:p-3">
            <div className="flex items-start justify-between gap-3">
              <div className={cn('min-w-0', isRtl ? 'text-right' : 'text-left')}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                  {dateLabel}
                </div>
                <div className="mt-2 text-[1.15rem] font-black tracking-tight text-[var(--color-primary-900)]">
                  {priceValue}
                </div>
                <div className="mt-1 text-[11px] text-[var(--color-slate-500)]">
                  {t.stock.detailView.chartPriceLabel}
                </div>
              </div>
              {showVolume && volumeEntry ? (
                <div className={cn('shrink-0 rounded-[1rem] border border-[color:var(--color-slate-200)]/80 bg-white/88 px-2.5 py-2 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.32)]', isRtl ? 'text-right' : 'text-left')}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-500)]">
                    {t.stock.detailView.tooltip.volume}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--color-primary-900)]">
                    {formatVolume(volumeEntry.value as number)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="viz-chart-surface rounded-[1.2rem] p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                {t.stock.detailView.tooltip.tradesHeading}
              </div>
              <span className="viz-chip viz-chip-blue px-2.5 py-1 text-[10px]">
                {tradeCountLabel}
              </span>
            </div>
            {tradesForDay.length === 0 ? (
              <div className="mt-2 rounded-[1rem] border border-dashed border-[color:var(--color-slate-200)]/85 bg-[color:var(--color-slate-50)]/72 px-3 py-2.5 text-[11px] text-[var(--color-slate-500)]">
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
                      className={cn(
                        'rounded-[1rem] border px-3 py-2.5 text-[11px] leading-5 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.28)]',
                        isBuy
                          ? 'border-emerald-100/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.9),rgba(255,255,255,0.96))] text-emerald-900'
                          : 'border-rose-100/90 bg-[linear-gradient(180deg,rgba(255,241,242,0.9),rgba(255,255,255,0.96))] text-rose-900'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <span className={cn('h-2.5 w-2.5 rounded-full', isBuy ? 'bg-emerald-500' : 'bg-rose-500')} />
                          <span>{tradeLabel}</span>
                        </span>
                        <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[var(--color-slate-500)] shadow-sm">
                          {timeLabel}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--color-slate-600)]">
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
    [formatDualCurrency, formatVolume, isRtl, locale, localeCode, range, showVolume, t, tradesByDay]
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
  const chartTone = dailyChangeValue === undefined
    ? {
        accentText: 'text-slate-600',
        chip: 'viz-chip-blue text-[var(--color-slate-600)]',
        panel:
          'viz-panel border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.96))] text-[var(--color-slate-700)]',
        dot: 'bg-[var(--color-slate-400)]',
      }
    : dailyChangeValue >= 0
      ? {
          accentText: 'text-emerald-700',
          chip: 'viz-chip-emerald text-emerald-700',
          panel:
            'viz-panel border-emerald-200/75 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.96))] text-emerald-700',
          dot: 'bg-emerald-500',
        }
      : {
          accentText: 'text-rose-700',
          chip: 'viz-chip-rose text-rose-700',
          panel:
            'viz-panel border-rose-200/75 bg-[linear-gradient(180deg,rgba(255,241,242,0.92),rgba(255,255,255,0.96))] text-rose-700',
          dot: 'bg-rose-500',
        };
  const volumeStateLabel = showVolume
    ? locale === 'he'
      ? 'פעיל'
      : 'On'
    : locale === 'he'
      ? 'כבוי'
      : 'Off';
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
      <div className="dashboard-page-container">
        <div className="space-y-6 sm:space-y-7">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] px-3.5 py-2 text-sm font-medium text-[var(--color-slate-700)] shadow-[0_14px_30px_-22px_rgba(15,23,42,0.28)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-primary-050)] text-[var(--color-primary-600)]">
                <ArrowLeft className="h-4 w-4" />
              </span>
              <span className="font-medium">{t.stock.back}</span>
            </div>
            {historicalLoading && (
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-3.5 py-1.5 text-sm text-[var(--color-slate-600)] shadow-[0_14px_30px_-22px_rgba(15,23,42,0.24)] sm:self-auto">
                <RefreshCcw className="h-4 w-4 animate-spin" />
                {t.common.loading}
              </div>
            )}
          </header>

          {loading ? (
            <StockDetailSkeleton />
          ) : error ? (
            <Card className="overflow-hidden border border-rose-200/90 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,255,255,0.92))] text-rose-700 shadow-[0_22px_40px_-28px_rgba(225,29,72,0.28)]">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-rose-200 bg-white/85 text-rose-600 shadow-sm">
                  <RefreshCcw className="h-5 w-5" />
                </div>
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
            <Card className={DETAIL_PANEL_CLASS}>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-[var(--color-slate-500)]">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] text-[var(--color-primary-600)] shadow-sm">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span>{t.stock.detailView.states.empty}</span>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5 sm:space-y-6">
              <Card className={`${DETAIL_PANEL_CLASS} ring-1 ring-[rgba(255,255,255,0.6)]`}>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.7),rgba(16,185,129,0.34),rgba(59,130,246,0))]" />
                <div className="pointer-events-none absolute -left-20 top-12 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.12),transparent_72%)] blur-3xl" />
                <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.12),transparent_72%)] blur-3xl" />
                <CardContent className="relative z-10 p-5 sm:p-6 lg:p-7">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                      <Avatar className="h-20 w-20 rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-white shadow-[0_20px_34px_-24px_rgba(15,23,42,0.3)]">
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
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-primary-100)]/90 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.85))] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)] shadow-sm">
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
                        <div className="grid gap-3 text-sm text-[var(--color-slate-600)] sm:grid-cols-2 lg:grid-cols-3">
                          <div className={DETAIL_INFO_TILE_CLASS}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {t.dashboard.quantity}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatNumber(position.quantity, locale)}
                            </div>
                          </div>
                          <div className={DETAIL_INFO_TILE_CLASS}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {t.dashboard.entryPrice}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(position.entryPrice)}
                            </div>
                          </div>
                          <div className={DETAIL_INFO_TILE_CLASS}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {t.dashboard.since}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatDate(position.entryDate, locale)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full max-w-none rounded-[30px] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.9))] p-4 shadow-[0_20px_38px_-28px_rgba(15,23,42,0.28)] xl:max-w-md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {t.stock.priceToday}
                          </div>
                          <div className="text-[clamp(1.95rem,8vw,2.85rem)] font-black tracking-tight text-[var(--color-primary-900)]">
                            {formatUsdCurrency(metrics.currentPrice)}
                          </div>
                        </div>
                        <div className={cn('min-w-0 rounded-2xl border px-3 py-2 text-right text-sm font-semibold shadow-sm', dailyChangeClass)}>
                          <div>{dailyChangeDisplay}</div>
                          <div className="text-xs opacity-80">
                            {dailyChangePercent !== undefined ? dailyChangePercentLabel : '--'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(248,250,252,0.94))] px-4 py-3">
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
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className={DETAIL_INFO_TILE_CLASS}>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'שווי נוכחי' : 'Current value'}
                          </div>
                          <div className="mt-1 font-semibold text-[var(--color-primary-900)]">{currentValueDisplay}</div>
                        </div>
                        <div className={DETAIL_INFO_TILE_CLASS}>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'השקעה' : 'Invested'}
                          </div>
                          <div className="mt-1 font-semibold text-[var(--color-primary-900)]">{investedAmountDisplay}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={DETAIL_PANEL_CLASS}>
                <CardHeader className={`${DETAIL_PANEL_HEADER_CLASS} px-5 py-5 sm:px-6`}>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)] shadow-sm">
                        <Activity className="h-3.5 w-3.5" />
                        <span>{locale === 'he' ? 'תצוגת מצב' : 'Position snapshot'}</span>
                      </div>
                      <CardTitle className="mt-3 text-lg font-semibold text-[var(--color-primary-900)]">
                        {t.stock.detailView.quickFactsTitle}
                      </CardTitle>
                      <p className="text-sm text-[var(--color-slate-600)]">{t.stock.detailView.quickFactsSubtitle}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--color-slate-600)]">
                      <span className={DETAIL_MICRO_CHIP_CLASS}>
                        {locale === 'he' ? 'חשבונות' : 'Accounts'} {accountCountLabel}
                      </span>
                      <span className={DETAIL_MICRO_CHIP_CLASS}>
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
                          'relative overflow-hidden rounded-[1.4rem] border p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.26)] transition-transform duration-200',
                          fact.subdued
                            ? 'border-[color:var(--color-slate-200)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.94))]'
                            : 'border-[color:var(--color-emerald-100)]/75 bg-[linear-gradient(180deg,rgba(236,253,245,0.86),rgba(255,255,255,0.92))]'
                        )}
                      >
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.52),rgba(16,185,129,0.48),rgba(59,130,246,0))]" />
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {fact.label}
                        </div>
                        <div className={cn('mt-2 text-[1.15rem] font-semibold tracking-tight text-[var(--color-primary-900)]', fact.accentClass)}>
                          {fact.value}
                        </div>
                        {fact.secondary && (
                          <div className={cn('mt-1 text-sm font-medium', fact.secondaryClass)}>
                            {fact.secondary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,2.05fr)_minmax(0,0.95fr)] xl:items-start">
                <Card className={`${DETAIL_PANEL_CLASS} ring-1 ring-[rgba(255,255,255,0.62)]`}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.82),rgba(16,185,129,0.46),rgba(59,130,246,0))]" />
                  <div className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.14),transparent_70%)] blur-3xl" />
                  <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.12),transparent_72%)] blur-3xl" />
                  <CardHeader className={`${DETAIL_PANEL_HEADER_CLASS} relative z-10 px-4 py-4 sm:px-6 sm:py-5`}>
                    <div className="flex flex-col gap-3.5 sm:gap-4">
                      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start xl:justify-between">
                        <div className={cn('min-w-0 space-y-2.5', isRtl ? 'text-right' : 'text-left')}>
                          <div className="viz-chip viz-chip-blue max-w-full px-3 py-1 text-xs uppercase tracking-[0.18em]">
                            <Activity className="h-3.5 w-3.5" />
                            <span>{locale === 'he' ? 'מסלול מחיר' : 'Price path'}</span>
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-lg font-semibold text-[var(--color-primary-900)]">
                              {t.stock.detailView.chartTitle}
                            </CardTitle>
                            <p className="mt-1 text-sm text-[var(--color-slate-600)]">{t.stock.detailView.chartSubtitle}</p>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[18rem]">
                          <div className={cn('viz-panel rounded-[1.15rem] px-3 py-2.5 sm:px-3.5 sm:py-3', isRtl ? 'text-right' : 'text-left')}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'מחיר חי' : 'Live price'}
                            </div>
                            <div className="mt-1 text-base font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(metrics.currentPrice)}
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--color-slate-500)]">{chartRangeLabel}</div>
                          </div>
                          <div className={cn('rounded-[1.15rem] px-3 py-2.5 shadow-[0_18px_32px_-28px_rgba(15,23,42,0.34)] sm:px-3.5 sm:py-3', chartTone.panel, isRtl ? 'text-right' : 'text-left')}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                                {t.stock.detailView.quickFacts.dailyChange}
                              </div>
                              <span className={cn('h-2.5 w-2.5 rounded-full', chartTone.dot)} />
                            </div>
                            <div className={cn('mt-1 text-base font-semibold', chartTone.accentText)}>
                              {dailyChangeDisplay}
                            </div>
                            <div className="mt-1 text-[11px] opacity-80">
                              {dailyChangePercent !== undefined ? dailyChangePercentLabel : '--'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2.5 sm:gap-3 lg:flex-row lg:items-stretch lg:justify-between">
                        <div className={`${CHART_CONTROL_SHELL_CLASS} w-full p-1 sm:p-1.5`}>
                          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.9),rgba(255,255,255,0))]" />
                          <div className="flex w-full flex-nowrap gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:gap-2 lg:flex-wrap lg:overflow-visible">
                            {STOCK_DETAIL_TIME_RANGES.map((option) => (
                              <Button
                                key={option}
                                variant={range === option ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setRange(option)}
                                disabled={historicalLoading && range === option}
                                className={cn(
                                  'min-h-9 shrink-0 rounded-[0.95rem] border-0 px-3 text-[12px] font-semibold transition-all duration-200 sm:min-h-10 sm:px-3.5 sm:text-sm',
                                  range === option
                                    ? 'bg-[linear-gradient(135deg,var(--color-primary-700),var(--color-primary-500))] text-white shadow-[0_18px_30px_-20px_rgba(37,99,235,0.72)] hover:brightness-[1.03]'
                                    : 'bg-white/82 text-[var(--color-slate-600)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] hover:bg-white hover:text-[var(--color-primary-700)]'
                                )}
                              >
                                {t.timeRange[option]}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className={`${CHART_CONTROL_SHELL_CLASS} inline-flex w-full items-center justify-between gap-3 px-3 py-2.5 sm:w-auto sm:min-w-[15rem] sm:px-3.5 sm:py-3`}>
                          <div className={cn('min-w-0', isRtl ? 'text-right' : 'text-left')}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'שכבה' : 'Layer'}
                            </div>
                            <label htmlFor="volume-toggle" className="mt-1 block cursor-pointer text-sm font-semibold text-[var(--color-primary-900)]">
                              {t.stock.detailView.showVolume}
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('viz-chip px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]', chartTone.chip)}>
                              {volumeStateLabel}
                            </span>
                            <Switch checked={showVolume} onCheckedChange={setShowVolume} id="volume-toggle" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-10 p-5 sm:p-6">
                    {historicalLoading ? (
                      <Skeleton className="h-80 w-full rounded-2xl" />
                    ) : chartData.length === 0 ? (
                      <div className="flex h-80 items-center justify-center rounded-[1.6rem] border border-dashed border-[color:var(--color-slate-200)] bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.9))] text-sm text-[var(--color-slate-500)]">
                        {t.stock.historyUnavailable}
                      </div>
                    ) : (
                      <>
                        <div className={CHART_SURFACE_CLASS}>
                          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.92),rgba(255,255,255,0))]" />
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.46),rgba(255,255,255,0))]" />
                          <div className="mb-2.5 flex flex-wrap gap-1.5 sm:mb-3 sm:gap-2">
                            <span className={CHART_LEGEND_PILL_CLASS}>
                              <span className="viz-dot h-2.5 w-2.5 bg-[var(--color-primary-600)]" />
                              {t.stock.detailView.chartPriceLabel}
                            </span>
                            {showVolume && (
                              <span className={CHART_LEGEND_PILL_CLASS}>
                                <span className="viz-dot h-2.5 w-2.5 bg-sky-400" />
                                {t.stock.detailView.tooltip.volume}
                              </span>
                            )}
                            {tradeMarkers.length > 0 && (
                              <span className={CHART_LEGEND_PILL_CLASS}>
                                <span className="viz-dot h-2.5 w-2.5 bg-emerald-500" />
                                {t.stock.detailView.tradeMarkers.seriesLabel}
                              </span>
                            )}
                            <span className={cn(CHART_LEGEND_PILL_CLASS, chartTone.chip)}>
                              {chartRangeLabel}
                            </span>
                          </div>
                          <div
                            className={cn(
                              'viz-chart-surface viz-grid-soft w-full min-w-0 rounded-[1.55rem] p-2.5 sm:p-3',
                              showVolume ? 'h-[304px] sm:h-[380px]' : 'h-[272px] sm:h-[320px]'
                            )}
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={chartData} margin={{ top: 24, right: 18, bottom: 6, left: 6 }}>
                                <defs>
                                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgba(var(--color-primary-700-rgb), 0.36)" />
                                    <stop offset="55%" stopColor="rgba(var(--color-primary-500-rgb), 0.14)" />
                                    <stop offset="100%" stopColor="rgba(var(--color-primary-500-rgb), 0.02)" />
                                  </linearGradient>
                                  <linearGradient id="priceStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="var(--color-primary-700)" />
                                    <stop offset="100%" stopColor="var(--color-primary-500)" />
                                  </linearGradient>
                                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgba(56,189,248,0.42)" />
                                    <stop offset="100%" stopColor="rgba(59,130,246,0.08)" />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid
                                  strokeDasharray="2 9"
                                  stroke="rgba(var(--color-slate-400-rgb), 0.18)"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey="timestamp"
                                  type="number"
                                  domain={xAxisDomain ?? FALLBACK_X_AXIS_DOMAIN}
                                  allowDataOverflow
                                  tickLine={false}
                                  axisLine={false}
                                  tickMargin={12}
                                  minTickGap={30}
                                  tick={{ fill: 'var(--color-slate-500)', fontSize: 10, fontWeight: 600 }}
                                  tickFormatter={(value) => formatAxisLabel(value as number, range, localeCode)}
                                />
                                <YAxis
                                  yAxisId="price"
                                  domain={priceDomain}
                                  width={64}
                                  tickLine={false}
                                  axisLine={false}
                                  tickMargin={8}
                                  padding={{ top: 12, bottom: 12 }}
                                  tick={{ fill: 'var(--color-slate-500)', fontSize: 10, fontWeight: 600 }}
                                  tickFormatter={(value) => formatCurrency(value as number, 'USD', locale)}
                                />
                                <Tooltip
                                  cursor={{
                                    stroke: 'rgba(var(--color-primary-600-rgb), 0.38)',
                                    strokeWidth: 1.3,
                                    strokeDasharray: '4 6',
                                  }}
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
                                    barSize={12}
                                    radius={[999, 999, 4, 4]}
                                    fill="url(#volumeGradient)"
                                  />
                                )}
                                <Area
                                  type="monotone"
                                  dataKey="close"
                                  yAxisId="price"
                                  stroke="url(#priceStrokeGradient)"
                                  strokeWidth={3.25}
                                  activeDot={{
                                    r: 5.5,
                                    fill: 'white',
                                    stroke: 'var(--color-primary-600)',
                                    strokeWidth: 2,
                                  }}
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
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className={`${DETAIL_INFO_TILE_CLASS} text-sm`}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'מחיר כניסה' : 'Entry price'}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(position.entryPrice)}
                            </div>
                          </div>
                          <div className={`${DETAIL_INFO_TILE_CLASS} text-sm`}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'מחיר נוכחי' : 'Current price'}
                            </div>
                            <div className="mt-1 font-semibold text-[var(--color-primary-900)]">
                              {formatDualCurrency(metrics.currentPrice)}
                            </div>
                          </div>
                          <div className={`${DETAIL_INFO_TILE_CLASS} text-sm`}>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {locale === 'he' ? 'פער מול כניסה' : 'Gap vs entry'}
                            </div>
                            <div className={cn('mt-1 font-semibold', entryGapClass)}>{entryGapLabel}</div>
                          </div>
                        </div>
                        <p className="mt-4 rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/65 px-4 py-3 text-xs leading-5 text-[var(--color-slate-500)]">
                          {t.stock.detailView.chartHelper}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className={DETAIL_PANEL_CLASS}>
                    <CardHeader className={DETAIL_PANEL_HEADER_CLASS}>
                      <div className="flex flex-col gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)] shadow-sm">
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
                        <div className={`${DETAIL_INFO_TILE_CLASS} flex items-center justify-between gap-3`}>
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'רווח למניה' : 'Profit per share'}</span>
                          <span className={cn('font-semibold', profitPerShareClass)}>{profitPerShareLabel}</span>
                        </div>
                        <div className={`${DETAIL_INFO_TILE_CLASS} flex items-center justify-between gap-3`}>
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'פער מול מחיר ממוצע' : 'Move vs avg. cost'}</span>
                          <span className={cn('font-semibold', avgCostVsNowClass)}>{avgCostVsNowLabel}</span>
                        </div>
                        <div className={`${DETAIL_INFO_TILE_CLASS} flex items-center justify-between gap-3`}>
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'משך החזקה' : 'Holding period'}</span>
                          <span className="font-semibold text-[var(--color-primary-900)]">{holdingPeriodLabel}</span>
                        </div>
                        <div className={`${DETAIL_INFO_TILE_CLASS} flex items-center justify-between gap-3`}>
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'מספר פעולות' : 'Transactions'}</span>
                          <span className="font-semibold text-[var(--color-primary-900)]">{transactionsCountLabel}</span>
                        </div>
                        <div className={`${DETAIL_INFO_TILE_CLASS} flex items-center justify-between gap-3`}>
                          <span className="text-[var(--color-slate-500)]">{locale === 'he' ? 'לוטים פתוחים' : 'Open lots'}</span>
                          <span className="font-semibold text-[var(--color-primary-900)]">{openLotsCountLabel}</span>
                        </div>
                      </div>
                      {locationBreakdowns.length > 1 && (
                        <div className="rounded-[1.4rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.94))] p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.2)]">
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

                  <Card className={DETAIL_PANEL_CLASS}>
                    <CardHeader className={DETAIL_PANEL_HEADER_CLASS}>
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
                      <div className="rounded-[1.4rem] border border-[color:var(--color-slate-200)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.94))] p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.22)]">
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
                        <div className={DETAIL_INFO_TILE_CLASS}>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'סה״כ פוזיציה' : 'Position value'}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[var(--color-primary-900)]">
                            {currentValueDisplay}
                          </div>
                        </div>
                        <div className={DETAIL_INFO_TILE_CLASS}>
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

              <Card className={DETAIL_PANEL_CLASS}>
                <CardHeader className={`flex flex-col gap-3 ${DETAIL_PANEL_HEADER_CLASS} md:flex-row md:items-center md:justify-between`}>
                  <div>
                    <CardTitle className="text-lg font-semibold text-[var(--color-primary-900)]">
                      {t.positions.transactionsTitle}
                    </CardTitle>
                    <p className="text-sm text-[var(--color-slate-600)]">{t.stock.detailView.transactionsHelper}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {openLots.length > 0 ? (
                      <div className="rounded-full border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.9),rgba(255,255,255,0.86))] px-3 py-2 text-sm font-medium text-emerald-800 shadow-sm">
                        {locale === 'he'
                          ? `לוטים פתוחים: ${openLotsCountLabel}`
                          : `Open lots: ${openLotsCountLabel}`}
                      </div>
                    ) : (
                      <div className="rounded-full border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)] px-3 py-2 text-xs text-[var(--color-slate-500)]">
                        {t.positions.noTransactions}
                      </div>
                    )}
                    <div className={DETAIL_MICRO_CHIP_CLASS}>
                      {locale === 'he' ? 'מספר חשבונות:' : 'Accounts:'} {accountCountLabel}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 text-sm text-[var(--color-slate-600)] sm:p-6">
                  {transactions.length > 0 && (
                    <div className="overflow-x-auto rounded-[1.5rem] border border-[color:var(--color-slate-200)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.95))] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
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
