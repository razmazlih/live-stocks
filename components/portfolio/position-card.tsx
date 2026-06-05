'use client';

import { ReactNode, useCallback, useMemo, useState } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { computeRealizedSales } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Badge } from '@/components/ui/badge';
import { BankBadge } from '@/components/branding/bank-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
import { Sparkline, SparklineEvent } from '@/components/charts/sparkline';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getTrendIcon, getTrendTone } from '@/lib/display/trends';
import { cn } from '@/lib/utils';

interface PositionCardProps {
  metrics: PositionMetrics;
  sparklineData?: HistoricalPoint[];
  closedSelector?: ReactNode;
}

export function PositionCard({ metrics, sparklineData, closedSelector }: PositionCardProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const {
    position,
    currentPrice,
    positionPnLUsd,
    positionPnLIls,
    projectedPrice,
    combined,
    combinedIls,
    yearsHeld,
    currentValue,
    currentValueIls,
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
        return { className: 'text-[var(--color-green-400)]', hex: 'var(--color-green-400)' } as const;
      }
    }

    return { className: 'text-[var(--color-primary-500)]', hex: 'var(--color-primary-500)' } as const;
  }, [sparklineReferencePrice, position.entryPrice, projectedPrice]);

  const dailyChangeValue = typeof metrics.dailyChange === 'number' ? metrics.dailyChange : null;
  const dailyChangePercent = metrics.dailyChangePercent;
  const percentText = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value, locale)}`;
  const dailyChangeAmount = dailyChangeValue !== null ? dailyChangeValue * position.quantity : null;
  const dailyChangeStyles = dailyChangeAmount !== null ? getTrendTone(dailyChangeAmount) : null;
  const dailyChangePercentText =
    typeof dailyChangePercent === 'number' && Number.isFinite(dailyChangePercent)
      ? percentText(dailyChangePercent)
      : null;
  const dailyChangeBannerClassName =
    dailyChangeAmount === null
      ? 'border-slate-200/80 bg-gradient-to-r from-slate-100/95 via-white to-slate-100/95'
      : dailyChangeAmount > 0
        ? 'border-emerald-200/75 bg-gradient-to-r from-emerald-100/80 via-emerald-50/55 to-white'
        : dailyChangeAmount < 0
          ? 'border-rose-200/75 bg-gradient-to-r from-rose-100/80 via-rose-50/55 to-white'
          : 'border-slate-200/80 bg-gradient-to-r from-slate-100/95 via-white to-slate-100/95';
  const dailyChangeIcon = dailyChangeAmount !== null
    ? getTrendIcon(dailyChangeAmount, 'h-3.5 w-3.5')
    : null;

  const currentPnLStyles = getTrendTone(positionPnLUsd);
  const combinedStyles = getTrendTone(combined);
  const changeFromEntryStyles = changeFromEntryPercent !== null ? getTrendTone(changeFromEntryPercent) : null;

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
          tone: getTrendTone(closedSummary.totalProfitUsd),
        },
        {
          key: 'return',
          label: t.dashboard.closedTotalReturn,
          value: percentText(closedSummary.totalReturnPercent),
          tone: getTrendTone(closedSummary.totalReturnPercent),
        },
      ]
    : [];

  const openSnapshotCards = [
    {
      key: 'value-usd',
      label: t.dashboard.positionValueUsd,
      value: formatCurrency(currentValue, 'USD', locale),
      isPrimary: true,
    },
    {
      key: 'value-ils',
      label: t.dashboard.positionValueIls,
      value: formatCurrency(currentValueIls, 'ILS', locale),
      isPrimary: true,
    },
    {
      key: 'quantity',
      label: t.dashboard.quantity,
      value: formatNumber(position.quantity, locale),
      isPrimary: false,
    },
    {
      key: 'entry-price',
      label: t.dashboard.entryPrice,
      value: formatCurrency(position.entryPrice, 'USD', locale),
      isPrimary: false,
    },
  ];

  const valueDirectionClass =
    'block w-full text-left [direction:ltr] [unicode-bidi:isolate] tabular-nums';

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
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white transition-colors duration-200',
        isHovered
          ? 'border-blue-200 shadow-md'
          : 'border-slate-200 shadow-sm'
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
          'pointer-events-none absolute inset-x-0 top-0 h-px bg-blue-500 transition-opacity duration-300',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div className="relative z-10 flex flex-1 flex-col gap-3 p-3.5 sm:gap-4 sm:p-4">
        {isClosed ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="relative">
                  <Avatar className="h-12 w-12 rounded-lg border border-slate-200 bg-slate-100 shadow-sm sm:h-14 sm:w-14">
                    <StockAvatarImage
                      symbol={position.symbol}
                      display={position.display}
                      imageUrl={position.imageUrl}
                    />
                    <AvatarFallback className="bg-blue-50 text-blue-700 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 className="text-base font-semibold text-slate-900 sm:text-xl">
                      {position.display}
                    </h3>
                    <Badge variant="secondary" className="rounded-md border border-blue-100 bg-blue-50 text-blue-700">
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
                    <Badge variant="secondary" className="rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700">
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
                  {closedSelector ? (
                    <div className="pt-1">
                      {closedSelector}
                    </div>
                  ) : null}
                </div>
              </div>
              </div>
            </div>

            {closedStats.length > 0 && (
              <div className="grid gap-2.5 text-xs text-slate-600 sm:grid-cols-2 sm:gap-3 sm:text-sm md:grid-cols-3">
                {closedStats.map((stat) => (
                  <div
                    key={stat.key}
                    className={cn(
                      'rounded-lg border p-2.5 sm:p-3',
                      stat.tone?.surface ?? 'border-slate-100 bg-overlay-slate-50'
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{stat.label}</p>
                    <p className={`mt-1 text-sm font-semibold ${stat.tone?.text ?? 'text-slate-900'} sm:text-base`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {effectiveSparklineData.length > 1 && (
              <div className="relative p-1 sm:p-1.5">
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
            <div className="flex flex-col gap-2.5 sm:gap-3">
              {dailyChangeAmount !== null && dailyChangeStyles && (
                <div
                  className={cn(
                    'rounded-lg border px-3 py-1.5',
                    dailyChangeBannerClassName
                  )}
                >
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <div className={cn('inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.11em]', dailyChangeStyles.text)}>
                      {dailyChangeIcon}
                      <span>{t.dashboard.dailyChange}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <span className={cn('text-[clamp(0.98rem,1.2vw,1.08rem)] font-semibold leading-none', dailyChangeStyles.text)}>
                        <span className={valueDirectionClass}>{formatCurrency(dailyChangeAmount, 'USD', locale)}</span>
                      </span>
                      {dailyChangePercentText && (
                        <span className={cn('inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none', dailyChangeStyles.badge)}>
                          <span className={valueDirectionClass}>{dailyChangePercentText}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="relative">
                  <Avatar className="h-12 w-12 rounded-lg border border-slate-200 bg-slate-100 shadow-sm sm:h-14 sm:w-14">
                    <StockAvatarImage
                      symbol={position.symbol}
                      display={position.display}
                      imageUrl={position.imageUrl}
                    />
                    <AvatarFallback className="bg-blue-50 text-blue-700 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  {changeFromEntryPercent !== null && (
                    <Badge
                      variant="secondary"
                      className={`absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-md border-0 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${changeFromEntryStyles?.badge ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {percentText(changeFromEntryPercent)}
                    </Badge>
                  )}
                </div>

                <div className="min-w-0 space-y-1.5 sm:space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h3 className="min-w-0 text-base font-semibold leading-tight text-slate-900 sm:text-xl">
                      {position.display}
                    </h3>
                    <Badge variant="secondary" className="rounded-md border border-blue-100 bg-blue-50 text-blue-700">
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
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:gap-2.5 sm:text-sm">
              {openSnapshotCards.map((stat) => (
                <div
                  key={stat.key}
                  className={cn(
                    'rounded-lg border p-2 sm:p-2.5',
                    stat.isPrimary
                      ? 'border-blue-100 bg-blue-50'
                      : 'border-slate-200 bg-slate-50'
                  )}
                >
                  <p
                    className={cn(
                      'text-[11px] font-semibold uppercase tracking-wide sm:text-xs',
                      stat.isPrimary ? 'text-blue-700' : 'text-slate-400'
                    )}
                  >
                    {stat.label}
                  </p>
                  <p
                    className={cn(
                      'mt-1 font-semibold leading-tight text-slate-900',
                      stat.isPrimary ? 'text-[clamp(0.9rem,2.5vw,1.15rem)]' : 'text-[clamp(0.85rem,2.3vw,1rem)]'
                    )}
                  >
                    <span className={valueDirectionClass}>{stat.value}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
              <div className="relative space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {t.dashboard.current} / {t.dashboard.projected}
                  </p>
                  <Badge className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    USD / ILS
                  </Badge>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <section className="rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                    <p className="text-xs font-semibold text-blue-700">{t.dashboard.current}</p>
                    <dl className="mt-1.5 space-y-1.5">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.price}</dt>
                        <dd className="mt-0.5 text-base font-bold leading-tight text-slate-900">
                          <span className={valueDirectionClass}>{formatCurrency(currentPrice, 'USD', locale)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.pnl} USD</dt>
                        <dd className={cn('mt-0.5 text-base font-bold leading-tight', currentPnLStyles.text)}>
                          <span className={valueDirectionClass}>{formatCurrency(positionPnLUsd, 'USD', locale)}</span>
                        </dd>
                      </div>
                      {settings.currency === 'ILS' && (
                        <div>
                          <dt className="text-xs font-medium text-slate-500">{t.dashboard.pnl} ILS</dt>
                          <dd className={cn('mt-0.5 text-base font-bold leading-tight', currentPnLStyles.text)}>
                            <span className={valueDirectionClass}>{formatCurrency(positionPnLIls, 'ILS', locale)}</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-2.5">
                    <p className="text-xs font-semibold text-indigo-700">{t.dashboard.projected}</p>
                    <dl className="mt-1.5 space-y-1.5">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.weightedProjectedPrice}</dt>
                        <dd className="mt-0.5 text-base font-bold leading-tight text-slate-900">
                          <span className={valueDirectionClass}>{formatCurrency(projectedPrice, 'USD', locale)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.combined} USD</dt>
                        <dd className={cn('mt-0.5 text-base font-bold leading-tight', combinedStyles.text)}>
                          <span className={valueDirectionClass}>{formatCurrency(combined, 'USD', locale)}</span>
                        </dd>
                      </div>
                      {settings.currency === 'ILS' && (
                        <div>
                          <dt className="text-xs font-medium text-slate-500">{t.dashboard.combined} ILS</dt>
                          <dd className={cn('mt-0.5 text-base font-bold leading-tight', combinedStyles.text)}>
                            <span className={valueDirectionClass}>{formatCurrency(combinedIls, 'ILS', locale)}</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>
                </div>
              </div>
            </div>

            {effectiveSparklineData.length > 1 && (
              <div className="relative p-0.5 sm:p-1">
                <Sparkline
                  points={effectiveSparklineData}
                  height={108}
                  color={sparklineColor.hex}
                  baseline={position.entryPrice}
                  baselineColor="rgba(var(--color-slate-400-rgb), 0.5)"
                  projectedPrice={sparklineProjectedPrice}
                  annualGrowthRate={sparklineAnnualGrowthRate}
                  yearsHeld={sparklineYearsHeld}
                  events={effectiveSparklineEvents}
                  className="h-24 w-full sm:h-28"
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 sm:gap-2.5">
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
