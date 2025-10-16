'use client';

import { useMemo } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkline, SparklineEvent } from './sparkline';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { computeRealizedSales } from '@/lib/positions';

interface PositionCardProps {
  metrics: PositionMetrics;
  sparklineData?: HistoricalPoint[];
}

export function PositionCard({ metrics, sparklineData }: PositionCardProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const {
    position,
    currentPrice,
    positionPnLUsd,
    positionPnLIls,
    projectedPrice,
    projectedPnLUsd,
    projectedPnLIls,
    combined,
    combinedIls,
    yearsHeld,
  } = metrics;

  const projectedPriceDelta = currentPrice - projectedPrice;

  const usdToIlsRate = (() => {
    if (positionPnLUsd !== 0) {
      return positionPnLIls / positionPnLUsd;
    }

    if (projectedPnLUsd !== 0) {
      return projectedPnLIls / projectedPnLUsd;
    }

    if (combined !== 0) {
      return combinedIls / combined;
    }

    return 0;
  })();
  const projectedPriceDeltaIls = projectedPriceDelta * usdToIlsRate;
  const sparklineColor = (() => {
    if (currentPrice < position.entryPrice) {
      return { className: 'text-[#D22E2E]', hex: '#D22E2E' };
    }

    if (currentPrice > projectedPrice) {
      return { className: 'text-[#4AA956]', hex: '#4AA956' };
    }

    return { className: 'text-[#2563EB]', hex: '#2563EB' };
  })();

  const changeFromEntryPercent = position.entryPrice !== 0
    ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    : null;

  const sparklineEvents: SparklineEvent[] = useMemo(() => {
    const lots = position.lots ?? [];

    if (!lots.length) {
      return [];
    }

    const buyLabel = t.positions.buy;
    const sellLabel = t.positions.sell;

    const events = lots.reduce<SparklineEvent[]>((acc, lot, index) => {
      const executedAt = new Date(lot.executedAt);
      const timestamp = executedAt.getTime();

      if (Number.isNaN(timestamp)) {
        return acc;
      }

      if (!Number.isFinite(lot.quantity) || !Number.isFinite(lot.price)) {
        return acc;
      }

      const quantity = lot.quantity;
      const price = lot.price;

      acc.push({
        id: lot.id ?? `${position.symbol}-${lot.type}-${index}`,
        timestamp,
        type: lot.type,
        price,
        quantity,
        typeLabel: lot.type === 'BUY' ? buyLabel : sellLabel,
        priceLabel: formatCurrency(price, 'USD', locale),
        quantityLabel: formatNumber(quantity, locale),
      });

      return acc;
    }, []);

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }, [locale, position.lots, position.symbol, t.positions.buy, t.positions.sell]);

  const getTrendStyles = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-600',
      };
    }

    if (value < 0) {
      return {
        text: 'text-rose-600',
        badge: 'bg-rose-50 text-rose-600',
      };
    }

    return {
      text: 'text-slate-600',
      badge: 'bg-slate-100 text-slate-500',
    };
  };

  const dailyChangeValue = typeof metrics.dailyChange === 'number' ? metrics.dailyChange : null;
  const dailyChangePercent = metrics.dailyChangePercent;
  const dailyChangeAmount = dailyChangeValue !== null ? dailyChangeValue * position.quantity : null;
  const dailyChangeStyles = dailyChangeAmount !== null ? getTrendStyles(dailyChangeAmount) : null;
  const dailyChangeIcon = dailyChangeAmount !== null
    ? dailyChangeAmount > 0
      ? <ArrowUpRight className="h-3.5 w-3.5" />
      : dailyChangeAmount < 0
        ? <ArrowDownRight className="h-3.5 w-3.5" />
        : <Minus className="h-3.5 w-3.5" />
    : null;

  const currentPnLStyles = getTrendStyles(positionPnLUsd);
  const projectedPnLStyles = getTrendStyles(projectedPriceDelta);
  const combinedStyles = getTrendStyles(combined);
  const changeFromEntryStyles = changeFromEntryPercent !== null ? getTrendStyles(changeFromEntryPercent) : null;

  const percentText = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value, locale)}`;

  const isClosed = position.quantity <= 0;

  const realizedSales = useMemo(() => {
    if (!isClosed) {
      return [];
    }

    return computeRealizedSales(position);
  }, [isClosed, position]);

  const lastSaleRecord = useMemo(() => {
    if (!realizedSales.length) {
      return null;
    }

    return realizedSales.reduce((latest, sale) => {
      const latestTime = new Date(latest.sellDate).getTime();
      const saleTime = new Date(sale.sellDate).getTime();

      if (Number.isNaN(saleTime)) {
        return latest;
      }

      if (Number.isNaN(latestTime) || saleTime > latestTime) {
        return sale;
      }

      return latest;
    }, realizedSales[0]);
  }, [realizedSales]);

  const sellEvents = useMemo(() => {
    if (!isClosed) {
      return [];
    }

    return sparklineEvents.filter((event) => event.type === 'SELL');
  }, [isClosed, sparklineEvents]);

  const fallbackSellEvent = useMemo(() => {
    if (!sellEvents.length) {
      return null;
    }

    return sellEvents.reduce((latest, event) => (event.timestamp > latest.timestamp ? event : latest), sellEvents[0]);
  }, [sellEvents]);

  const lastSellTimestamp = useMemo(() => {
    if (lastSaleRecord) {
      const value = new Date(lastSaleRecord.sellDate).getTime();
      return Number.isNaN(value) ? null : value;
    }

    if (fallbackSellEvent) {
      return fallbackSellEvent.timestamp;
    }

    return null;
  }, [lastSaleRecord, fallbackSellEvent]);

  const lastSalePrice = lastSaleRecord?.sellPrice ?? fallbackSellEvent?.price ?? null;
  const lastSellDate = lastSaleRecord?.sellDate ?? (fallbackSellEvent ? new Date(fallbackSellEvent.timestamp).toISOString() : null);

  const totalQuantitySold = realizedSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const totalRealizedProfit = realizedSales.reduce((sum, sale) => sum + sale.profitUsd, 0);
  const totalProceeds = realizedSales.reduce((sum, sale) => sum + sale.proceedsUsd, 0);
  const weightedHoldingDays = totalQuantitySold > 0
    ? realizedSales.reduce((sum, sale) => sum + sale.holdingPeriodDays * sale.quantity, 0) / totalQuantitySold
    : 0;

  const averageEntryPriceClosed = totalQuantitySold > 0
    ? (totalProceeds - totalRealizedProfit) / totalQuantitySold
    : lastSaleRecord?.averageEntryPrice ?? position.entryPrice;

  const sparklinePoints = useMemo(() => {
    if (!isClosed) {
      return sparklineData ?? [];
    }

    const points = Array.isArray(sparklineData) ? [...sparklineData] : [];

    if (!points.length) {
      if (lastSellTimestamp && lastSalePrice !== null) {
        return [{ timestamp: lastSellTimestamp, close: lastSalePrice }];
      }
      return [];
    }

    const filtered = lastSellTimestamp
      ? points.filter((point) => point.timestamp <= lastSellTimestamp)
      : points;

    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);

    if (lastSellTimestamp && lastSalePrice !== null) {
      const hasSalePoint = sorted.some((point) => point.timestamp === lastSellTimestamp);
      if (!hasSalePoint) {
        sorted.push({ timestamp: lastSellTimestamp, close: lastSalePrice });
      }
    }

    return sorted.sort((a, b) => a.timestamp - b.timestamp);
  }, [isClosed, sparklineData, lastSellTimestamp, lastSalePrice]);

  const eventsForSparkline = useMemo(() => {
    if (!isClosed || !lastSellTimestamp) {
      return sparklineEvents;
    }

    return sparklineEvents.filter((event) => event.timestamp <= lastSellTimestamp);
  }, [isClosed, lastSellTimestamp, sparklineEvents]);

  const showSparkline = sparklinePoints.length > 1;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-lg transition-transform duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-32 rounded-full bg-gradient-to-r from-blue-500/25 via-indigo-400/20 to-transparent blur-3xl transition-opacity duration-500 group-hover:opacity-90" />

      <div className="relative z-10 flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="h-14 w-14 rounded-2xl border border-white/60 bg-slate-100 shadow-sm ring-2 ring-blue-100">
                <AvatarImage src={position.imageUrl} alt={position.display} />
                <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                  {position.symbol.slice(0, 2)}
                </AvatarFallback>
              </Avatar>

              {!isClosed && changeFromEntryPercent !== null && (
                <Badge
                  variant="secondary"
                  className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border-0 px-2 py-0.5 text-[10px] font-semibold shadow-sm ${changeFromEntryStyles?.badge ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {percentText(changeFromEntryPercent)}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">{position.display}</h3>
                <Badge variant="secondary" className="border border-blue-100 bg-blue-50 text-blue-700">
                  {position.symbol}
                </Badge>
              </div>
              <p className="text-sm text-slate-500">
                {isClosed && lastSellDate
                  ? `${t.dashboard.closedOn} ${formatDate(lastSellDate, locale)}`
                  : `${t.dashboard.since} ${formatDate(position.entryDate, locale)}`}
              </p>
            </div>
          </div>

          {!isClosed && dailyChangeAmount !== null && dailyChangeStyles && dailyChangePercent !== undefined && (
            <Badge
              variant="outline"
              className={`flex items-center gap-1 rounded-full border-0 bg-white/70 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur ${dailyChangeStyles.badge}`}
            >
              {dailyChangeIcon}
              <span>{t.dashboard.dailyChange}</span>
              <div className="flex flex-col items-start gap-1 font-semibold">
                <span>{formatCurrency(dailyChangeAmount, 'USD', locale)}</span>
                <span>{percentText(dailyChangePercent)}</span>
              </div>
            </Badge>
          )}
        </div>

        {!isClosed ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.quantity}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatNumber(position.quantity, locale)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.entryPrice}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrency(position.entryPrice, 'USD', locale)}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-100/80 bg-slate-50/70 p-4 shadow-inner">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.current}</p>
                <dl className="mt-3 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <dt>{t.dashboard.price}</dt>
                    <dd className="text-base font-semibold text-slate-900">{formatCurrency(currentPrice, 'USD', locale)}</dd>
                  </div>
                  <div className={`flex items-center justify-between ${currentPnLStyles.text}`}>
                    <dt>{t.dashboard.pnl} USD</dt>
                    <dd className="text-base font-semibold">{formatCurrency(positionPnLUsd, 'USD', locale)}</dd>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={`flex items-center justify-between ${currentPnLStyles.text}`}>
                      <dt>{t.dashboard.pnl} ILS</dt>
                      <dd className="text-base font-semibold">{formatCurrency(positionPnLIls, 'ILS', locale)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-3xl border border-slate-100/80 bg-white/70 p-4 shadow-inner">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.projected}</p>
                <dl className="mt-3 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <dt>{t.dashboard.weightedProjectedPrice}</dt>
                    <dd className="text-base font-semibold text-slate-900">{formatCurrency(projectedPrice, 'USD', locale)}</dd>
                  </div>
                  <div className={`flex items-center justify-between ${combinedStyles.text}`}>
                    <dt>{t.dashboard.combined} USD</dt>
                    <dd className="text-base font-semibold">{formatCurrency(combined, 'USD', locale)}</dd>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={`flex items-center justify-between ${combinedStyles.text}`}>
                      <dt>{t.dashboard.combined} ILS</dt>
                      <dd className="text-base font-semibold">{formatCurrency(combinedIls, 'ILS', locale)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.quantitySold}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatNumber(totalQuantitySold, locale)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.entryPrice}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrency(averageEntryPriceClosed, 'USD', locale)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.lastSalePrice}</p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {lastSalePrice !== null ? formatCurrency(lastSalePrice, 'USD', locale) : '—'}
                </p>
              </div>
              <div className={`rounded-2xl bg-slate-50/80 p-3 shadow-sm ${getTrendStyles(totalRealizedProfit).text}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.realizedProfit}</p>
                <p className="mt-1 text-base font-semibold">{formatCurrency(totalRealizedProfit, 'USD', locale)}</p>
              </div>
            </div>

            {totalProceeds > 0 && (
              <p className="text-xs text-slate-500">
                {t.dashboard.totalProceeds}:{' '}
                <span className="font-semibold text-slate-700">{formatCurrency(totalProceeds, 'USD', locale)}</span>
              </p>
            )}

            {weightedHoldingDays > 0 && (
              <p className="text-xs text-slate-500">
                {t.dashboard.averageHoldDays}:{' '}
                <span className="font-semibold text-slate-700">{formatNumber(weightedHoldingDays, locale)}</span>
              </p>
            )}
          </>
        )}

        {showSparkline && (
          <div className="rounded-3xl border border-slate-100/70 bg-slate-50/70 p-4">
            <Sparkline
              points={sparklinePoints}
              height={140}
              color={sparklineColor.hex}
              baseline={position.entryPrice}
              baselineColor="rgba(148, 163, 184, 0.5)"
              projectedPrice={!isClosed ? projectedPrice : undefined}
              annualGrowthRate={!isClosed ? settings.annualGrowthRate : undefined}
              yearsHeld={!isClosed ? yearsHeld : undefined}
              events={eventsForSparkline}
              className="h-36 w-full"
            />
          </div>
        )}

        <div className="flex justify-end">
          <Link
            href={`/stock/${position.symbol}`}
            className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
          >
            {t.dashboard.viewDetails}
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
