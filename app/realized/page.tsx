'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Receipt,
  TrendingUp,
  LineChart,
} from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { computeRealizedSales } from '@/lib/positions';
import { calculateRealizedTaxLiability, formatCurrency, formatPercent } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';

export default function RealizedPnLPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { loading, refreshing, positions, summary, usdToIls, lastUpdate, reload } = usePortfolioData();

  const lastUpdatedDisplay = useMemo(() => {
    if (!lastUpdate) {
      return null;
    }

    return lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [lastUpdate, locale]);

  const rate = summary?.usdToIlsRate ?? usdToIls;

  const realizedSales = useMemo(
    () =>
      positions.flatMap((position) =>
        computeRealizedSales(position).map((sale) => ({
          ...sale,
          proceedsIls: sale.proceedsUsd * rate,
          costBasisIls: sale.costBasisUsd * rate,
          profitIls: sale.profitUsd * rate,
        }))
      ),
    [positions, rate]
  );

  const sortedSales = useMemo(
    () =>
      realizedSales
        .slice()
        .sort((a, b) => new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime()),
    [realizedSales]
  );

  const chronologicalSales = useMemo(
    () =>
      sortedSales
        .slice()
        .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime()),
    [sortedSales]
  );

  const totals = useMemo(() => {
    return sortedSales.reduce(
      (acc, sale) => {
        acc.proceedsUsd += sale.proceedsUsd;
        acc.proceedsIls += sale.proceedsIls;
        acc.costUsd += sale.costBasisUsd;
        acc.costIls += sale.costBasisIls;
        acc.profitUsd += sale.profitUsd;
        acc.profitIls += sale.profitIls;
        return acc;
      },
      { proceedsUsd: 0, proceedsIls: 0, costUsd: 0, costIls: 0, profitUsd: 0, profitIls: 0 }
    );
  }, [sortedSales]);

  const salesBySymbol = useMemo(() => {
    const map = new Map<
      string,
      {
        symbol: string;
        display: string;
        quantity: number;
        proceedsUsd: number;
        proceedsIls: number;
        costUsd: number;
        costIls: number;
        profitUsd: number;
        profitIls: number;
      }
    >();

    sortedSales.forEach((sale) => {
      const key = sale.symbol;
      const current = map.get(key) ?? {
        symbol: sale.symbol,
        display: sale.display,
        quantity: 0,
        proceedsUsd: 0,
        proceedsIls: 0,
        costUsd: 0,
        costIls: 0,
        profitUsd: 0,
        profitIls: 0,
      };

      current.quantity += sale.quantity;
      current.proceedsUsd += sale.proceedsUsd;
      current.proceedsIls += sale.proceedsIls;
      current.costUsd += sale.costBasisUsd;
      current.costIls += sale.costBasisIls;
      current.profitUsd += sale.profitUsd;
      current.profitIls += sale.profitIls;

      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.profitUsd - a.profitUsd);
  }, [sortedSales]);

  const taxSummary = useMemo(
    () =>
      calculateRealizedTaxLiability(
        chronologicalSales.map((sale) => ({
          profitUsd: sale.profitUsd,
          profitIls: sale.profitIls,
          timestamp: new Date(sale.sellDate).getTime(),
        }))
      ),
    [chronologicalSales]
  );

  const formatSignedCurrency = (value: number, currency: 'USD' | 'ILS') => {
    const formatted = formatCurrency(value, currency, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const getTrendTone = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-success',
        badge: 'bg-success/15 text-success',
        border: 'border-[hsl(var(--success) / 0.28)]',
      };
    }

    if (value < 0) {
      return {
        text: 'text-destructive',
        badge: 'bg-overlay-rose-50 text-destructive',
        border: 'border-[hsl(var(--destructive) / 0.28)]',
      };
    }

    return {
      text: 'text-muted-foreground',
      badge: 'bg-[hsl(var(--muted))] text-muted-foreground',
      border: 'border-border',
    };
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) {
      return <ArrowUpRight className="h-4 w-4" />;
    }

    if (value < 0) {
      return <ArrowDownRight className="h-4 w-4" />;
    }

    return <Minus className="h-4 w-4" />;
  };

  const hasSales = sortedSales.length > 0;
  const netProfitUsd = totals.profitUsd - taxSummary.taxUsd;
  const netProfitIls = totals.profitIls - taxSummary.taxIls;

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
        exclude: ['realized'],
        overrides: {
          reload: {
            onClick: reload,
            disabled: loading || refreshing,
            iconClassName: loading || refreshing ? 'animate-spin' : undefined,
          },
        },
      }),
    [t, reload, loading, refreshing]
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--primary) / 0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary) / 0.08)] via-[hsl(var(--primary) / 0.05)] to-[hsl(var(--primary) / 0.03)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(var(--primary),0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-[hsl(var(--card))]/60 bg-overlay-neutral-white px-6 py-8 shadow-xl glass-blur-sm">
            <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-[hsl(var(--info) / 0.26)]/60 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-[hsl(var(--info) / 0.18)] p-3 text-info shadow-inner">
                    <CircleDollarSign className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-[hsl(var(--primary))] sm:text-4xl">{t.realized.title}</h1>
                    <p className="mt-2 max-w-xl text-base text-muted-foreground">{t.realized.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-overlay-blue-50 px-3 py-1 text-info shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--info))]" />
                    {t.app.updated} {lastUpdatedDisplay ?? '—'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--card))]/70 px-3 py-1 text-muted-foreground shadow-sm">
                    <TrendingUp className="h-4 w-4 text-info" />
                    1 USD ≈ {formatCurrency(rate, 'ILS', locale)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(netProfitUsd).badge}`}
                  >
                    {getTrendIcon(netProfitUsd)}
                    <span className="flex flex-col leading-tight">
                      <span>{formatSignedCurrency(netProfitUsd, 'USD')}</span>
                      <span className="text-[11px] text-overlay-slate-600">
                        {formatSignedCurrency(netProfitIls, 'ILS')}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-overlay-slate-600">{t.realized.netProfitAfterTax}</span>
                  </span>
                </div>
              </div>
              <QuickActionsSection title={t.realized.actions} actions={quickActions} />
            </div>
          </header>

          <main className="mt-10 space-y-10">
            <section className="relative overflow-hidden rounded-3xl border border-[hsl(var(--card))]/60 bg-overlay-neutral-white px-4 py-8 shadow-xl glass-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-[hsl(var(--info) / 0.18)]/50 blur-3xl" />
              <div className="relative z-10">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin text-info" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : !hasSales ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                    <div className="rounded-full bg-[hsl(var(--info) / 0.18)] p-3 text-info shadow-inner">
                      <CircleDollarSign className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">{t.realized.emptyTitle}</p>
                      <p className="text-sm text-muted-foreground">{t.realized.emptyDescription}</p>
                    </div>
                    <Button asChild size="sm" className="gap-2 bg-[hsl(var(--primary))] text-[hsl(var(--card-foreground))] shadow-sm hover:bg-[var(--color-primary-700)]">
                      <Link href="/positions">
                        <Receipt className="h-4 w-4" />
                        <span>{t.realized.goToPositions}</span>
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-10">
                    <div className="space-y-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-xl font-semibold text-foreground">{t.realized.summaryTitle}</h2>
                        <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(netProfitUsd).badge}`}
                  >
                    {getTrendIcon(netProfitUsd)}
                    <span className="flex flex-col leading-tight">
                      <span>{formatSignedCurrency(netProfitUsd, 'USD')}</span>
                      <span className="text-[11px] text-overlay-slate-600">
                        {formatSignedCurrency(netProfitIls, 'ILS')}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-overlay-slate-600">{t.realized.netProfitAfterTax}</span>
                  </span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--card))]/70 bg-[hsl(var(--card))]/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[hsl(var(--info) / 0.18)]/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">{t.realized.totalProceeds}</p>
                            <p className="text-3xl font-semibold text-foreground">
                              {formatCurrency(totals.proceedsUsd, 'USD', locale)}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">
                              {formatCurrency(totals.proceedsIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--card))]/70 bg-[hsl(var(--card))]/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[hsl(var(--info) / 0.18)]/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">{t.realized.totalCost}</p>
                            <p className="text-3xl font-semibold text-foreground">
                              {formatCurrency(totals.costUsd, 'USD', locale)}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">
                              {formatCurrency(totals.costIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--card))]/70 bg-[hsl(var(--card))]/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[hsl(var(--info) / 0.18)]/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">{t.realized.totalProfit}</p>
                            <p className={`text-3xl font-semibold ${getTrendTone(totals.profitUsd).text}`}>
                              {formatSignedCurrency(totals.profitUsd, 'USD')}
                            </p>
                            <p className={`text-xs font-medium ${getTrendTone(totals.profitUsd).text}`}>
                              {formatSignedCurrency(totals.profitIls, 'ILS')}
                            </p>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-3xl border border-[hsl(var(--card))]/70 bg-[hsl(var(--card))]/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[hsl(var(--info) / 0.18)]/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">{t.realized.taxesTitle}</p>
                            <div className="space-y-1">
                              <span className="sr-only">{t.realized.taxesUsdLabel}</span>
                              <p className="text-3xl font-semibold text-foreground">
                                {formatCurrency(taxSummary.taxUsd, 'USD', locale)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="sr-only">{t.realized.taxesIlsLabel}</span>
                              <p className="text-xs font-medium text-muted-foreground">
                                {formatCurrency(taxSummary.taxIls, 'ILS', locale)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {salesBySymbol.length > 0 && (
                      <div className="space-y-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h2 className="text-xl font-semibold text-foreground">{t.realized.bySymbolTitle}</h2>
                          <p className="text-sm text-muted-foreground">{t.realized.bySymbolSubtitle}</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {salesBySymbol.map((item) => {
                            const tone = getTrendTone(item.profitUsd);
                            return (
                              <div
                                key={item.symbol}
                                className={`rounded-3xl border ${tone.border} bg-[hsl(var(--card))]/90 p-5 shadow-inner`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">{item.display}</p>
                                    <p className="text-xs text-muted-foreground">{item.symbol}</p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {getTrendIcon(item.profitUsd)}
                                    <span className="flex flex-col leading-tight">
                                      <span>{formatSignedCurrency(item.profitUsd, 'USD')}</span>
                                      <span className="text-[11px]">
                                        {formatSignedCurrency(item.profitIls, 'ILS')}
                                      </span>
                                    </span>
                                  </span>
                                </div>
                                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                                  <p>
                                    {t.realized.quantity}:{' '}
                                    <span className="font-medium text-foreground">{item.quantity.toLocaleString(locale)}</span>
                                  </p>
                                  <p>
                                    {t.realized.totalProceeds}:{' '}
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(item.proceedsUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {formatCurrency(item.proceedsIls, 'ILS', locale)}
                                      </span>
                                    </span>
                                  </p>
                                  <p>
                                    {t.realized.totalCost}:{' '}
                                    <span className="font-medium text-foreground">
                                      {formatCurrency(item.costUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {formatCurrency(item.costIls, 'ILS', locale)}
                                      </span>
                                    </span>
                                  </p>
                                  <p>
                                    {t.realized.totalProfit}:{' '}
                                    <span className={`font-medium ${tone.text}`}>
                                      {formatSignedCurrency(item.profitUsd, 'USD')}
                                      <span className="mt-0.5 block text-xs">
                                        {formatSignedCurrency(item.profitIls, 'ILS')}
                                      </span>
                                    </span>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-xl font-semibold text-foreground">{t.realized.salesTitle}</h2>
                        <p className="text-sm text-muted-foreground">{t.realized.salesSubtitle}</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {sortedSales.map((sale) => {
                          const tone = getTrendTone(sale.profitUsd);
                          const sellDate = new Date(sale.sellDate);
                          const formattedDate = Number.isNaN(sellDate.getTime())
                            ? '—'
                            : sellDate.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              });

                          return (
                            <div
                              key={`${sale.id ?? sale.symbol}-${sale.sellDate}`}
                              className={`relative overflow-hidden rounded-3xl border ${tone.border} bg-[hsl(var(--card))]/90 p-5 shadow-inner`}
                            >
                              <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[hsl(var(--info) / 0.18)]/30 blur-3xl" />
                              <div className="relative z-10 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">{sale.display}</p>
                                    <p className="text-xs text-muted-foreground">{sale.symbol}</p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {getTrendIcon(sale.profitUsd)}
                                    <span className="flex flex-col leading-tight">
                                      <span>{formatSignedCurrency(sale.profitUsd, 'USD')}</span>
                                      <span className="text-[11px]">
                                        {formatSignedCurrency(sale.profitIls, 'ILS')}
                                      </span>
                                    </span>
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:text-sm">
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.sellDate}</p>
                                    <p className="text-foreground">{formattedDate}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.quantity}</p>
                                    <p className="text-foreground">{sale.quantity.toLocaleString(locale)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.sellPrice}</p>
                                    <p className="text-foreground">
                                      {formatCurrency(sale.sellPrice, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.entryPrice}</p>
                                    <p className="text-foreground">
                                      {formatCurrency(sale.averageEntryPrice, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.proceeds}</p>
                                    <p className="text-foreground">
                                      {formatCurrency(sale.proceedsUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {formatCurrency(sale.proceedsIls, 'ILS', locale)}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.costBasis}</p>
                                    <p className="text-foreground">
                                      {formatCurrency(sale.costBasisUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {formatCurrency(sale.costBasisIls, 'ILS', locale)}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.profit}</p>
                                    <p className={`text-sm font-semibold ${tone.text}`}>
                                      {formatSignedCurrency(sale.profitUsd, 'USD')}
                                      <span className="mt-0.5 block text-xs">
                                        {formatSignedCurrency(sale.profitIls, 'ILS')}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.profitPercent}</p>
                                    <p className={`text-sm font-semibold ${tone.text}`}>
                                      {formatPercent(sale.profitPercent, locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">{t.realized.holdingPeriod}</p>
                                    <p className="text-foreground">
                                      {Math.round(sale.holdingPeriodDays).toLocaleString(locale)} {t.realized.holdingPeriodUnit}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
