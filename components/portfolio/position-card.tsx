'use client';

import { useCallback, useMemo, useState } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { computeRealizedSales } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Badge } from '@/components/ui/badge';
import { BankBadge } from '@/components/branding/bank-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkline, SparklineEvent } from '@/components/charts/sparkline';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FORECAST_FEATURE_ENABLED } from '@/lib/forecast-config';

interface PositionCardProps {
  metrics: PositionMetrics;
  sparklineData?: HistoricalPoint[];
}

export function PositionCard({ metrics, sparklineData }: PositionCardProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const forecastEnabled = FORECAST_FEATURE_ENABLED;
  const {
    position,
    currentPrice,
    positionPnLUsd,
    positionPnLIls,
    projectedPrice,
    combined,
    combinedIls,
    yearsHeld,
  } = metrics;

  const isClosed = position.quantity <= 0;
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

  const realizedSales = useMemo(() => computeRealizedSales(position), [position]);

  const closedSummary = useMemo(() => {
    if (!isClosed || realizedSales.length === 0) {
      return null;
    }

    let totalQuantity = 0;
    let totalProceedsUsd = 0;
    let totalCostUsd = 0;
    let totalProfitUsd = 0;
    let weightedHoldingDays = 0;
    let lastSale: (typeof realizedSales)[number] | null = null;

    for (const sale of realizedSales) {
      totalQuantity += sale.quantity;
      totalProceedsUsd += sale.proceedsUsd;
      totalCostUsd += sale.costBasisUsd;
      totalProfitUsd += sale.profitUsd;
      weightedHoldingDays += sale.holdingPeriodDays * sale.quantity;

      const saleTime = new Date(sale.sellDate).getTime();

      if (!lastSale) {
        lastSale = sale;
        continue;
      }

      const lastSaleTime = new Date(lastSale.sellDate).getTime();
      if (Number.isNaN(lastSaleTime) || (!Number.isNaN(saleTime) && saleTime > lastSaleTime)) {
        lastSale = sale;
      }
    }

    const totalReturnPercent = totalCostUsd > 0 ? (totalProfitUsd / totalCostUsd) * 100 : 0;
    const averageEntryPrice = totalQuantity > 0 ? totalCostUsd / totalQuantity : 0;
    const averageExitPrice = totalQuantity > 0 ? totalProceedsUsd / totalQuantity : 0;
    const averageHoldingDays = totalQuantity > 0 ? weightedHoldingDays / totalQuantity : 0;

    const lastSaleDate = lastSale ? new Date(lastSale.sellDate) : null;
    const normalizedLastSaleDate =
      lastSaleDate instanceof Date && !Number.isNaN(lastSaleDate.getTime()) ? lastSaleDate : null;

    return {
      totalQuantity,
      totalProceedsUsd,
      totalCostUsd,
      totalProfitUsd,
      totalReturnPercent,
      averageEntryPrice,
      averageExitPrice,
      averageHoldingDays,
      lastSaleDate: normalizedLastSaleDate,
      lastSalePrice: lastSale?.sellPrice ?? null,
    };
  }, [isClosed, realizedSales]);

  const lastSaleTimestamp = closedSummary?.lastSaleDate?.getTime();

  const effectiveSparklineData = useMemo(() => {
    const points = sparklineData ?? [];

    if (!isClosed || !lastSaleTimestamp) {
      return points;
    }

    const limited = points.filter((point) => point.timestamp <= lastSaleTimestamp);
    return limited.length > 0 ? limited : points;
  }, [isClosed, lastSaleTimestamp, sparklineData]);

  const effectiveSparklineEvents = useMemo(() => {
    if (!isClosed || !lastSaleTimestamp) {
      return sparklineEvents;
    }

    return sparklineEvents.filter((event) => event.timestamp <= lastSaleTimestamp);
  }, [isClosed, lastSaleTimestamp, sparklineEvents]);

  const finalSparklineClose = useMemo(() => {
    if (!effectiveSparklineData.length) {
      return null;
    }

    const lastPoint = effectiveSparklineData[effectiveSparklineData.length - 1];
    return typeof lastPoint?.close === 'number' && Number.isFinite(lastPoint.close)
      ? lastPoint.close
      : null;
  }, [effectiveSparklineData]);

  const realizedExitPrice = useMemo(() => {
    if (!closedSummary) {
      return null;
    }

    const { lastSalePrice, averageExitPrice } = closedSummary;

    if (typeof lastSalePrice === 'number' && Number.isFinite(lastSalePrice) && lastSalePrice > 0) {
      return lastSalePrice;
    }

    if (typeof averageExitPrice === 'number' && Number.isFinite(averageExitPrice) && averageExitPrice > 0) {
      return averageExitPrice;
    }

    return null;
  }, [closedSummary]);

  const sparklineReferencePrice = useMemo(() => {
    if (isClosed) {
      if (realizedExitPrice !== null) {
        return realizedExitPrice;
      }

      if (finalSparklineClose !== null) {
        return finalSparklineClose;
      }

      return currentPrice;
    }

    if (finalSparklineClose !== null) {
      return finalSparklineClose;
    }

    return currentPrice;
  }, [isClosed, realizedExitPrice, finalSparklineClose, currentPrice]);

  const sparklineColor = useMemo(() => {
    if (typeof sparklineReferencePrice === 'number' && Number.isFinite(sparklineReferencePrice)) {
      if (sparklineReferencePrice < position.entryPrice) {
        return { className: 'text-[var(--color-red-400)]', hex: 'var(--color-red-400)' } as const;
      }

      if (
        typeof projectedPrice === 'number' &&
        Number.isFinite(projectedPrice) &&
        projectedPrice > position.entryPrice &&
        sparklineReferencePrice >= projectedPrice
      ) {
        return { className: 'text-[var(--color-emerald-400)]', hex: 'var(--color-emerald-400)' } as const;
      }
    }

    return { className: 'text-[var(--color-primary-500)]', hex: 'var(--color-primary-500)' } as const;
  }, [sparklineReferencePrice, position.entryPrice, projectedPrice]);

  const getTrendStyles = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-[var(--color-emerald-500)]',
        badge: 'bg-[var(--color-emerald-50)] text-[var(--color-emerald-500)]',
      };
    }

    if (value < 0) {
      return {
        text: 'text-[var(--color-red-500)]',
        badge: 'bg-[var(--color-red-50)] text-[var(--color-red-500)]',
      };
    }

    return {
      text: 'text-[var(--color-slate-600)]',
      badge: 'bg-[var(--color-slate-100)] text-[var(--color-slate-500)]',
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
  const combinedStyles = getTrendStyles(combined);
  const changeFromEntryStyles = changeFromEntryPercent !== null ? getTrendStyles(changeFromEntryPercent) : null;

  const percentText = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value, locale)}`;

  const closedStats = closedSummary
    ? [
        {
          key: 'quantity',
          label: t.dashboard.closedQuantitySold,
          value: formatNumber(closedSummary.totalQuantity, locale),
        },
        {
          key: 'average-entry',
          label: t.dashboard.closedAverageEntry,
          value: formatCurrency(closedSummary.averageEntryPrice, 'USD', locale),
        },
        {
          key: 'average-exit',
          label: t.dashboard.closedAverageExit,
          value: formatCurrency(closedSummary.averageExitPrice, 'USD', locale),
        },
        {
          key: 'proceeds',
          label: t.dashboard.closedTotalProceeds,
          value: formatCurrency(closedSummary.totalProceedsUsd, 'USD', locale),
        },
        {
          key: 'profit',
          label: t.dashboard.closedTotalProfit,
          value: formatCurrency(closedSummary.totalProfitUsd, 'USD', locale),
          tone: getTrendStyles(closedSummary.totalProfitUsd),
        },
        {
          key: 'return',
          label: t.dashboard.closedTotalReturn,
          value: percentText(closedSummary.totalReturnPercent),
          tone: getTrendStyles(closedSummary.totalReturnPercent),
        },
      ]
    : [];

  const sparklineProjectedPrice = isClosed ? undefined : projectedPrice;
  const sparklineAnnualGrowthRate = isClosed ? undefined : settings.annualGrowthRate;
  const sparklineYearsHeld = isClosed ? undefined : yearsHeld;

  const [isHovered, setIsHovered] = useState(false);

  const setHoveredTrue = useCallback(() => {
    setIsHovered(true);
  }, []);

  const setHoveredFalse = useCallback(() => {
    setIsHovered(false);
  }, []);

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card transition-all duration-300 ease-out will-change-transform transform-gpu',
        isHovered
          ? '-translate-y-1 border-overlay-blue-200 shadow-2xl'
          : 'translate-y-0 border-[color:var(--color-slate-200)]/70 shadow-lg'
      )}
      onPointerEnter={setHoveredTrue}
      onPointerLeave={setHoveredFalse}
      onFocusCapture={setHoveredTrue}
      onBlurCapture={setHoveredFalse}
      onTouchStart={setHoveredTrue}
      onTouchEnd={setHoveredFalse}
      onTouchCancel={setHoveredFalse}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-10 top-0 h-32 rounded-full bg-gradient-to-r from-blue-500/25 via-primary-400/20 to-transparent blur-3xl transition-opacity duration-500',
          isHovered ? 'opacity-90' : 'opacity-0'
        )}
      />

      <div className="relative z-10 flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        {isClosed ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="relative">
                  <Avatar className="h-12 w-12 rounded-2xl border border-[color:var(--color-neutral-white)]/60 bg-slate-100 shadow-sm ring-2 ring-blue-100 sm:h-14 sm:w-14">
                    <AvatarImage src={position.imageUrl} alt={position.display} />
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 className="text-base font-semibold text-slate-900 sm:text-xl">
                      {position.display}
                    </h3>
                    <Badge variant="secondary" className="border border-blue-100 bg-blue-50 text-blue-700">
                      {position.symbol}
                    </Badge>
                    <span className="inline-flex items-center gap-1.5">
                      <BankBadge
                        bank={position.location === 'bank_two' ? 'bank_two' : 'bank_one'}
                        locale={locale}
                        size="sm"
                      />
                      <span className="text-xs font-medium text-slate-600 sm:text-sm">
                        {position.location === 'bank_two' ? t.positions.bankTwo : t.positions.bankOne}
                      </span>
                    </span>
                    <Badge variant="secondary" className="border border-emerald-100 bg-emerald-50 text-emerald-700">
                      {t.dashboard.closedBadge}
                    </Badge>
                  </div>
                  {closedSummary?.lastSaleDate && (
                    <p className="text-xs text-slate-500 sm:text-sm">
                      {t.dashboard.closedLastSale}:{' '}
                      <span className="font-medium text-slate-700">
                        {formatDate(closedSummary.lastSaleDate.toISOString(), locale)}
                        {closedSummary.lastSalePrice !== null ? (
                          <>
                            {' · '}
                            {formatCurrency(closedSummary.lastSalePrice, 'USD', locale)}
                          </>
                        ) : null}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {closedStats.length > 0 && (
              <div className="grid gap-2.5 text-xs text-slate-600 sm:grid-cols-2 sm:gap-3 sm:text-sm md:grid-cols-3">
                {closedStats.map((stat) => (
                  <div key={stat.key} className="rounded-2xl bg-overlay-slate-50 p-2.5 shadow-sm sm:p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{stat.label}</p>
                    <p className={`mt-1 text-sm font-semibold ${stat.tone?.text ?? 'text-slate-900'} sm:text-base`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {effectiveSparklineData.length > 1 && (
              <div className="rounded-3xl border border-[color:var(--color-slate-100)]/70 bg-[color:var(--color-slate-50)]/70 p-3 sm:p-4">
                <Sparkline
                  points={effectiveSparklineData}
                  height={130}
                  color={sparklineColor.hex}
                  baseline={position.entryPrice}
                  baselineColor="rgba(var(--color-slate-400-rgb), 0.5)"
                  projectedPrice={sparklineProjectedPrice}
                  annualGrowthRate={sparklineAnnualGrowthRate}
                  yearsHeld={sparklineYearsHeld}
                  events={effectiveSparklineEvents}
                  className="h-32 w-full sm:h-36"
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2.5 sm:gap-3">
              {forecastEnabled ? (
                <Link
                  href={`/stock/${position.symbol}/forecast`}
                  className="group inline-flex items-center gap-1 text-sm font-semibold text-primary-500 transition-colors hover:text-primary-600"
                >
                  {t.dashboard.viewForecast}
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              ) : null}
              <Link
                href={`/stock/${position.symbol}`}
                className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                {t.dashboard.viewDetails}
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="relative">
                  <Avatar className="h-12 w-12 rounded-2xl border border-[color:var(--color-neutral-white)]/60 bg-slate-100 shadow-sm ring-2 ring-blue-100 sm:h-14 sm:w-14">
                    <AvatarImage src={position.imageUrl} alt={position.display} />
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  {changeFromEntryPercent !== null && (
                    <Badge
                      variant="secondary"
                      className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border-0 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${changeFromEntryStyles?.badge ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {percentText(changeFromEntryPercent)}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 className="text-base font-semibold text-slate-900 sm:text-xl">{position.display}</h3>
                    <Badge variant="secondary" className="border border-blue-100 bg-blue-50 text-blue-700">
                      {position.symbol}
                    </Badge>
                    <span className="inline-flex items-center gap-1.5">
                      <BankBadge
                        bank={position.location === 'bank_two' ? 'bank_two' : 'bank_one'}
                        locale={locale}
                        size="sm"
                      />
                      <span className="text-xs font-medium text-slate-600 sm:text-sm">
                        {position.location === 'bank_two' ? t.positions.bankTwo : t.positions.bankOne}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    {t.dashboard.since} {formatDate(position.entryDate, locale)}
                  </p>
                </div>
              </div>

              {dailyChangeAmount !== null && dailyChangeStyles && dailyChangePercent !== undefined && (
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 rounded-full border-0 bg-[color:var(--color-neutral-white)]/70 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur ${dailyChangeStyles.badge}`}
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

            <div className="grid grid-cols-2 gap-2.5 text-xs text-slate-600 sm:gap-3 sm:text-sm">
              <div className="rounded-2xl bg-overlay-slate-50 p-2.5 shadow-sm sm:p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{t.dashboard.quantity}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{formatNumber(position.quantity, locale)}</p>
              </div>
              <div className="rounded-2xl bg-overlay-slate-50 p-2.5 shadow-sm sm:p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">{t.dashboard.entryPrice}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{formatCurrency(position.entryPrice, 'USD', locale)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-overlay-slate-100 bg-[color:var(--color-slate-50)]/70 p-3 shadow-inner sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{t.dashboard.current}</p>
                <dl className="mt-2 space-y-2.5 text-xs text-slate-600 sm:mt-3 sm:space-y-3 sm:text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t.dashboard.price}</dt>
                    <dd className="text-sm font-semibold text-slate-900 sm:text-base">{formatCurrency(currentPrice, 'USD', locale)}</dd>
                  </div>
                  <div className={`flex items-center justify-between gap-2 ${currentPnLStyles.text}`}>
                    <dt>{t.dashboard.pnl} USD</dt>
                    <dd className="text-sm font-semibold sm:text-base">{formatCurrency(positionPnLUsd, 'USD', locale)}</dd>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={`flex items-center justify-between gap-2 ${currentPnLStyles.text}`}>
                      <dt>{t.dashboard.pnl} ILS</dt>
                      <dd className="text-sm font-semibold sm:text-base">{formatCurrency(positionPnLIls, 'ILS', locale)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-3xl border border-overlay-slate-100 bg-[color:var(--color-neutral-white)]/70 p-3 shadow-inner sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{t.dashboard.projected}</p>
                <dl className="mt-2 space-y-2.5 text-xs text-slate-600 sm:mt-3 sm:space-y-3 sm:text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t.dashboard.weightedProjectedPrice}</dt>
                    <dd className="text-sm font-semibold text-slate-900 sm:text-base">{formatCurrency(projectedPrice, 'USD', locale)}</dd>
                  </div>
                  <div className={`flex items-center justify-between gap-2 ${combinedStyles.text}`}>
                    <dt>{t.dashboard.combined} USD</dt>
                    <dd className="text-sm font-semibold sm:text-base">{formatCurrency(combined, 'USD', locale)}</dd>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={`flex items-center justify-between gap-2 ${combinedStyles.text}`}>
                      <dt>{t.dashboard.combined} ILS</dt>
                      <dd className="text-sm font-semibold sm:text-base">{formatCurrency(combinedIls, 'ILS', locale)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {effectiveSparklineData.length > 1 && (
              <div className="rounded-3xl border border-[color:var(--color-slate-100)]/70 bg-[color:var(--color-slate-50)]/70 p-3 sm:p-4">
                <Sparkline
                  points={effectiveSparklineData}
                  height={130}
                  color={sparklineColor.hex}
                  baseline={position.entryPrice}
                  baselineColor="rgba(var(--color-slate-400-rgb), 0.5)"
                  projectedPrice={sparklineProjectedPrice}
                  annualGrowthRate={sparklineAnnualGrowthRate}
                  yearsHeld={sparklineYearsHeld}
                  events={effectiveSparklineEvents}
                  className="h-32 w-full sm:h-36"
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2.5 sm:gap-3">
              {forecastEnabled ? (
                <Link
                  href={`/stock/${position.symbol}/forecast`}
                  className="group inline-flex items-center gap-1 text-sm font-semibold text-primary-500 transition-colors hover:text-primary-600"
                >
                  {t.dashboard.viewForecast}
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              ) : null}
              <Link
                href={`/stock/${position.symbol}`}
                className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                {t.dashboard.viewDetails}
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
