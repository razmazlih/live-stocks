'use client';

import { useCallback, useMemo, useState } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { computeRealizedSales } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkline, SparklineEvent } from './sparkline';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const lastSparklinePrice = useMemo(() => {
    if (isClosed) {
      const salePrice = closedSummary?.lastSalePrice;
      if (typeof salePrice === 'number' && Number.isFinite(salePrice)) {
        return salePrice;
      }
    }

    const lastPoint = effectiveSparklineData[effectiveSparklineData.length - 1];
    if (lastPoint && typeof lastPoint.close === 'number' && Number.isFinite(lastPoint.close)) {
      return lastPoint.close;
    }

    if (!isClosed && Number.isFinite(currentPrice)) {
      return currentPrice;
    }

    return null;
  }, [
    isClosed,
    closedSummary,
    effectiveSparklineData,
    currentPrice,
  ]);

  const sparklineColor = useMemo(() => {
    const defaultColor = { className: 'text-[#2563EB]', hex: '#2563EB' } as const;
    if (typeof lastSparklinePrice !== 'number' || !Number.isFinite(lastSparklinePrice)) {
      return defaultColor;
    }

    if (lastSparklinePrice < position.entryPrice) {
      return { className: 'text-[#D22E2E]', hex: '#D22E2E' } as const;
    }

    const hasProjectedPrice = !Number.isNaN(projectedPrice) && Number.isFinite(projectedPrice);

    if (!isClosed && hasProjectedPrice && lastSparklinePrice > projectedPrice) {
      return { className: 'text-[#4AA956]', hex: '#4AA956' } as const;
    }

    if (isClosed && lastSparklinePrice > position.entryPrice) {
      return { className: 'text-[#4AA956]', hex: '#4AA956' } as const;
    }

    return defaultColor;
  }, [
    isClosed,
    lastSparklinePrice,
    position.entryPrice,
    projectedPrice,
  ]);

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
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white transition-all duration-300 ease-out will-change-transform transform-gpu',
        isHovered
          ? '-translate-y-1 border-blue-200/80 shadow-2xl'
          : 'translate-y-0 border-slate-200/70 shadow-lg'
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
          'pointer-events-none absolute inset-x-10 top-0 h-32 rounded-full bg-gradient-to-r from-blue-500/25 via-indigo-400/20 to-transparent blur-3xl transition-opacity duration-500',
          isHovered ? 'opacity-90' : 'opacity-0'
        )}
      />

      <div className="relative z-10 flex flex-1 flex-col gap-6 p-6">
        {isClosed ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-14 w-14 rounded-2xl border border-white/60 bg-slate-100 shadow-sm ring-2 ring-blue-100">
                    <AvatarImage src={position.imageUrl} alt={position.display} />
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">{position.display}</h3>
                    <Badge variant="secondary" className="border border-blue-100 bg-blue-50 text-blue-700">
                      {position.symbol}
                    </Badge>
                    <Badge variant="secondary" className="border border-emerald-100 bg-emerald-50 text-emerald-700">
                      {t.dashboard.closedBadge}
                    </Badge>
                  </div>
                  {closedSummary?.lastSaleDate && (
                    <p className="text-sm text-slate-500">
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
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 md:grid-cols-3">
                {closedStats.map((stat) => (
                  <div key={stat.key} className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
                    <p className={`mt-1 text-base font-semibold ${stat.tone?.text ?? 'text-slate-900'}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {effectiveSparklineData.length > 1 && (
              <div className="rounded-3xl border border-slate-100/70 bg-slate-50/70 p-4">
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
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-14 w-14 rounded-2xl border border-white/60 bg-slate-100 shadow-sm ring-2 ring-blue-100">
                    <AvatarImage src={position.imageUrl} alt={position.display} />
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                      {position.symbol.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  {changeFromEntryPercent !== null && (
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
                    {t.dashboard.since} {formatDate(position.entryDate, locale)}
                  </p>
                </div>
              </div>

              {dailyChangeAmount !== null && dailyChangeStyles && dailyChangePercent !== undefined && (
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

            {effectiveSparklineData.length > 1 && (
              <div className="rounded-3xl border border-slate-100/70 bg-slate-50/70 p-4">
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
          </>
        )}
      </div>
    </div>
  );
}
