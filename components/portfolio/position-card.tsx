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
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
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

  const getTrendStyles = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-[var(--color-green-300)]',
        badge: 'bg-[var(--color-green-050)] text-[var(--color-green-300)]',
        surface: 'border border-emerald-100 bg-emerald-50/80',
      };
    }

    if (value < 0) {
      return {
        text: 'text-[var(--color-red-500)]',
        badge: 'bg-[var(--color-red-050)] text-[var(--color-red-500)]',
        surface: 'border border-rose-100 bg-rose-50/80',
      };
    }

    return {
      text: 'text-[var(--color-slate-600)]',
      badge: 'bg-[var(--color-slate-100)] text-[var(--color-slate-500)]',
      surface: 'border border-slate-200 bg-slate-50/70',
    };
  };

  const dailyChangeValue = typeof metrics.dailyChange === 'number' ? metrics.dailyChange : null;
  const dailyChangePercent = metrics.dailyChangePercent;
  const percentText = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value, locale)}`;
  const dailyChangeAmount = dailyChangeValue !== null ? dailyChangeValue * position.quantity : null;
  const dailyChangeStyles = dailyChangeAmount !== null ? getTrendStyles(dailyChangeAmount) : null;
  const dailyChangePercentText =
    typeof dailyChangePercent === 'number' && Number.isFinite(dailyChangePercent)
      ? percentText(dailyChangePercent)
      : null;
  const dailyChangeBannerClassName =
    dailyChangeAmount === null
      ? 'border-slate-200/80 bg-slate-50'
      : dailyChangeAmount > 0
        ? 'border-emerald-200/75 bg-emerald-50/70'
        : dailyChangeAmount < 0
          ? 'border-rose-200/75 bg-rose-50/70'
          : 'border-slate-200/80 bg-slate-50';
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

  const closedStats = closedSummary
    ? [
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

  const closedProfitUsd = closedSummary?.totalProfitUsd ?? 0;
  const isClosedLoss = isClosed && closedSummary !== null && closedProfitUsd < 0;
  const closedTheme = isClosedLoss
    ? {
        cardShell: 'border-rose-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,241,242,0.94))]',
        hoverShadow: '-translate-y-0.5 shadow-[0_26px_52px_-34px_rgba(225,29,72,0.3)]',
        idleShadow: 'shadow-[0_16px_34px_-30px_rgba(225,29,72,0.22)]',
        accentStripe:
          'bg-[linear-gradient(90deg,rgba(244,63,94,0),rgba(244,63,94,0.88),rgba(251,113,133,0.76),rgba(244,63,94,0))]',
        ambientGlow: 'bg-rose-100/35',
        headerShell:
          'border-rose-100/80 bg-[linear-gradient(145deg,rgba(255,241,242,0.96),rgba(255,255,255,0.98)_58%,rgba(255,228,230,0.82))]',
        chartShell:
          'border-rose-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,241,242,0.82))]',
        actionShell: 'border-rose-100/80 bg-rose-50/45',
        detailLink:
          'border-rose-200/85 bg-white text-rose-700 shadow-[0_10px_20px_-16px_rgba(225,29,72,0.5)] hover:bg-rose-50 hover:text-rose-800',
        avatarGlow:
          'bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.18),transparent_72%)]',
        avatarShell:
          'border-rose-100 bg-white shadow-[0_18px_28px_-22px_rgba(225,29,72,0.4)]',
        closedBadge: 'border border-rose-200/85 bg-white text-rose-700 shadow-sm',
        closedSelector: 'border-rose-100/75 bg-white/88',
        primaryTile:
          'border-rose-200/85 bg-white shadow-[0_14px_28px_-24px_rgba(225,29,72,0.42)]',
        primaryTileLabel: 'text-rose-700',
        chartChip: 'border-rose-100/85 bg-white',
        chartFrame: 'border-rose-100/75 bg-white',
      }
    : {
        cardShell: 'border-emerald-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(240,253,244,0.94))]',
        hoverShadow: '-translate-y-0.5 shadow-[0_26px_52px_-34px_rgba(5,150,105,0.32)]',
        idleShadow: 'shadow-[0_16px_34px_-30px_rgba(5,150,105,0.24)]',
        accentStripe:
          'bg-[linear-gradient(90deg,rgba(16,185,129,0),rgba(16,185,129,0.88),rgba(52,211,153,0.76),rgba(16,185,129,0))]',
        ambientGlow: 'bg-emerald-100/35',
        headerShell:
          'border-emerald-100/80 bg-[linear-gradient(145deg,rgba(240,253,244,0.96),rgba(255,255,255,0.98)_58%,rgba(236,253,245,0.82))]',
        chartShell:
          'border-emerald-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,244,0.82))]',
        actionShell: 'border-emerald-100/80 bg-emerald-50/45',
        detailLink:
          'border-emerald-200/85 bg-white text-emerald-700 shadow-[0_10px_20px_-16px_rgba(5,150,105,0.55)] hover:bg-emerald-50 hover:text-emerald-800',
        avatarGlow:
          'bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_72%)]',
        avatarShell:
          'border-emerald-100 bg-white shadow-[0_18px_28px_-22px_rgba(5,150,105,0.45)]',
        closedBadge: 'border border-emerald-200/85 bg-white text-emerald-700 shadow-sm',
        closedSelector: 'border-emerald-100/75 bg-white/88',
        primaryTile:
          'border-emerald-200/85 bg-white shadow-[0_14px_28px_-24px_rgba(5,150,105,0.5)]',
        primaryTileLabel: 'text-emerald-700',
        chartChip: 'border-emerald-100/85 bg-white',
        chartFrame: 'border-emerald-100/75 bg-white',
      };

  const cardShellClassName = cn(
    'group relative flex h-full flex-col overflow-hidden rounded-[30px] border bg-[color:var(--color-neutral-white)] transition-[transform,box-shadow,border-color] duration-300 ease-out',
    isClosed
      ? closedTheme.cardShell
      : 'border-blue-100/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.94))]',
    isHovered
      ? isClosed
        ? closedTheme.hoverShadow
        : '-translate-y-0.5 shadow-[0_26px_52px_-34px_rgba(37,99,235,0.28)]'
      : isClosed
        ? closedTheme.idleShadow
        : 'shadow-[0_16px_34px_-30px_rgba(37,99,235,0.2)]'
  );
  const accentStripeClassName = isClosed
    ? closedTheme.accentStripe
    : 'bg-[linear-gradient(90deg,rgba(37,99,235,0),rgba(37,99,235,0.88),rgba(56,189,248,0.74),rgba(37,99,235,0))]';
  const ambientGlowClassName = isClosed ? closedTheme.ambientGlow : 'bg-blue-100/35';
  const headerShellClassName = cn(
    'rounded-[26px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] sm:p-4',
    isClosed
      ? closedTheme.headerShell
      : 'border-blue-100/80 bg-[linear-gradient(145deg,rgba(239,246,255,0.96),rgba(255,255,255,0.98)_54%,rgba(224,242,254,0.84))]'
  );
  const chartShellClassName = cn(
    'rounded-[24px] border p-3 shadow-sm sm:p-4',
    isClosed
      ? closedTheme.chartShell
      : 'border-blue-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.82))]'
  );
  const actionShellClassName = cn(
    'rounded-[22px] border p-2.5 shadow-sm',
    isClosed ? closedTheme.actionShell : 'border-blue-100/80 bg-blue-50/45'
  );
  const detailLinkClassName = cn(
    'group inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-[transform,background-color,color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 sm:w-auto',
    isClosed
      ? closedTheme.detailLink
      : 'border-blue-200/85 bg-white text-blue-700 shadow-[0_10px_20px_-16px_rgba(37,99,235,0.45)] hover:bg-blue-50 hover:text-blue-800'
  );
  const chartSummaryItems = isClosed
    ? closedSummary
      ? [
          {
            key: 'entry',
            label: t.dashboard.closedAverageEntry,
            value: formatCurrency(closedSummary.averageEntryPrice, 'USD', locale),
          },
          {
            key: 'exit',
            label: t.dashboard.closedAverageExit,
            value: formatCurrency(closedSummary.averageExitPrice, 'USD', locale),
          },
        ]
      : []
    : [
        {
          key: 'entry',
          label: t.dashboard.entryPrice,
          value: formatCurrency(position.entryPrice, 'USD', locale),
        },
        ...(Number.isFinite(projectedPrice)
          ? [{
              key: 'projected',
              label: t.dashboard.weightedProjectedPrice,
              value: formatCurrency(projectedPrice, 'USD', locale),
            }]
          : []),
      ];
  const actionMetaLabel = isClosed && closedSummary?.lastSaleDate
    ? `${t.dashboard.closedLastSale}: ${formatDate(closedSummary.lastSaleDate.toISOString(), locale)}`
    : `${t.dashboard.since} ${formatDate(position.entryDate, locale)}`;

  return (
    <div
      className={cardShellClassName}
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
        className={cn('pointer-events-none absolute inset-x-8 top-0 h-1.5 rounded-b-full', accentStripeClassName)}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-8 top-0 h-24 rounded-full transition-opacity duration-300',
          ambientGlowClassName,
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div className="relative z-10 flex flex-1 flex-col gap-3.5 p-3.5 sm:gap-4 sm:p-4">
        {isClosed ? (
          <>
            <div className={headerShellClassName}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="space-y-3">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <div className="relative shrink-0">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-[-0.35rem] rounded-[1.35rem]',
                          closedTheme.avatarGlow
                        )}
                      />
                      <Avatar className={cn(
                        'relative h-12 w-12 rounded-2xl sm:h-14 sm:w-14',
                        closedTheme.avatarShell
                      )}>
                        <StockAvatarImage
                          symbol={position.symbol}
                          display={position.display}
                          imageUrl={position.imageUrl}
                        />
                        <AvatarFallback className="bg-blue-100 font-semibold text-blue-600">
                          {position.symbol.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn('shrink-0', closedTheme.closedBadge)}
                        >
                          {t.dashboard.closedBadge}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="shrink-0 border border-blue-100 bg-blue-50 text-blue-700"
                        >
                          {position.symbol}
                        </Badge>
                        <BankBadge
                          bank={position.location === 'bank_two' ? 'bank_two' : 'bank_one'}
                          locale={locale}
                          size="sm"
                        />
                      </div>
                      <h3 className="min-w-0 text-[clamp(1.02rem,2vw,1.3rem)] font-black leading-tight tracking-tight text-slate-900">
                        {position.display}
                      </h3>
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
                  {closedSelector ? (
                    <div className={cn('rounded-[22px] border p-2.5 shadow-sm', closedTheme.closedSelector)}>
                      {closedSelector}
                    </div>
                  ) : null}
                </div>

                {closedSummary && (
                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[15rem] xl:grid-cols-1">
                    <div className={cn('rounded-[22px] border bg-white p-3', closedTheme.primaryTile)}>
                      <p className={cn('text-[10px] font-bold uppercase tracking-[0.16em]', closedTheme.primaryTileLabel)}>
                        {t.dashboard.closedTotalProfit}
                      </p>
                      <p
                        className={cn(
                          'mt-1.5 text-[clamp(1rem,2vw,1.2rem)] font-black leading-tight',
                          getTrendStyles(closedSummary.totalProfitUsd).text
                        )}
                      >
                        <span className={valueDirectionClass}>
                          {formatCurrency(closedSummary.totalProfitUsd, 'USD', locale)}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-sky-200/85 bg-white p-3 shadow-[0_14px_28px_-24px_rgba(14,165,233,0.45)]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">
                        {t.dashboard.closedTotalReturn}
                      </p>
                      <p
                        className={cn(
                          'mt-1.5 text-[clamp(1rem,2vw,1.2rem)] font-black leading-tight',
                          getTrendStyles(closedSummary.totalReturnPercent).text
                        )}
                      >
                        <span className={valueDirectionClass}>
                          {percentText(closedSummary.totalReturnPercent)}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {closedStats.length > 0 && (
              <div className="grid gap-2.5 text-xs text-slate-600 sm:grid-cols-2 sm:gap-3 sm:text-sm xl:grid-cols-3">
                {closedStats.map((stat) => (
                  <div
                    key={stat.key}
                    className={cn(
                      'rounded-[22px] border p-2.5 shadow-sm sm:p-3',
                      stat.tone?.surface ?? 'border-slate-100 bg-overlay-slate-50'
                    )}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-xs">{stat.label}</p>
                    <p className={`mt-1.5 text-sm font-semibold tracking-tight ${stat.tone?.text ?? 'text-slate-900'} sm:text-base`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {effectiveSparklineData.length > 1 && (
              <div className={chartShellClassName}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    {t.dashboard.closedPositionsTitle}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {chartSummaryItems.map((item) => (
                      <span
                        key={item.key}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm',
                          closedTheme.chartChip
                        )}
                      >
                        <span className="text-slate-400">{item.label}</span>
                        <span className="text-slate-900">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className={cn(
                  'viz-chart-surface relative rounded-[20px] border bg-white p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-2',
                  closedTheme.chartFrame
                )}>
                  <Sparkline
                    points={effectiveSparklineData}
                    height={126}
                    color={sparklineColor.hex}
                    baseline={position.entryPrice}
                    baselineColor="rgba(var(--color-slate-400-rgb), 0.5)"
                    projectedPrice={sparklineProjectedPrice}
                    annualGrowthRate={sparklineAnnualGrowthRate}
                    yearsHeld={sparklineYearsHeld}
                    events={effectiveSparklineEvents}
                    className="h-28 w-full sm:h-32"
                  />
                </div>
              </div>
            )}

            <div className={actionShellClassName}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-slate-500">{actionMetaLabel}</p>
                <Link
                  href={`/stock/${position.symbol}`}
                  className={detailLinkClassName}
                >
                  {t.dashboard.viewDetails}
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={headerShellClassName}>
              {dailyChangeAmount !== null && dailyChangeStyles && (
                <div
                  className={cn(
                    'rounded-[22px] border px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
                    dailyChangeBannerClassName
                  )}
                >
                  <div className="flex flex-col items-start gap-2.5 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]',
                        dailyChangeStyles.text
                      )}
                    >
                      {dailyChangeIcon}
                      <span>{t.dashboard.dailyChange}</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          'text-[clamp(1rem,1.2vw,1.15rem)] font-black leading-none tracking-tight',
                          dailyChangeStyles.text
                        )}
                      >
                        <span className={valueDirectionClass}>{formatCurrency(dailyChangeAmount, 'USD', locale)}</span>
                      </span>
                      {dailyChangePercentText && (
                        <span
                          className={cn(
                            'inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
                            dailyChangeStyles.badge
                          )}
                        >
                          <span className={valueDirectionClass}>{dailyChangePercentText}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="relative shrink-0">
                    <span
                      aria-hidden="true"
                      className="absolute inset-[-0.35rem] rounded-[1.35rem] bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.16),transparent_72%)]"
                    />
                    <Avatar className="relative h-12 w-12 rounded-2xl border border-blue-100 bg-white shadow-[0_18px_28px_-22px_rgba(37,99,235,0.42)] sm:h-14 sm:w-14">
                      <StockAvatarImage
                        symbol={position.symbol}
                        display={position.display}
                        imageUrl={position.imageUrl}
                      />
                      <AvatarFallback className="bg-blue-100 font-semibold text-blue-600">
                        {position.symbol.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    {changeFromEntryPercent !== null && (
                      <Badge
                        variant="secondary"
                        className={`absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/80 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${changeFromEntryStyles?.badge ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {percentText(changeFromEntryPercent)}
                      </Badge>
                    )}
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="shrink-0 border border-blue-100 bg-blue-50 text-blue-700">
                        {position.symbol}
                      </Badge>
                      <BankBadge
                        bank={position.location === 'bank_two' ? 'bank_two' : 'bank_one'}
                        locale={locale}
                        size="sm"
                      />
                    </div>
                    <h3 className="min-w-0 text-[clamp(1.02rem,2vw,1.3rem)] font-black leading-tight tracking-tight text-slate-900">
                      {position.display}
                    </h3>
                    <p className="text-xs text-slate-500 sm:text-sm">
                      {t.dashboard.since} {formatDate(position.entryDate, locale)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 sm:gap-2.5 sm:text-sm">
              {openSnapshotCards.map((stat) => (
                <div
                  key={stat.key}
                  className={cn(
                    'rounded-[22px] border p-2.5 shadow-sm sm:p-3',
                    stat.isPrimary
                      ? 'border-blue-200/85 bg-[linear-gradient(145deg,rgba(239,246,255,0.96),rgba(255,255,255,0.98))] shadow-[0_14px_26px_-22px_rgba(37,99,235,0.3)]'
                      : 'border-slate-100 bg-white/96'
                  )}
                >
                  <p
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-[0.16em] sm:text-xs',
                      stat.isPrimary ? 'text-blue-700' : 'text-slate-400'
                    )}
                  >
                    {stat.label}
                  </p>
                  <p
                    className={cn(
                      'mt-1.5 font-semibold leading-tight tracking-tight text-slate-900',
                      stat.isPrimary ? 'text-[clamp(1rem,2.4vw,1.2rem)]' : 'text-[clamp(0.9rem,2.1vw,1rem)]'
                    )}
                  >
                    <span className={valueDirectionClass}>{stat.value}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-[24px] border border-blue-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.82))] p-3 shadow-sm sm:p-4">
              <div className="relative space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                    {t.dashboard.current} / {t.dashboard.projected}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    {chartSummaryItems.map((item) => (
                      <span
                        key={item.key}
                        className="inline-flex items-center gap-1 rounded-full border border-blue-100/80 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm"
                      >
                        <span className="text-slate-400">{item.label}</span>
                        <span className="text-slate-900">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <section className="rounded-[22px] border border-blue-200/85 bg-white p-3 shadow-[0_14px_28px_-24px_rgba(37,99,235,0.38)]">
                    <p className="text-xs font-semibold text-blue-700">{t.dashboard.current}</p>
                    <dl className="mt-1.5 space-y-1.5">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.price}</dt>
                        <dd className="mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight text-slate-900">
                          <span className={valueDirectionClass}>{formatCurrency(currentPrice, 'USD', locale)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.pnl} USD</dt>
                        <dd className={cn('mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight', currentPnLStyles.text)}>
                          <span className={valueDirectionClass}>{formatCurrency(positionPnLUsd, 'USD', locale)}</span>
                        </dd>
                      </div>
                      {settings.currency === 'ILS' && (
                        <div>
                          <dt className="text-xs font-medium text-slate-500">{t.dashboard.pnl} ILS</dt>
                          <dd className={cn('mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight', currentPnLStyles.text)}>
                            <span className={valueDirectionClass}>{formatCurrency(positionPnLIls, 'ILS', locale)}</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section className="rounded-[22px] border border-indigo-200/85 bg-white p-3 shadow-[0_14px_28px_-24px_rgba(99,102,241,0.34)]">
                    <p className="text-xs font-semibold text-indigo-700">{t.dashboard.projected}</p>
                    <dl className="mt-1.5 space-y-1.5">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.weightedProjectedPrice}</dt>
                        <dd className="mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight text-slate-900">
                          <span className={valueDirectionClass}>{formatCurrency(projectedPrice, 'USD', locale)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">{t.dashboard.combined} USD</dt>
                        <dd className={cn('mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight', combinedStyles.text)}>
                          <span className={valueDirectionClass}>{formatCurrency(combined, 'USD', locale)}</span>
                        </dd>
                      </div>
                      {settings.currency === 'ILS' && (
                        <div>
                          <dt className="text-xs font-medium text-slate-500">{t.dashboard.combined} ILS</dt>
                          <dd className={cn('mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight', combinedStyles.text)}>
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
              <div className={chartShellClassName}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    {t.dashboard.positionsTitle}
                  </p>
                  <Badge className="viz-chip viz-chip-blue rounded-full border border-blue-100/80 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700 shadow-sm">
                    {t.dashboard.changeFromEntryPercent}
                  </Badge>
                </div>
                <div className="viz-chart-surface rounded-[20px] border border-blue-100/75 bg-white p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] sm:p-2">
                  <Sparkline
                    points={effectiveSparklineData}
                    height={106}
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
              </div>
            )}

            <div className={actionShellClassName}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-slate-500">{actionMetaLabel}</p>
                <Link
                  href={`/stock/${position.symbol}`}
                  className={detailLinkClassName}
                >
                  {t.dashboard.viewDetails}
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
