'use client';

import { useCallback, useMemo, useState } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { computeRealizedSales } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Avatar, Button, Card, CardBody, CardFooter, Chip, Divider } from '@heroui/react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Sparkline, SparklineEvent } from '@/components/charts/sparkline';
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
        return { className: 'text-[#D22E2E]', hex: '#D22E2E' } as const;
      }

      if (
        typeof projectedPrice === 'number' &&
        Number.isFinite(projectedPrice) &&
        projectedPrice > position.entryPrice &&
        sparklineReferencePrice >= projectedPrice
      ) {
        return { className: 'text-[#4AA956]', hex: '#4AA956' } as const;
      }
    }

    return { className: 'text-[#2563EB]', hex: '#2563EB' } as const;
  }, [sparklineReferencePrice, position.entryPrice, projectedPrice]);

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
      radius="lg"
      shadow="lg"
      className={cn(
        'group relative flex h-full flex-col transition-all duration-300 ease-out will-change-transform',
        isHovered ? '-translate-y-1 ring-2 ring-primary/40' : 'translate-y-0'
      )}
      onPointerEnter={setHoveredTrue}
      onPointerLeave={setHoveredFalse}
      onFocusCapture={setHoveredTrue}
      onBlurCapture={setHoveredFalse}
      onTouchStart={setHoveredTrue}
      onTouchEnd={setHoveredFalse}
      onTouchCancel={setHoveredFalse}
    >
      <CardBody className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar
                src={position.imageUrl ?? undefined}
                name={position.display}
                radius="lg"
                className="h-14 w-14 border border-default-200 bg-primary/10 text-primary"
              />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground sm:text-xl">{position.display}</h3>
                  <Chip size="sm" variant="flat" color="primary">
                    {position.symbol}
                  </Chip>
                  {isClosed ? (
                    <Chip size="sm" variant="flat" color="success">
                      {t.dashboard.closedBadge}
                    </Chip>
                  ) : null}
                  {!isClosed && changeFromEntryPercent !== null ? (
                    <Chip
                      size="sm"
                      variant="flat"
                      className={cn('text-xs font-semibold', changeFromEntryStyles?.badge)}
                    >
                      {percentText(changeFromEntryPercent)}
                    </Chip>
                  ) : null}
                </div>
                {isClosed ? (
                  closedSummary?.lastSaleDate ? (
                    <p className="text-sm text-foreground/70">
                      {t.dashboard.closedLastSale}{' '}
                      <span className="font-medium text-foreground">
                        {formatDate(closedSummary.lastSaleDate.toISOString(), locale)}
                        {closedSummary.lastSalePrice !== null ? (
                          <>
                            {' · '}
                            {formatCurrency(closedSummary.lastSalePrice, 'USD', locale)}
                          </>
                        ) : null}
                      </span>
                    </p>
                  ) : null
                ) : (
                  <p className="text-sm text-foreground/70">
                    {t.dashboard.since} {formatDate(position.entryDate, locale)}
                  </p>
                )}
              </div>
            </div>
            {dailyChangeAmount !== null && dailyChangeStyles && dailyChangePercent !== undefined ? (
              <Chip
                size="sm"
                variant="flat"
                className={cn('items-start gap-2 px-3 py-2 text-xs font-semibold', dailyChangeStyles.badge)}
                startContent={dailyChangeIcon}
              >
                <div className="flex flex-col items-start leading-tight">
                  <span>{t.dashboard.dailyChange}</span>
                  <span>{formatCurrency(dailyChangeAmount, 'USD', locale)}</span>
                  <span>{percentText(dailyChangePercent)}</span>
                </div>
              </Chip>
            ) : null}
          </div>
        </div>

        <Divider />

        {isClosed ? (
          <>
            {closedStats.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {closedStats.map((stat) => (
                  <Card key={stat.key} radius="md" shadow="sm" className="bg-content1/40">
                    <CardBody className="space-y-2 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{stat.label}</p>
                      <p className={cn('text-base font-semibold', stat.tone?.text ?? 'text-foreground')}>
                        {stat.value}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}

            {effectiveSparklineData.length > 1 && (
              <Card radius="lg" shadow="sm" className="border border-default-200 bg-content1/40">
                <CardBody className="p-4">
                  <Sparkline
                    points={effectiveSparklineData}
                    height={140}
                    color={sparklineColor.hex}
                    baseline={position.entryPrice}
                    baselineColor="rgba(148, 163, 184, 0.5)"
                    projectedPrice={sparklineProjectedPrice}
                    annualGrowthRate={sparklineAnnualGrowthRate}
                    yearsHeld={sparklineYearsHeld}
                    events={effectiveSparklineEvents}
                    className="h-36 w-full"
                  />
                </CardBody>
              </Card>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Card radius="md" shadow="sm" className="bg-content1/40">
                <CardBody className="space-y-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{t.dashboard.quantity}</p>
                  <p className="text-base font-semibold text-foreground">
                    {formatNumber(position.quantity, locale)}
                  </p>
                </CardBody>
              </Card>
              <Card radius="md" shadow="sm" className="bg-content1/40">
                <CardBody className="space-y-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{t.dashboard.entryPrice}</p>
                  <p className="text-base font-semibold text-foreground">
                    {formatCurrency(position.entryPrice, 'USD', locale)}
                  </p>
                </CardBody>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card radius="lg" shadow="sm" className="border border-default-200 bg-content1/40">
                <CardBody className="space-y-3 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{t.dashboard.current}</p>
                  <div className="flex items-center justify-between text-sm text-foreground/70">
                    <span>{t.dashboard.price}</span>
                    <span className="text-base font-semibold text-foreground">
                      {formatCurrency(currentPrice, 'USD', locale)}
                    </span>
                  </div>
                  <div className={cn('flex items-center justify-between text-sm', currentPnLStyles.text)}>
                    <span>{t.dashboard.pnl} USD</span>
                    <span className="text-base font-semibold">
                      {formatCurrency(positionPnLUsd, 'USD', locale)}
                    </span>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={cn('flex items-center justify-between text-sm', currentPnLStyles.text)}>
                      <span>{t.dashboard.pnl} ILS</span>
                      <span className="text-base font-semibold">
                        {formatCurrency(positionPnLIls, 'ILS', locale)}
                      </span>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card radius="lg" shadow="sm" className="border border-default-200 bg-content1/40">
                <CardBody className="space-y-3 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{t.dashboard.projected}</p>
                  <div className="flex items-center justify-between text-sm text-foreground/70">
                    <span>{t.dashboard.weightedProjectedPrice}</span>
                    <span className="text-base font-semibold text-foreground">
                      {formatCurrency(projectedPrice, 'USD', locale)}
                    </span>
                  </div>
                  <div className={cn('flex items-center justify-between text-sm', combinedStyles.text)}>
                    <span>{t.dashboard.combined} USD</span>
                    <span className="text-base font-semibold">
                      {formatCurrency(combined, 'USD', locale)}
                    </span>
                  </div>
                  {settings.currency === 'ILS' && (
                    <div className={cn('flex items-center justify-between text-sm', combinedStyles.text)}>
                      <span>{t.dashboard.combined} ILS</span>
                      <span className="text-base font-semibold">
                        {formatCurrency(combinedIls, 'ILS', locale)}
                      </span>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {effectiveSparklineData.length > 1 && (
              <Card radius="lg" shadow="sm" className="border border-default-200 bg-content1/40">
                <CardBody className="p-4">
                  <Sparkline
                    points={effectiveSparklineData}
                    height={140}
                    color={sparklineColor.hex}
                    baseline={position.entryPrice}
                    baselineColor="rgba(148, 163, 184, 0.5)"
                    projectedPrice={sparklineProjectedPrice}
                    annualGrowthRate={sparklineAnnualGrowthRate}
                    yearsHeld={sparklineYearsHeld}
                    events={effectiveSparklineEvents}
                    className="h-36 w-full"
                  />
                </CardBody>
              </Card>
            )}
          </>
        )}
      </CardBody>
      <CardFooter className="flex flex-wrap justify-end gap-3 border-t border-default-100 bg-content1/40 py-4">
        {forecastEnabled && !isClosed ? (
          <Button
            as={Link}
            href={`/stock/${position.symbol}/forecast`}
            size="sm"
            variant="flat"
            color="secondary"
            endContent={<ArrowUpRight className="h-4 w-4" />}
          >
            {t.dashboard.viewForecast}
          </Button>
        ) : null}
        <Button
          as={Link}
          href={`/stock/${position.symbol}`}
          size="sm"
          variant="flat"
          color="primary"
          endContent={<ArrowUpRight className="h-4 w-4" />}
        >
          {t.dashboard.viewDetails}
        </Button>
      </CardFooter>
    </Card>
  );
}
