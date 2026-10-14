'use client';

import { ReactNode, useId, useMemo, useState } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent, hasMaterialExitPriceGap } from '@/lib/calculations';
import { computeRealizedSales } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
import { Sparkline, SparklineEvent } from '@/components/charts/sparkline';
import Link from 'next/link';
import { useUrlState } from '@/hooks/use-url-state';
import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';
import { Archive, ArrowUpRight, ChevronDown } from 'lucide-react';
import { getTrendTone } from '@/lib/display/trends';
import { cn } from '@/lib/utils';

interface PositionCardProps {
  metrics: PositionMetrics;
  sparklineData?: HistoricalPoint[];
  closedSelector?: ReactNode;
}

export function PositionCard({ metrics, sparklineData, closedSelector }: PositionCardProps) {
  const { locale, settings } = useApp();
  const [, , sourceUrl] = useUrlState(() => null);
  const { t } = useTranslation(locale);
  const {
    position,
    currentPrice,
    positionPnLUsd,
    projectedPrice,
    requiredExitPrice,
    combined,
    yearsHeld,
    currentValue,
  } = metrics;

  const isClosed = position.quantity <= 0;
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
  const dailyChangeAmount = dailyChangeValue !== null ? dailyChangeValue * position.quantity : null;
  const visibleRequiredExitPrice = !isClosed && hasMaterialExitPriceGap(projectedPrice, requiredExitPrice)
    ? requiredExitPrice : undefined;
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const statusLabel = locale === 'he' ? (isClosed ? 'סגורה · ארכיון' : 'פעילה') : (isClosed ? 'Closed · Archive' : 'Active');
  const toggleLabel = locale === 'he' ? (isExpanded ? 'קיפול פרטים' : 'פתיחת פרטים') : (isExpanded ? 'Hide details' : 'Show details');
  const summaryProfit = isClosed ? closedSummary?.totalProfitUsd : positionPnLUsd;
  const detailStats = isClosed ? [
    { label: t.dashboard.closedQuantitySold, value: closedSummary ? formatNumber(closedSummary.totalQuantity, locale) : '—' },
    { label: t.dashboard.closedAverageEntry, value: closedSummary ? formatCurrency(closedSummary.averageEntryPrice, 'USD', locale) : '—' },
    { label: t.dashboard.closedAverageExit, value: closedSummary ? formatCurrency(closedSummary.averageExitPrice, 'USD', locale) : '—' },
    { label: t.dashboard.closedTotalProceeds, value: closedSummary ? formatCurrency(closedSummary.totalProceedsUsd, 'USD', locale) : '—' },
    { label: t.dashboard.closedTotalReturn, value: closedSummary ? formatPercent(closedSummary.totalReturnPercent, locale) : '—' },
  ] : [
    { label: t.dashboard.quantity, value: formatNumber(position.quantity, locale) },
    { label: t.dashboard.entryPrice, value: formatCurrency(position.entryPrice, 'USD', locale) },
    { label: t.dashboard.current, value: formatCurrency(currentPrice, 'USD', locale) },
    { label: t.dashboard.projected, value: formatCurrency(projectedPrice, 'USD', locale) },
    ...(visibleRequiredExitPrice === undefined ? [] : [{ label: t.dashboard.requiredExitPrice, value: formatCurrency(visibleRequiredExitPrice, 'USD', locale) }]),
  ];

  return (
    <div className={cn(
      'group relative self-start overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-300 motion-reduce:transition-none',
      isClosed ? 'border-slate-200/80 bg-slate-50/70' : 'border-slate-200/80 bg-white',
      isExpanded ? 'shadow-[0_8px_28px_-16px_rgba(15,23,42,0.22)]' : 'shadow-[0_2px_8px_-4px_rgba(15,23,42,0.12)]'
    )}>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="relative z-10 w-full p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <div className="flex items-center gap-2.5">
          <Avatar className="h-10 w-10 shrink-0 rounded-xl border border-slate-100 bg-white">
            <StockAvatarImage symbol={position.symbol} display={position.display} imageUrl={position.imageUrl} />
            <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-600">{position.symbol.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold tracking-tight text-slate-950">{position.display}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500">
              <span dir="ltr" className="font-medium tracking-wide text-slate-500">{position.symbol}</span>
              <span aria-hidden="true">·</span>
              <span>{position.location === 'bank_two' ? 'Pepper' : 'ONE ZERO'}</span>
            </div>
          </div>
          <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium', isClosed ? 'text-slate-500' : 'text-blue-600')}>
            {isClosed ? <Archive aria-hidden="true" className="h-3 w-3" /> : <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
            {statusLabel}
          </span>
          <span className="ms-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100/70 text-slate-500 transition-colors group-hover:bg-slate-200/70 group-hover:text-slate-600">
            <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none', isExpanded && 'rotate-180')} />
          </span>
          <span className="sr-only">{toggleLabel}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <div className={cn('min-w-0', !isClosed && 'col-span-2')}>
            <dt className="text-[10px] font-medium text-slate-500">{isClosed ? t.dashboard.closedLastSale : t.dashboard.positionValueUsd}</dt>
            <dd className={cn('mt-1 font-semibold tracking-tight text-slate-950', isClosed ? 'text-sm' : 'flex items-end justify-between gap-3')}>
              {isClosed ? (closedSummary?.lastSaleDate ? formatDate(closedSummary.lastSaleDate.toISOString(), locale) : '—') : <>
                <bdi className="min-w-0 break-all text-[26px] leading-8 tabular-nums">{formatCurrency(currentValue, 'USD', locale)}</bdi>
                <span className="inline-flex shrink-0 flex-col items-end gap-0.5 pb-0.5">
                  <span className="text-[10px] font-medium leading-4 tracking-normal text-slate-500">{t.dashboard.dailyChange}</span>
                  <bdi className={cn('text-xs leading-4 tabular-nums', dailyChangeAmount === null ? 'text-slate-500' : getTrendTone(dailyChangeAmount).text)}>
                    {dailyChangeAmount === null ? '—' : formatCurrency(dailyChangeAmount, 'USD', locale)}
                  </bdi>
                </span>
              </>}
            </dd>
          </div>
          {!isClosed && <div className="min-w-0">
            <dt className="text-[10px] font-medium text-slate-500">{t.dashboard.forecastGap}</dt>
            <dd className={cn('mt-1 text-sm font-semibold', getTrendTone(combined).text)}>
              <bdi className="tabular-nums">{formatCurrency(combined, 'USD', locale)}</bdi>
            </dd>
          </div>}
          <div className="min-w-0">
            <dt className="text-[10px] font-medium text-slate-500">{isClosed ? t.dashboard.realizedPnL : t.dashboard.pnl}</dt>
            <dd className={cn('mt-1 text-sm font-semibold', summaryProfit === undefined ? 'text-slate-500' : getTrendTone(summaryProfit).text)}>
              <bdi className="tabular-nums">{summaryProfit === undefined ? '—' : formatCurrency(summaryProfit, 'USD', locale)}</bdi>
            </dd>
          </div>
        </dl>
      </button>
      <div
        id={detailsId}
        aria-hidden={!isExpanded}
        ref={(element) => { element?.toggleAttribute('inert', !isExpanded); }}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 px-4 pb-4 pt-1">
            {closedSelector}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              {detailStats.map((stat) => (
                <div key={stat.label} className="min-w-0">
                  <dt className="text-[10px] font-medium leading-4 text-slate-500">{stat.label}</dt>
                  <dd className={cn('mt-1 text-[13px] font-medium tabular-nums', 'text-slate-900')}>
                    <bdi>{stat.value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
            {effectiveSparklineData.length > 1 && (
              <div className="h-12 [direction:ltr]">
                <Sparkline
                  points={effectiveSparklineData}
                  height={48}
                  color={sparklineColor.hex}
                  baseline={position.entryPrice}
                  baselineColor="rgba(var(--color-slate-400-rgb), 0.5)"
                  projectedPrice={isClosed ? undefined : projectedPrice}
                  requiredExitPrice={visibleRequiredExitPrice}
                  annualGrowthRate={isClosed ? undefined : settings.annualGrowthRate}
                  yearsHeld={isClosed ? undefined : yearsHeld}
                  events={effectiveSparklineEvents}
                  className="h-12 w-full"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{t.dashboard.since} {formatDate(position.entryDate, locale)}</span>
              <Link
                href={buildStockHref(position.symbol, sourceUrl || '/portfolio')}
                id={`portfolio-link-${position.id ?? position.symbol}`}
                onClick={() => rememberReturnContext(`portfolio-link-${position.id ?? position.symbol}`)}
                tabIndex={isExpanded ? undefined : -1}
                className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                {t.dashboard.viewDetails}
                <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
