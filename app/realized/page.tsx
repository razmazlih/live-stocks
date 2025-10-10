'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Home,
  CircleDollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Receipt,
  TrendingUp,
} from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { computeRealizedSales } from '@/lib/positions';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { Button } from '@/components/ui/button';

export default function RealizedPnLPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { loading, positions, summary, usdToIls, lastUpdate, reload } = usePortfolioData();

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
        costUsd: number;
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
        costUsd: 0,
        profitUsd: 0,
        profitIls: 0,
      };

      current.quantity += sale.quantity;
      current.proceedsUsd += sale.proceedsUsd;
      current.costUsd += sale.costBasisUsd;
      current.profitUsd += sale.profitUsd;
      current.profitIls += sale.profitIls;

      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.profitUsd - a.profitUsd);
  }, [sortedSales]);

  const taxSummary = useMemo(() => {
    let cumulativeProfitUsd = 0;
    let peakProfitUsd = 0;
    let taxUsd = 0;
    let taxIls = 0;

    chronologicalSales.forEach((sale) => {
      cumulativeProfitUsd += sale.profitUsd;

      if (sale.profitUsd > 0) {
        const newPeakProfitUsd = Math.max(peakProfitUsd, cumulativeProfitUsd);
        const taxableProfitUsd = Math.max(0, newPeakProfitUsd - peakProfitUsd);

        if (taxableProfitUsd > 1e-8) {
          const conversionRate = sale.profitUsd !== 0 ? sale.profitIls / sale.profitUsd : 0;
          taxUsd += taxableProfitUsd * 0.25;
          taxIls += taxableProfitUsd * conversionRate * 0.25;
        }

        peakProfitUsd = newPeakProfitUsd;
        return;
      }

      peakProfitUsd = Math.max(peakProfitUsd, cumulativeProfitUsd);
    });

    return { taxUsd, taxIls };
  }, [chronologicalSales]);

  const formatSignedCurrency = (value: number, currency: 'USD' | 'ILS') => {
    const formatted = formatCurrency(value, currency, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const getTrendTone = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-600',
        border: 'border-emerald-100',
      };
    }

    if (value < 0) {
      return {
        text: 'text-rose-600',
        badge: 'bg-rose-50 text-rose-600',
        border: 'border-rose-100',
      };
    }

    return {
      text: 'text-slate-600',
      badge: 'bg-slate-100 text-slate-500',
      border: 'border-slate-200',
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#EEF5FF]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-8 shadow-xl backdrop-blur-sm">
            <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-blue-200/60 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 shadow-inner">
                    <CircleDollarSign className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">{t.realized.title}</h1>
                    <p className="mt-2 max-w-xl text-base text-slate-600">{t.realized.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    {t.app.updated} {lastUpdatedDisplay ?? '—'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-slate-600 shadow-sm">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    1 USD ≈ {formatCurrency(rate, 'ILS', locale)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(netProfitUsd).badge}`}
                  >
                    {getTrendIcon(netProfitUsd)}
                    {formatSignedCurrency(netProfitUsd, 'USD')}
                    <span className="text-xs font-medium text-slate-600/80">{t.realized.netProfitAfterTax}</span>
                  </span>
                </div>
              </div>
              <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.realized.actions}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t.common.refresh}</span>
                  </Button>
                  <Button asChild variant="secondary" size="sm" className="gap-2">
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      <span>{t.app.title}</span>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900">
                    <Link href="/positions">
                      <Receipt className="h-4 w-4" />
                      <span>{t.realized.goToPositions}</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="mt-10 space-y-10">
            <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-4 py-8 shadow-xl backdrop-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-blue-100/50 blur-3xl" />
              <div className="relative z-10">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : !hasSales ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                    <div className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-inner">
                      <CircleDollarSign className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-slate-800">{t.realized.emptyTitle}</p>
                      <p className="text-sm text-slate-500">{t.realized.emptyDescription}</p>
                    </div>
                    <Button asChild size="sm" className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]">
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
                        <h2 className="text-xl font-semibold text-slate-900">{t.realized.summaryTitle}</h2>
                        <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(netProfitUsd).badge}`}
                  >
                    {getTrendIcon(netProfitUsd)}
                    {formatSignedCurrency(netProfitUsd, 'USD')}
                    <span className="text-xs font-medium text-slate-600/80">{t.realized.netProfitAfterTax}</span>
                  </span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.totalProceeds}</p>
                            <p className="text-3xl font-semibold text-slate-900">
                              {formatCurrency(totals.proceedsUsd, 'USD', locale)}
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              {formatCurrency(totals.proceedsIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.totalCost}</p>
                            <p className="text-3xl font-semibold text-slate-900">
                              {formatCurrency(totals.costUsd, 'USD', locale)}
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              {formatCurrency(totals.costIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.totalProfit}</p>
                            <p className={`text-3xl font-semibold ${getTrendTone(totals.profitUsd).text}`}>
                              {formatSignedCurrency(totals.profitUsd, 'USD')}
                            </p>
                            <p className={`text-xs font-medium ${getTrendTone(totals.profitUsd).text}`}>
                              {formatSignedCurrency(totals.profitIls, 'ILS')}
                            </p>
                          </div>
                        </div>
                        <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner">
                          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.taxesTitle}</p>
                            <div className="space-y-1">
                              <span className="sr-only">{t.realized.taxesUsdLabel}</span>
                              <p className="text-3xl font-semibold text-slate-900">
                                {formatCurrency(taxSummary.taxUsd, 'USD', locale)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <span className="sr-only">{t.realized.taxesIlsLabel}</span>
                              <p className="text-xs font-medium text-slate-500">
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
                          <h2 className="text-xl font-semibold text-slate-900">{t.realized.bySymbolTitle}</h2>
                          <p className="text-sm text-slate-500">{t.realized.bySymbolSubtitle}</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {salesBySymbol.map((item) => {
                            const tone = getTrendTone(item.profitUsd);
                            return (
                              <div
                                key={item.symbol}
                                className={`rounded-3xl border ${tone.border} bg-white/90 p-5 shadow-inner`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-slate-500">{item.display}</p>
                                    <p className="text-xs text-slate-400">{item.symbol}</p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {getTrendIcon(item.profitUsd)}
                                    {formatSignedCurrency(item.profitUsd, 'USD')}
                                  </span>
                                </div>
                                <div className="mt-4 space-y-2 text-sm text-slate-500">
                                  <p>
                                    {t.realized.quantity}:{' '}
                                    <span className="font-medium text-slate-700">{item.quantity.toLocaleString(locale)}</span>
                                  </p>
                                  <p>
                                    {t.realized.totalProceeds}:{' '}
                                    <span className="font-medium text-slate-700">
                                      {formatCurrency(item.proceedsUsd, 'USD', locale)}
                                    </span>
                                  </p>
                                  <p>
                                    {t.realized.totalCost}:{' '}
                                    <span className="font-medium text-slate-700">
                                      {formatCurrency(item.costUsd, 'USD', locale)}
                                    </span>
                                  </p>
                                  <p>
                                    {t.realized.totalProfit}:{' '}
                                    <span className={`font-medium ${tone.text}`}>
                                      {formatSignedCurrency(item.profitUsd, 'USD')}
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
                        <h2 className="text-xl font-semibold text-slate-900">{t.realized.salesTitle}</h2>
                        <p className="text-sm text-slate-500">{t.realized.salesSubtitle}</p>
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
                              className={`relative overflow-hidden rounded-3xl border ${tone.border} bg-white/90 p-5 shadow-inner`}
                            >
                              <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/30 blur-3xl" />
                              <div className="relative z-10 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-slate-500">{sale.display}</p>
                                    <p className="text-xs text-slate-400">{sale.symbol}</p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {getTrendIcon(sale.profitUsd)}
                                    {formatSignedCurrency(sale.profitUsd, 'USD')}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 sm:text-sm">
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.sellDate}</p>
                                    <p className="text-slate-700">{formattedDate}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.quantity}</p>
                                    <p className="text-slate-700">{sale.quantity.toLocaleString(locale)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.sellPrice}</p>
                                    <p className="text-slate-700">
                                      {formatCurrency(sale.sellPrice, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.entryPrice}</p>
                                    <p className="text-slate-700">
                                      {formatCurrency(sale.averageEntryPrice, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.proceeds}</p>
                                    <p className="text-slate-700">
                                      {formatCurrency(sale.proceedsUsd, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.costBasis}</p>
                                    <p className="text-slate-700">
                                      {formatCurrency(sale.costBasisUsd, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.profit}</p>
                                    <p className={`text-sm font-semibold ${tone.text}`}>
                                      {formatSignedCurrency(sale.profitUsd, 'USD')}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.profitPercent}</p>
                                    <p className={`text-sm font-semibold ${tone.text}`}>
                                      {formatPercent(sale.profitPercent, locale)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.holdingPeriod}</p>
                                    <p className="text-slate-700">
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
