'use client';

import { useCallback, useMemo, useState } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { computeRealizedSales } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Avatar, Button, Card, CardBody, CardFooter, CardHeader, Chip } from '@heroui/react';
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
        return { className: 'text-rose-400', hex: '#F43F5E' } as const;
      }

      if (
        typeof projectedPrice === 'number' &&
        Number.isFinite(projectedPrice) &&
        projectedPrice > position.entryPrice &&
        sparklineReferencePrice >= projectedPrice
      ) {
        return { className: 'text-emerald-400', hex: '#34D399' } as const;
      }
    }

    return { className: 'text-sky-400', hex: '#38BDF8' } as const;
  }, [sparklineReferencePrice, position.entryPrice, projectedPrice]);

  const getTrendStyles = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-emerald-300',
        badge: 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
      } as const;
    }

    if (value < 0) {
      return {
        text: 'text-rose-300',
        badge: 'border border-rose-400/30 bg-rose-500/10 text-rose-200',
      } as const;
    }

    return {
      text: 'text-white/70',
      badge: 'border border-white/20 bg-white/10 text-white/70',
    } as const;
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
    <Card
      radius="2xl"
      className={cn(
        'group relative h-full overflow-hidden border-0 bg-gradient-to-br from-slate-900/85 via-slate-900/60 to-slate-950/80 text-white shadow-2xl transition-transform duration-300 ease-out',
        isHovered ? '-translate-y-1 shadow-primary-900/30' : 'translate-y-0 shadow-slate-900/20'
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
        className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-500"
      >
        <div
          className={cn(
            'absolute -right-20 top-[-6rem] h-48 w-48 rounded-full bg-primary-500/40 blur-3xl',
            isHovered ? 'opacity-100' : 'opacity-60'
          )}
        />
        <div
          className={cn(
            'absolute -bottom-24 left-[-3rem] h-56 w-56 rounded-full bg-sky-500/30 blur-3xl',
            isHovered ? 'opacity-100' : 'opacity-60'
          )}
        />
      </div>
      {isClosed ? (
        <>
          <CardHeader className="relative z-10 flex flex-col gap-4 p-6 pb-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <Avatar
                  isBordered
                  radius="lg"
                  color="primary"
                  className="h-14 w-14 text-lg font-semibold"
                  src={position.imageUrl ?? undefined}
                  name={position.display}
                />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white sm:text-xl">{position.display}</h3>
                    <Chip size="sm" variant="flat" radius="sm" className="bg-white/10 text-white/80 backdrop-blur">
                      {position.symbol}
                    </Chip>
                    <Chip
                      size="sm"
                      radius="sm"
                      variant="flat"
                      color="success"
                      className="bg-emerald-500/20 text-emerald-100"
                    >
                      {t.dashboard.closedBadge}
                    </Chip>
                  </div>
                  {closedSummary?.lastSaleDate && (
                    <p className="text-sm text-white/70">
                      {t.dashboard.closedLastSale}{' '}
                      <span className="font-semibold text-white">
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
          </CardHeader>
          <CardBody className="relative z-10 flex flex-1 flex-col gap-6 p-6 pt-4">
            {closedStats.length > 0 && (
              <div className="grid gap-3 text-sm text-white/70 sm:grid-cols-2 xl:grid-cols-3">
                {closedStats.map((stat) => (
                  <div
                    key={stat.key}
                    className={cn(
                      'rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm',
                      stat.tone?.badge
                    )}
                  >
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/50">
                      {stat.label}
                    </p>
                    <p className={cn('mt-3 text-lg font-semibold text-white', stat.tone?.text)}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {effectiveSparklineData.length > 1 && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <Sparkline
                  points={effectiveSparklineData}
                  height={140}
                  color={sparklineColor.hex}
                  baseline={position.entryPrice}
                  baselineColor="rgba(148, 163, 184, 0.35)"
                  projectedPrice={sparklineProjectedPrice}
                  annualGrowthRate={sparklineAnnualGrowthRate}
                  yearsHeld={sparklineYearsHeld}
                  events={effectiveSparklineEvents}
                  className="h-36 w-full"
                />
              </div>
            )}
          </CardBody>
        </>
      ) : (
        <>
          <CardHeader className="relative z-10 flex flex-col gap-4 p-6 pb-0">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <Avatar
                  isBordered
                  radius="lg"
                  color="primary"
                  className="h-14 w-14 text-lg font-semibold"
                  src={position.imageUrl ?? undefined}
                  name={position.display}
                />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white sm:text-xl">{position.display}</h3>
                    <Chip size="sm" variant="flat" radius="sm" className="bg-white/10 text-white/80 backdrop-blur">
                      {position.symbol}
                    </Chip>
                    {changeFromEntryPercent !== null && (
                      <Chip
                        size="sm"
                        radius="sm"
                        variant="flat"
                        className={cn('px-2 py-1 text-xs font-semibold', changeFromEntryStyles?.badge)}
                      >
                        {percentText(changeFromEntryPercent)}
                      </Chip>
                    )}
                  </div>
                  <p className="text-sm text-white/70">
                    {t.dashboard.since}{' '}
                    <span className="font-semibold text-white">{formatDate(position.entryDate, locale)}</span>
                  </p>
                </div>
              </div>
              {dailyChangeAmount !== null && dailyChangeStyles && dailyChangePercent !== undefined && (
                <Chip
                  size="md"
                  radius="lg"
                  variant="flat"
                  className={cn('items-start gap-3 px-4 py-3 text-left', dailyChangeStyles.badge)}
                  startContent={<span className="mt-1 text-base">{dailyChangeIcon}</span>}
                >
                  <div className="flex flex-col leading-tight">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/60">
                      {t.dashboard.dailyChange}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {formatCurrency(dailyChangeAmount, 'USD', locale)}
                    </span>
                    <span className="text-xs font-semibold text-white/80">
                      {percentText(dailyChangePercent)}
                    </span>
                  </div>
                </Chip>
              )}
            </div>
          </CardHeader>
          <CardBody className="relative z-10 flex flex-1 flex-col gap-6 p-6 pt-4">
            <div className="grid grid-cols-2 gap-3 text-sm text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/50">
                  {t.dashboard.quantity}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatNumber(position.quantity, locale)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/50">
                  {t.dashboard.entryPrice}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatCurrency(position.entryPrice, 'USD', locale)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/50">
                  {t.dashboard.current}
                </p>
                <dl className="mt-4 space-y-3 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <dt>{t.dashboard.price}</dt>
                    <dd className="text-base font-semibold text-white">
                      {formatCurrency(currentPrice, 'USD', locale)}
                    </dd>
                  </div>
                  <div className={cn('flex items-center justify-between', currentPnLStyles.text)}>
                    <dt>{t.dashboard.pnl} USD</dt>
                    <dd className="text-base font-semibold">
                      {formatCurrency(positionPnLUsd, 'USD', locale)}
                    </dd>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={cn('flex items-center justify-between', currentPnLStyles.text)}>
                      <dt>{t.dashboard.pnl} ILS</dt>
                      <dd className="text-base font-semibold">
                        {formatCurrency(positionPnLIls, 'ILS', locale)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/50">
                  {t.dashboard.projected}
                </p>
                <dl className="mt-4 space-y-3 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <dt>{t.dashboard.weightedProjectedPrice}</dt>
                    <dd className="text-base font-semibold text-white">
                      {formatCurrency(projectedPrice, 'USD', locale)}
                    </dd>
                  </div>
                  <div className={cn('flex items-center justify-between', combinedStyles.text)}>
                    <dt>{t.dashboard.combined} USD</dt>
                    <dd className="text-base font-semibold">
                      {formatCurrency(combined, 'USD', locale)}
                    </dd>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={cn('flex items-center justify-between', combinedStyles.text)}>
                      <dt>{t.dashboard.combined} ILS</dt>
                      <dd className="text-base font-semibold">
                        {formatCurrency(combinedIls, 'ILS', locale)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {effectiveSparklineData.length > 1 && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <Sparkline
                  points={effectiveSparklineData}
                  height={140}
                  color={sparklineColor.hex}
                  baseline={position.entryPrice}
                  baselineColor="rgba(148, 163, 184, 0.35)"
                  projectedPrice={sparklineProjectedPrice}
                  annualGrowthRate={sparklineAnnualGrowthRate}
                  yearsHeld={sparklineYearsHeld}
                  events={effectiveSparklineEvents}
                  className="h-36 w-full"
                />
              </div>
            )}
          </CardBody>
        </>
      )}
      <CardFooter className="relative z-10 flex flex-wrap justify-end gap-3 border-t border-white/10 px-6 py-4 backdrop-blur-sm">
        {forecastEnabled ? (
          <Button
            as={Link}
            href={`/stock/${position.symbol}/forecast`}
            size="sm"
            variant="light"
            color="secondary"
            className="gap-2 text-white/80 hover:text-white"
            endContent={<ArrowUpRight className="h-4 w-4" />}
          >
            {t.dashboard.viewForecast}
          </Button>
        ) : null}
        <Button
          as={Link}
          href={`/stock/${position.symbol}`}
          size="sm"
          color="primary"
          variant="flat"
          className="gap-2 text-white"
          endContent={<ArrowUpRight className="h-4 w-4" />}
        >
          {t.dashboard.viewDetails}
        </Button>
      </CardFooter>
    </Card>
  );
}
