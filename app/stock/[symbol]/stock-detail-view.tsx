'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useUrlState } from '@/hooks/use-url-state';
import { validateReturnTo } from '@/lib/navigation-context';
import { createAppRouteItems } from '@/components/dashboard/navigation';
import {
  ArrowLeft,
  DollarSign,
  RefreshCcw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BankBadge } from '@/components/branding/bank-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { Sparkline, SparklineEvent } from '@/components/charts/sparkline';

import { getSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { STOCK_DETAIL_TIME_RANGES } from '@/lib/display/time-ranges';
import {
  calculatePositionMetrics,
  calculateRequiredExitPrice,
  hasMaterialExitPriceGap,
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
  PositionMetrics,
  StockQuote,
  TimeRange,
} from '@/types';

const DAY_SECONDS = 60 * 60 * 24;

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
      const entryTimestamp = entryDate ? Math.floor(new Date(entryDate).getTime() / 1000) : Number.NaN;
      const startTimestamp = Number.isFinite(entryTimestamp) ? entryTimestamp : defaultRange;
      const clamped = Math.min(startTimestamp, now - DAY_SECONDS);
      return { from: clamped, resolution: 'W' };
    }
    default:
      return { from: now - 30 * DAY_SECONDS, resolution: 'D' };
  }
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-slate-100 bg-[color:var(--color-neutral-white)]/60 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
      <Card className="bg-[color:var(--color-neutral-white)]/70 border border-[color:var(--color-neutral-white)]/50 shadow">
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

  const [routeState, patchParams] = useUrlState((params) => ({
    returnTo: validateReturnTo(params.get('returnTo')),
    range: STOCK_DETAIL_TIME_RANGES.includes(params.get('range') as TimeRange)
      ? params.get('range') as TimeRange : 'All' as TimeRange,
  }));
  const { returnTo, range } = routeState;
  const sourceRoute = createAppRouteItems(t).find((route) => route.href === returnTo.split('?')[0]);
  const loadedSymbol = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [historicalError, setHistoricalError] = useState(false);
  const [displayedRange, setDisplayedRange] = useState<TimeRange | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics | null>(null);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [usdToIls, setUsdToIls] = useState(3.7);
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
      const initialLoad = loadedSymbol.current !== normalizedSymbol;
      setLoading(initialLoad);
      setRefreshing(!initialLoad);
      setError(null);
      if (initialLoad) {
        setPositions([]);
        setMetrics(null);
        setQuote(null);
        setLastUpdated(null);
        setHistorical([]);
        setDisplayedRange(null);
      }

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
            } else if (loadedSymbol.current === normalizedSymbol) {
              throw new Error(quoteData.error || 'Quote unavailable');
            } else if (quoteData.error) {
              console.warn('Quote API error:', quoteData.error);
            }
          } else {
            if (loadedSymbol.current === normalizedSymbol) throw new Error(`Quote request failed: ${quoteResponse.status}`);
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

        const baseMetrics = calculatePositionMetrics(
          combinedPosition,
          currentPrice,
          rate,
          settings.annualGrowthRate,
          dailyChange
        );
        const computedMetrics = {
          ...baseMetrics,
          requiredExitPrice: calculateRequiredExitPrice(mappedPositions, settings.annualGrowthRate),
        };

        if (cancelled) {
          return;
        }

        setPositions(mappedPositions);
        setQuote(fetchedQuote);
        setUsdToIls(rate);
        setMetrics(computedMetrics);
        loadedSymbol.current = normalizedSymbol;
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load stock data:', err);
        if (!cancelled) {
          setError(locale === 'he' ? 'שגיאה בטעינת הנתונים' : 'Failed to load data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [locale, normalizedSymbol, reloadKey, settings.annualGrowthRate, settings.finnhubToken]);

  const fetchHistorical = useCallback(
    async (selectedRange: TimeRange, entryDate: string | undefined, signal: AbortSignal) => {
      const now = Math.floor(Date.now() / 1000);
      const { from, resolution } = getRangeParams(selectedRange, entryDate);
      const params = new URLSearchParams({ symbol: normalizedSymbol, resolution, from: String(from), to: String(now) });
      if (settings.finnhubToken) params.set('token', settings.finnhubToken);
      const response = await fetch(`/api/candles?${params}`, { signal });
      if (!response.ok) throw new Error(`Candles request failed: ${response.status}`);
      const data = await response.json() as CandleResponse;
      if (data.error) throw new Error(data.error);
      return mapCandleDataToPoints(data);
    },
    [normalizedSymbol, settings.finnhubToken]
  );

  const historicalEntryDate = position?.entryDate;
  useEffect(() => {
    if (!historicalEntryDate) return;
    const controller = new AbortController();
    setHistoricalLoading(true);
    setHistoricalError(false);
    void fetchHistorical(range, historicalEntryDate, controller.signal)
      .then((points) => {
        if (controller.signal.aborted) return;
        setHistorical(points);
        setDisplayedRange(range);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoricalError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoricalLoading(false);
      });
    return () => controller.abort();
  }, [fetchHistorical, historicalEntryDate, range, reloadKey]);

  const formatUsdCurrency = useCallback(
    (valueUsd?: number) =>
      valueUsd !== undefined
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(valueUsd)
        : '--',
    []
  );

  const formatSignedUsdCurrency = useCallback(
    (valueUsd: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        signDisplay: 'always',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(valueUsd),
    []
  );

  const formatSignedIlsCurrency = useCallback(
    (valueIls: number) =>
      new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        signDisplay: 'always',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(valueIls),
    []
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

  const entryTimestamp = useMemo(() => {
    if (!metrics?.position.entryDate) {
      return undefined;
    }

    const timestamp = new Date(metrics.position.entryDate).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }, [metrics?.position.entryDate]);

  const sparklineEvents = useMemo<SparklineEvent[]>(() => {
    if (!transactions.length || !chartData.length) {
      return [];
    }

    const rangeStart = chartData[0]?.timestamp ?? Number.NEGATIVE_INFINITY;
    const rangeEnd = chartData[chartData.length - 1]?.timestamp ?? Number.POSITIVE_INFINITY;

    return transactions
      .reduce<SparklineEvent[]>((events, lot) => {
        const timestamp = new Date(lot.executedAt).getTime();
        if (Number.isNaN(timestamp)) {
          return events;
        }

        if (timestamp < rangeStart || timestamp > rangeEnd) {
          return events;
        }

        events.push({
          id: lot.id ?? `${lot.executedAt}-${lot.type}-${lot.price}-${lot.quantity}`,
          timestamp,
          price: lot.price,
          quantity: lot.quantity,
          type: lot.type,
          typeLabel: lot.type === 'BUY' ? t.positions.buy : t.positions.sell,
          priceLabel: formatUsdCurrency(lot.price),
          quantityLabel: formatNumber(lot.quantity, locale),
        });

        return events;
      }, [])
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [chartData, formatUsdCurrency, locale, t.positions.buy, t.positions.sell, transactions]);

  const buildSparklineHoverDetails = useCallback(
    (point: { price: number; timestamp: number }) => {
      if (!metrics) {
        return [];
      }

      const pnlUsd = (point.price - metrics.position.entryPrice) * metrics.position.quantity;
      const pnlIls = pnlUsd * usdToIls;
      const valueClassName = pnlUsd >= 0 ? 'text-emerald-700' : 'text-rose-700';

      return [
        {
          label: locale === 'he' ? 'רווח/הפסד $' : 'P/L USD',
          value: formatSignedUsdCurrency(pnlUsd),
          valueClassName,
        },
        {
          label: locale === 'he' ? 'רווח/הפסד ₪' : 'P/L ILS',
          value: formatSignedIlsCurrency(pnlIls),
          valueClassName,
        },
      ];
    },
    [formatSignedIlsCurrency, formatSignedUsdCurrency, locale, metrics, usdToIls]
  );

  const dailyChangeValue = quote?.d;
  const dailyChangePercent = quote?.dp ?? metrics?.dailyChangePercent;

  const investedAmountUsd = metrics ? metrics.position.entryPrice * metrics.position.quantity : 0;
  const investedAmountDisplay = metrics ? formatUsdCurrency(investedAmountUsd) : '--';
  const currentValueDisplay = metrics ? formatUsdCurrency(metrics.currentValue) : '--';
  const totalGainUsd = metrics ? metrics.currentValue - investedAmountUsd : 0;
  const totalGainDisplay = metrics ? formatUsdCurrency(totalGainUsd) : '--';
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
    dailyChangeValue !== undefined ? formatUsdCurrency(dailyChangeValue) : '--';
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
  const profitPerShareLabel = formatUsdCurrency(profitPerShare);
  const profitPerShareClass =
    profitPerShare === 0 ? 'text-slate-600' : profitPerShare > 0 ? 'text-emerald-600' : 'text-rose-600';
  const transactionsCountLabel = formatNumber(transactions.length, locale);
  const openLotsCountLabel = formatNumber(openLots.length, locale);
  const visibleRequiredExitPrice = metrics && hasMaterialExitPriceGap(metrics.projectedPrice, metrics.requiredExitPrice)
    ? metrics.requiredExitPrice
    : undefined;
  const requiredExitPriceLabel = visibleRequiredExitPrice !== undefined
    ? formatUsdCurrency(visibleRequiredExitPrice)
    : null;

  const quickFacts = metrics
    ? [
        {
          key: 'investedAmount', icon: DollarSign,
          label: t.stock.detailView.quickFacts.investedAmount,
          value: investedAmountDisplay,
          helper: t.stock.detailView.quickFactsHelper.investedAmount,
        },
        {
          key: 'entryPrice', icon: Target, label: t.dashboard.entryPrice,
          value: formatUsdCurrency(metrics.position.entryPrice), helper: '',
        },
        {
          key: 'quantity', icon: Wallet, label: t.dashboard.quantity,
          value: formatNumber(metrics.position.quantity, locale), helper: '',
        },
        ...(requiredExitPriceLabel
          ? [{
              key: 'requiredExitPrice',
              icon: Target,
              label: t.dashboard.requiredExitPrice,
              value: requiredExitPriceLabel,
              helper: t.dashboard.requiredExitPriceHelper,
            }]
          : []),
      ]
    : [];

  return (
    <DashboardRouteShell activeKey={sourceRoute?.key ?? "portfolio"} locale={locale} portfolioFeedback={false}>
      <DashboardContainer>
        <Link href={returnTo} scroll={false} className="mb-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {locale === 'he' ? `חזרה ל${sourceRoute?.label ?? t.portfolio.title}` : `Back to ${sourceRoute?.label ?? t.portfolio.title}`}
        </Link>
        <PageHeader
          title={position?.display ?? normalizedSymbol}
          subtitle={loading ? t.stock.detailView.states.loading : position ? t.stock.overview : normalizedSymbol}
          icon={TrendingUp}
        />

        <DashboardMain>
          {loading ? (
            <StockDetailSkeleton />
          ) : error && !metrics ? (
            <DashboardSurface className="border-red-200 text-red-700">
              <div className="flex flex-col items-center gap-4 py-10">
                <div className="text-lg font-semibold">{t.stock.detailView.states.error}</div>
                <div className="text-sm text-overlay-red-600">{error}</div>
                <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
                  {t.stock.detailView.states.retry}
                </Button>
              </div>
            </DashboardSurface>
          ) : !position || !metrics ? (
            <DashboardSurface>
              <div className="flex items-center justify-center py-20 text-sm text-gray-500">
                {t.stock.detailView.states.empty}
              </div>
            </DashboardSurface>
          ) : (
            <div className="space-y-5">
              {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <span>{locale === 'he' ? 'העדכון נכשל. הנתונים האחרונים נשמרו.' : 'Refresh failed. Showing the last available data.'}</span>
                  <Button variant="outline" size="sm" disabled={refreshing} onClick={() => setReloadKey((value) => value + 1)}>{t.stock.detailView.states.retry}</Button>
                </div>
              )}
              <DashboardSurface className="border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3" aria-busy={refreshing}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-11 w-11 rounded-xl border border-slate-200 bg-slate-100">
                      <StockAvatarImage symbol={position.symbol} display={position.display} imageUrl={position.imageUrl} />
                      <AvatarFallback className="bg-blue-50 font-semibold text-blue-700">{position.symbol.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900" dir="ltr">{position.symbol}</span>
                      {badgeLocations.map((bank) => <BankBadge key={bank} bank={bank} locale={locale} size="sm" />)}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="min-h-[44px] gap-2" disabled={refreshing} onClick={() => setReloadKey((value) => value + 1)}>
                    <RefreshCcw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                    {refreshing ? t.common.loading : t.watchlist.actions.refreshTicker}
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
                  <div className="col-span-2 lg:col-span-1">
                    <p className="text-xs text-slate-500">{t.stock.priceToday}</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-950" dir="ltr">{formatUsdCurrency(metrics.currentPrice)}</p>
                    <p className={cn('mt-1 text-sm font-medium tabular-nums', dailyChangeClass)}>
                      {dailyChangeDisplay} {dailyChangePercentLabel} <span className="text-xs text-slate-500">{t.stock.dailyChange}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t.stock.detailView.quickFacts.currentValue}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{currentValueDisplay}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t.stock.detailView.quickFacts.totalGain}</p>
                    <p className={cn('mt-1 text-lg font-semibold tabular-nums', totalGainClass)}>{totalGainDisplay}</p>
                    <p className={cn('text-xs tabular-nums', totalGainClass)}>{totalGainPercentLabel}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500" role="status">
                  {lastUpdated ? `${t.app.updated} ${lastUpdated.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              </DashboardSurface>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader className="gap-2">
                  <div>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {t.stock.detailView.chartTitle}
                    </CardTitle>
                    <p className="text-sm text-gray-500">{t.stock.detailView.chartSubtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {STOCK_DETAIL_TIME_RANGES.map((option) => (
                        <Button
                          key={option}
                          variant={range === option ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => patchParams({ range: option })}
                          aria-pressed={range === option}
                          disabled={historicalLoading && range === option}
                        >
                          {t.timeRange[option]}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent aria-busy={historicalLoading}>
                  <div role="status" className="mb-2 min-h-5 text-xs text-slate-500">
                    {(historicalLoading || historicalError) && chartData.length > 0 && displayedRange && (
                      <span>{locale === 'he' ? `מוצגים נתוני ${t.timeRange[displayedRange]}. ` : `Showing ${t.timeRange[displayedRange]} data. `}</span>
                    )}
                    {historicalLoading ? t.common.loading : historicalError ? (
                      <span className="text-amber-800">
                        {locale === 'he' ? 'הגרף לא התעדכן.' : 'Chart could not be updated.'}{' '}
                        <button className="min-h-[44px] underline underline-offset-2" onClick={() => setReloadKey((value) => value + 1)}>{t.stock.detailView.states.retry}</button>
                      </span>
                    ) : null}
                  </div>
                  {historicalLoading && chartData.length === 0 ? (
                    <Skeleton className="h-80 w-full" />
                  ) : chartData.length === 0 ? (
                    <div className="flex h-80 items-center justify-center text-sm text-gray-500">
                      {t.stock.historyUnavailable}
                    </div>
                  ) : (
                    <div className="h-[320px] w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 [direction:ltr] sm:h-[360px] sm:p-4">
                      <Sparkline
                        points={chartData}
                        height={320}
                        color="var(--color-emerald-500)"
                        baseline={metrics.position.entryPrice}
                        baselineColor="rgba(var(--color-slate-400-rgb), 0.55)"
                        projectedPrice={metrics.projectedPrice}
                        requiredExitPrice={visibleRequiredExitPrice}
                        projectedLineColor="rgba(var(--color-primary-500-rgb), 0.85)"
                        requiredExitLabel={t.dashboard.requiredExitPrice}
                        belowEntryColor="var(--color-rose-500)"
                        betweenProjectedColor="var(--color-primary-500)"
                        aboveProjectedColor="var(--color-emerald-500)"
                        activeFromTimestamp={entryTimestamp}
                        inactiveBeforeColor="var(--color-slate-400)"
                        annualGrowthRate={settings.annualGrowthRate}
                        yearsHeld={metrics.yearsHeld}
                        events={sparklineEvents}
                        className="h-full w-full"
                        showYAxis
                        yAxisWidth={76}
                        priceFormatter={formatUsdCurrency}
                        timeFormatter={(timestamp) =>
                          new Date(timestamp).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        }
                        hoverDetails={buildSparklineHoverDetails}
                        interactive
                      />
                    </div>
                  )}
                  <p className="mt-4 text-xs text-gray-500">{t.stock.detailView.chartHelper}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {locale === 'he' ? 'מצב פוזיציה' : 'Position health'}
                  </CardTitle>
                  <p className="text-sm text-gray-500">
                    {locale === 'he'
                      ? 'סיכום מהיר של נתונים קריטיים בלבד'
                      : 'A focused summary of the most useful metrics'}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{locale === 'he' ? 'רווח למניה' : 'Profit per share'}</span>
                      <span className={cn('font-semibold', profitPerShareClass)}>{profitPerShareLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{locale === 'he' ? 'פער מול מחיר ממוצע' : 'Move vs avg. cost'}</span>
                      <span className={cn('font-semibold', avgCostVsNowClass)}>{avgCostVsNowLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{locale === 'he' ? 'משך החזקה' : 'Holding period'}</span>
                      <span className="font-semibold text-slate-900">{holdingPeriodLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{locale === 'he' ? 'מספר פעולות' : 'Transactions'}</span>
                      <span className="font-semibold text-slate-900">{transactionsCountLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{locale === 'he' ? 'לוטים פתוחים' : 'Open lots'}</span>
                      <span className="font-semibold text-slate-900">{openLotsCountLabel}</span>
                    </div>
                  </div>
                  {locationBreakdowns.length > 1 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {locale === 'he' ? 'פיזור לפי חשבון' : 'By account'}
                      </div>
                      <div className="space-y-2">
                        {locationBreakdowns.map((breakdown) => (
                          <div key={`${breakdown.location}-breakdown`} className="flex items-center justify-between text-sm">
                            <span className="inline-flex items-center gap-2 text-slate-700">
                              <BankBadge bank={breakdown.location} locale={locale} size="sm" />
                              {breakdown.location === 'bank_two' ? t.positions.bankTwo : t.positions.bankOne}
                            </span>
                            <span className="text-slate-600">
                              {formatNumber(breakdown.quantity, locale)} · {formatUsdCurrency(breakdown.averageEntryPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.stock.detailView.quickFactsTitle}
                  </CardTitle>
                  <p className="text-sm text-gray-500">{t.stock.detailView.quickFactsSubtitle}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {quickFacts.map((fact) => {
                      const FactIcon = fact.icon;
                      return (
                        <div
                          key={fact.key}
                          className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                        >
                          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                            <span className="rounded-md bg-white p-1.5 text-slate-500 shadow-sm ring-1 ring-slate-200">
                              <FactIcon className="h-3.5 w-3.5" />
                            </span>
                            <span>{fact.label}</span>
                          </div>
                          <div className={cn('mt-3 break-words text-lg font-semibold text-slate-900')}>
                            {fact.value}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{fact.helper}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.positions.transactionsTitle}
                  </CardTitle>
                  <p className="text-sm text-gray-500">{t.stock.detailView.transactionsHelper}</p>
                </div>
                {openLots.length > 0 ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
                    {locale === 'he'
                      ? `לוטים פתוחים: ${openLotsCountLabel}`
                      : `Open lots: ${openLotsCountLabel}`}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-500">
                    {t.positions.noTransactions}
                  </div>
                )}
              </CardHeader>
              <CardContent className="text-sm text-gray-600">
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
                          const badgeTone =
                            lot.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
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
                              <TableCell className="text-right">{formatUsdCurrency(lot.price)}</TableCell>
                              <TableCell className="text-right text-xs text-gray-500">
                                {lot.hasCommission && lot.commissionAmount > 0
                                  ? t.positions.transactionCommissionShort(
                                      formatUsdCurrency(lot.commissionAmount),
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
            </div>
          )}
        </DashboardMain>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
