'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useUrlState } from '@/hooks/use-url-state';
import { validateReturnTo } from '@/lib/navigation-context';
import { createAppRouteItems } from '@/components/dashboard/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  RefreshCcw,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BankBadge } from '@/components/branding/bank-badge';
import { StockLogo } from '@/components/ui/stock-logo';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { useStockNavigationPreview, useStockNavigationReady } from '@/components/portfolio/stock-navigation';
import type { SparklineEvent } from '@/components/charts/sparkline';
import { StockDetailChart } from '@/components/portfolio/stock-detail-chart';
import { StockChartSkeleton, StockRecordsSkeleton } from './stock-detail-skeleton';
import styles from './stock-detail-view.module.css';

import { getSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildUsdIlsRateResolver, fetchUsdIlsHistoricalPoints } from '@/lib/services/historical-fx';
import { STOCK_DETAIL_TIME_RANGES } from '@/lib/display/time-ranges';
import {
  calculatePositionMetrics,
  calculateSymbolExceptionAssessment,
  calculateRequiredExitPrice,
  hasMaterialExitPriceGap,
  formatDate,
  formatNumber,
  formatPercent,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import { computeOpenLots, mapPositionRow, summarizeLots } from '@/lib/positions';
import { cn } from '@/lib/utils';
import { buildStockHoldingCycles } from '@/lib/stock-holding-cycles';
import { buildHoldingChartReferences } from '@/lib/holding-chart-history';
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
      return a.location.localeCompare(b.location);
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
  const [historical, setHistorical] = useState<HistoricalPoint[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [holdingScope, setHoldingScope] = useState<'current' | 'all'>('all');
  const holdingCycles = useMemo(() => buildStockHoldingCycles(positions), [positions]);
  const currentCycleStart = holdingCycles.filter((cycle) => cycle.current).reduce<number | undefined>((start, cycle) => start === undefined ? cycle.start : Math.min(start, cycle.start), undefined);
  const navigationPreview = useStockNavigationPreview(normalizedSymbol);
  useStockNavigationReady(!loading || Boolean(navigationPreview));
  const position = useMemo(() => combinePositions(positions), [positions]);
  const locationBreakdowns = useMemo(() => buildLocationBreakdowns(positions), [positions]);
  const openLots = useMemo(() => positions.flatMap((source) => computeOpenLots(source.lots ?? [])), [positions]);
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

        const quoteParams = new URLSearchParams({ symbol: normalizedSymbol });
        if (quoteParams && reloadKey > 0) {
          quoteParams.set('forceRefresh', '1');
        }
        const quoteUrl = quoteParams ? `/api/quote?${quoteParams.toString()}` : null;
        const activityTimestamps = mappedPositions.flatMap((position) => [
          new Date(position.entryDate).getTime(),
          ...(position.lots ?? []).map((lot) => new Date(lot.executedAt).getTime()),
        ]).filter(Number.isFinite);
        const earliestActivity = activityTimestamps.length ? Math.min(...activityTimestamps) : Date.now();
        const [quoteResponse, rateResponse, fxHistory] = await Promise.all([
          quoteUrl ? fetch(quoteUrl) : Promise.resolve<null | Response>(null),
          fetch('/api/exchange-rate'),
          fetchUsdIlsHistoricalPoints(
            Math.max(0, Math.floor(earliestActivity / 1000) - 10 * DAY_SECONDS),
            Math.floor(Date.now() / 1000),
          ).catch(() => []),
        ]);

        let fetchedQuote: StockQuote | null = null;
        if (quoteResponse) {
          if (quoteResponse.ok) {
            const quoteData = (await quoteResponse.json()) as QuoteResponse;
            if (!quoteData.error && Number.isFinite(quoteData.c) && quoteData.c > 0) {
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

        let rate = Number.NaN;
        if (rateResponse.ok) {
          const rateData = await rateResponse.json();
          if (Number.isFinite(rateData.usdToIls) && rateData.usdToIls > 0) rate = rateData.usdToIls;
        } else {
          console.warn(`Exchange rate request failed with status ${rateResponse.status}`);
        }

        const currentPrice = fetchedQuote?.c ?? Number.NaN;
        const dailyChange = fetchedQuote?.d;

        const baseMetrics = calculatePositionMetrics(
          combinedPosition,
          currentPrice,
          rate,
          settings.annualGrowthRate,
          dailyChange,
          buildUsdIlsRateResolver(fxHistory, rate, { allowFallback: false }),
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
  }, [locale, normalizedSymbol, reloadKey, settings.annualGrowthRate]);

  const fetchHistorical = useCallback(
    async (selectedRange: TimeRange, entryDate: string | undefined, signal: AbortSignal) => {
      const now = Math.floor(Date.now() / 1000);
      const { from, resolution } = getRangeParams(selectedRange, entryDate);
      const params = new URLSearchParams({ symbol: normalizedSymbol, resolution, from: String(from), to: String(now) });
      const response = await fetch(`/api/candles?${params}`, { signal });
      if (!response.ok) throw new Error(`Candles request failed: ${response.status}`);
      const data = await response.json() as CandleResponse;
      if (data.error) throw new Error(data.error);
      return mapCandleDataToPoints(data);
    },
    [normalizedSymbol]
  );

  const historicalEntryDate = holdingCycles.length > 0 ? new Date(holdingCycles[0].start).toISOString() : position?.entryDate;
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


  const chartData = useMemo(() => {
    if (holdingCycles.length <= 1 || holdingScope !== 'current' || currentCycleStart === undefined) return historical;
    // Keep a week of market context before the rebuy. If it happened after the
    // latest candle, keep two real closes rather than inventing a live sample.
    const recent = historical.filter((point) => point.timestamp >= currentCycleStart - 7 * DAY_SECONDS * 1000);
    return recent.length >= 2 ? recent : historical.slice(-2);
  }, [historical, holdingScope, currentCycleStart, holdingCycles.length]);

  const entryTimestamp = useMemo(() => {
    const recorded = openLots.map(lot => new Date(lot.executedAt).getTime()).filter(Number.isFinite);
    if (recorded.length) return Math.min(...recorded);
    const timestamp = new Date(metrics?.position.entryDate ?? '').getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }, [openLots, metrics?.position.entryDate]);

  const sparklineEvents = useMemo<SparklineEvent[]>(() => {
    if (!transactions.length || !chartData.length) {
      return [];
    }

    const rangeStart = holdingCycles.length <= 1 || holdingScope === 'all' ? getRangeParams(displayedRange ?? range, historicalEntryDate).from * 1000 : chartData[0]?.timestamp ?? Number.NEGATIVE_INFINITY;
    const rangeEnd = chartData[chartData.length - 1]?.timestamp ?? Number.POSITIVE_INFINITY;

    return transactions
      .reduce<SparklineEvent[]>((events, lot) => {
        if (lot.type === 'RECONCILE') return events;
        const timestamp = new Date(lot.executedAt).getTime();
        if (Number.isNaN(timestamp)) {
          return events;
        }

        if (timestamp < rangeStart || timestamp > Math.max(rangeEnd, Date.now())) {
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
  }, [chartData, displayedRange, range, historicalEntryDate, holdingScope, holdingCycles.length, formatUsdCurrency, locale, t.positions.buy, t.positions.sell, transactions]);

  const holdingReferences = useMemo(() => positions.some((item) => item.lots?.length)
    ? buildHoldingChartReferences(positions, [
      ...chartData,
      ...sparklineEvents.map((event) => ({ timestamp: event.timestamp, close: event.price })),
    ], settings.annualGrowthRate)
    : undefined, [positions, chartData, sparklineEvents, settings.annualGrowthRate]);

  const assessment = useMemo(() => positions.some(source => source.lots?.length)
    ? calculateSymbolExceptionAssessment(positions, quote?.c, settings.annualGrowthRate, lastUpdated ?? new Date())
    : undefined, [positions, quote?.c, settings.annualGrowthRate, lastUpdated]);
  const hasRecordedHistory = positions.some(source => source.lots?.length);
  const legacyPositions = positions.filter(source => !source.lots?.length);
  const quantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0) + legacyPositions.reduce((sum, source) => sum + Math.max(source.quantity, 0), 0);
  const cost = openLots.reduce((sum, lot) => sum + lot.totalCost, 0) + legacyPositions.reduce((sum, source) => sum + Math.max(source.quantity, 0) * source.entryPrice, 0);
  const averageCost = quantity > 0 ? cost / quantity : metrics?.position.entryPrice ?? 0;
  const currentValue = quantity === 0 ? 0 : Number.isFinite(metrics?.currentPrice) ? quantity * metrics!.currentPrice : undefined;
  const unrealized = currentValue === undefined ? undefined : currentValue - cost;
  const cumulative = assessment?.status === 'closed' ? assessment.actualProfitUsd : assessment?.status === 'open' && assessment.currentPrice !== undefined
    ? assessment.actualProfitUsd : !hasRecordedHistory ? unrealized : undefined;
  const currentTarget = assessment?.status === 'open' ? assessment.projectedPrice : !hasRecordedHistory ? metrics?.projectedPrice : undefined;
  const requiredExitPrice = metrics?.requiredExitPrice;
  const visibleRequiredExitPrice = currentTarget !== undefined && hasMaterialExitPriceGap(currentTarget, requiredExitPrice) ? requiredExitPrice : undefined;
  const money = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatUsdCurrency(value) : '—';
  const tone = (value: number | undefined) => value === undefined || !Number.isFinite(value) || Math.abs(value) < .005 ? 'text-slate-800' : value > 0 ? 'text-emerald-600' : 'text-rose-600';
  const shareCount = quantity.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: 6 });
  const identity = (position?.symbol.toUpperCase() === normalizedSymbol ? position : null) ?? navigationPreview ?? { symbol: normalizedSymbol, display: normalizedSymbol, imageUrl: '' };

  const awaitingInitialChart = Boolean(position && metrics && historicalEntryDate && !displayedRange && !historicalError);
  return <DashboardRouteShell activeKey={sourceRoute?.key ?? 'portfolio'} locale={locale} portfolioFeedback={false}>
    <DashboardContainer className={`stock-detail-arrival ${styles.page}`}>
      <div className={styles.toolbar}>
        <Link href={returnTo} scroll={false} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-xs font-medium text-slate-500 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <ArrowLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
          {locale === 'he' ? `חזרה ל${sourceRoute?.label ?? t.portfolio.title}` : `Back to ${sourceRoute?.label ?? t.portfolio.title}`}
        </Link>
        <div className="flex items-center gap-3">
          <span role="status" className="text-[11px] text-slate-400">{lastUpdated ? `${t.app.updated} ${lastUpdated.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          <Button variant="ghost" size="icon" aria-label={t.watchlist.actions.refreshTicker} title={t.watchlist.actions.refreshTicker} disabled={loading || refreshing} onClick={() => setReloadKey(value => value + 1)} className="h-11 w-11 rounded-xl text-slate-500"><RefreshCcw aria-hidden className={cn('h-4 w-4', refreshing && 'animate-spin')} /></Button>
        </div>
      </div>
      <DashboardMain className={styles.main}>
        <section className={`stock-detail-destination ${styles.hero}`} aria-busy={loading || refreshing} data-page-loading={loading || awaitingInitialChart || undefined}>
          <div className={styles.heroTop}>
            <div className="flex min-w-0 items-center gap-3">
              <StockLogo symbol={identity.symbol} display={identity.display} imageUrl={identity.imageUrl} className="h-12 w-12 rounded-2xl" />
              <div className="min-w-0"><div className="mb-1 flex min-h-[27px] flex-wrap items-center gap-2"><bdi className="text-xs font-semibold tracking-wide text-blue-600">{normalizedSymbol}</bdi>{loading && !badgeLocations.length && <Skeleton className="h-5 w-12 rounded-full" />}{badgeLocations.map(bank => <BankBadge key={bank} bank={bank} locale={locale} size="sm" />)}</div><h1 className="break-words text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{identity.display}</h1></div>
            </div>
            <div className={styles.quote}>
              <p className="mb-1 text-[11px] text-slate-500">{locale === 'he' ? 'מחיר המניה · USD' : 'Share price · USD'}</p>
              {loading ? <Skeleton className="h-[30px] w-32 sm:h-9" /> : <p className="text-3xl font-semibold leading-none tracking-tight text-slate-950 sm:text-4xl"><bdi>{money(metrics?.currentPrice)}</bdi></p>}
              {loading ? <div className="mt-2 flex h-4 items-center"><Skeleton className="h-3 w-20" /></div> : <p className={cn('mt-2 text-xs font-medium tabular-nums', tone(quote?.d))}><bdi>{money(quote?.d)}</bdi> <bdi>{quote?.dp !== undefined ? formatPercent(quote.dp, locale) : '—'}</bdi> <span className="font-normal text-slate-500">{locale === 'he' ? 'היום' : 'today'}</span></p>}
            </div>
          </div>
          <dl className={styles.metrics}>
            {[
              { label: locale === 'he' ? 'שווי ההחזקה' : 'Holding value', value: currentValue, helper: `${shareCount} ${locale === 'he' ? 'מניות פתוחות' : 'open shares'}`, color: 'text-slate-900' },
              { label: locale === 'he' ? 'רווח / הפסד פתוח' : 'Unrealized P/L', value: unrealized, helper: locale === 'he' ? 'בהחזקה הנוכחית' : 'Current holding', color: tone(unrealized) },
              { label: locale === 'he' ? 'רווח / הפסד מצטבר' : 'Cumulative P/L', value: cumulative, helper: hasRecordedHistory ? locale === 'he' ? 'כל הסבבים והמכירות הקודמות' : 'All cycles and previous sales' : locale === 'he' ? 'לפי נתוני ההחזקה הזמינים' : 'Available holding records', color: tone(cumulative) },
            ].map(item => <div key={item.label}><dt>{item.label}</dt><dd className={item.color}>{loading ? <Skeleton className="h-[1.5em] w-2/3 max-w-[5rem]" /> : <bdi>{money(item.value)}</bdi>}</dd>{loading ? <p><span aria-hidden="true" className="inline-block h-[.8em] w-3/4 max-w-[6rem] rounded bg-slate-400/20" /></p> : <p>{item.helper}</p>}</div>)}
          </dl>
        </section>

        {error ? <div role="alert" className={styles.error}><span>{metrics ? locale === 'he' ? 'העדכון נכשל. הנתונים האחרונים נשמרו.' : 'Refresh failed. Showing the last available data.' : t.stock.detailView.states.error}</span><Button variant="ghost" size="sm" onClick={() => setReloadKey(value => value + 1)} disabled={refreshing}>{t.stock.detailView.states.retry}</Button></div> : null}
        {loading ? <><StockChartSkeleton /><StockRecordsSkeleton /></> : position && metrics ? <>
          <StockDetailChart chartData={chartData} historicalLoading={historicalLoading || awaitingInitialChart} historicalError={historicalError} displayedRange={displayedRange} range={range} locale={locale} timeRangeLabels={t.timeRange} onRangeChange={option => patchParams({ range: option })} onRetry={() => setReloadKey(value => value + 1)} scope={holdingScope} onScopeChange={setHoldingScope} holdingCycles={holdingCycles} holdingReferences={holdingReferences} events={sparklineEvents} entryTimestamp={entryTimestamp} annualGrowthRate={settings.annualGrowthRate} yearsHeld={metrics.yearsHeld} baseline={averageCost} projectedPrice={currentTarget} requiredExitPrice={visibleRequiredExitPrice} priceFormatter={formatUsdCurrency} />

          <section className={styles.records} aria-label={locale === 'he' ? 'החזקה ופעולות' : 'Holdings and activity'}>
            <details className={styles.record}>
              <summary><span className="flex items-center gap-2"><span className={styles.recordIcon}><Wallet aria-hidden className="h-4 w-4" /></span><span>{locale === 'he' ? 'פירוט ההחזקה' : 'Holding breakdown'}</span></span><span className="flex items-center gap-2 text-xs text-slate-500"><bdi>{shareCount}</bdi> {locale === 'he' ? 'מניות' : 'shares'}<ChevronDown aria-hidden className={styles.chevron} /></span></summary>
              <div className={styles.recordBody}>
                <dl className={styles.accounting}>
                  {[
                    [locale === 'he' ? 'עלות המניות שנותרו' : 'Remaining cost basis', money(cost)],
                    [locale === 'he' ? 'עלות ממוצעת למניה' : 'Average cost per share', money(averageCost)],
                    [locale === 'he' ? 'ממומש מכל המכירות הקודמות' : 'Previously realized P/L', money(assessment?.status === 'open' || assessment?.status === 'closed' ? assessment.realizedProfitUsd : !hasRecordedHistory ? 0 : undefined)],
                    [locale === 'he' ? 'יעד רווח מכל הסבבים' : 'Profit target · all cycles', money(assessment?.status === 'open' || assessment?.status === 'closed' ? assessment.expectedProfitUsd : undefined)],
                  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}
                </dl>
                {locationBreakdowns.length > 1 ? <div className="mt-3 flex flex-wrap gap-2">{locationBreakdowns.map(account => <span key={account.location} className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><BankBadge bank={account.location} locale={locale} size="sm" /><bdi>{formatNumber(account.quantity, locale)}</bdi> {locale === 'he' ? 'מניות' : 'shares'}</span>)}</div> : null}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{locale === 'he' ? 'USD · כולל עמלות שנרשמו, לפני מס ועלויות מכירה עתידיות. היעד אישי ואינו תחזית.' : 'USD · recorded fees included, before tax and future exit costs. The personal target is not a forecast.'}</p>
              </div>
            </details>
            <details className={styles.record}>
              <summary><span className="flex items-center gap-2"><span className={styles.recordIcon}><ArrowLeftRight aria-hidden className="h-4 w-4" /></span><span>{locale === 'he' ? 'היסטוריית פעולות' : 'Transaction history'}</span></span><span className="flex items-center gap-2 text-xs text-slate-500">{transactions.length} {locale === 'he' ? 'פעולות' : 'trades'}<ChevronDown aria-hidden className={styles.chevron} /></span></summary>
              <div className={styles.recordBody}>
                {transactions.some(lot => lot.type === 'RECONCILE') && <p className="mb-3 text-xs text-slate-500">{locale === 'he' ? 'התאמות יתרה מעדכנות את ההחזקה בלי להמציא מכירות או למחוק עסקאות. הרווח המצטבר אינו ידוע עד להשלמת העסקאות החסרות.' : 'Balance checkpoints update holdings without inventing sales or deleting trades. Lifetime profit remains unknown until missing executions are supplied.'}</p>}
                {transactions.length ? <ol className={styles.trades}>{transactions.map((lot, index) => <li key={lot.id ?? `${lot.executedAt}-${index}`}>
                  <span className={cn(styles.side, lot.type === 'RECONCILE' ? 'bg-blue-50 text-blue-700' : lot.type === 'BUY' ? styles.buy : styles.sell)}>{lot.type === 'RECONCILE' ? (locale === 'he' ? 'התאמת יתרה' : 'Balance reconciliation') : lot.type === 'BUY' ? t.positions.buy : t.positions.sell}</span>
                  <span className="min-w-0"><span className="block text-xs font-medium text-slate-800"><bdi>{formatNumber(lot.quantity, locale)}</bdi> × <bdi>{money(lot.price)}</bdi></span><span className="mt-1 block text-[10px] text-slate-400">{lot.hasCommission && lot.commissionAmount > 0 ? `${locale === 'he' ? 'עמלה' : 'Fee'} ${money(lot.commissionAmount)}` : locale === 'he' ? 'ללא עמלה' : 'No fee'}</span></span>
                  <time dateTime={lot.executedAt} className="text-end text-[11px] text-slate-500">{formatDate(lot.executedAt, locale)}</time>
                </li>)}</ol> : <p className="py-2 text-xs text-slate-500">{t.positions.noTransactions}</p>}
              </div>
            </details>
          </section>
        </> : !loading && !error ? <DashboardSurface><p className="text-center text-sm text-slate-500">{t.stock.detailView.states.empty}</p></DashboardSurface> : null}
      </DashboardMain>
    </DashboardContainer>
  </DashboardRouteShell>;
}
