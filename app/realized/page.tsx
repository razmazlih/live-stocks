'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  CircleDollarSign,
  Receipt,
  TrendingUp,
} from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { calculateRealizedTaxLiability, formatCurrency, formatPercent } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

export default function RealizedPnLPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { loading, refreshing, realizedSales: realizedSalesWithFx, summary, usdToIls, lastUpdate, reload } =
    usePortfolioData();

  const lastUpdatedDisplay = formatLastUpdatedTime(lastUpdate, locale);

  const rate = summary?.usdToIlsRate ?? usdToIls;

  const realizedSales = useMemo(
    () =>
      realizedSalesWithFx.map((sale) => ({
        ...sale,
        proceedsIls: sale.proceedsIls ?? sale.proceedsUsd * rate,
        costBasisIls: sale.costBasisIls ?? sale.costBasisUsd * rate,
        profitIls: sale.profitIls ?? sale.profitUsd * rate,
      })),
    [realizedSalesWithFx, rate],
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
    <DashboardRouteShell activeKey="realized" locale={locale}>
      <DashboardContainer>
        <PageHeader
          title={t.realized.title}
          subtitle={t.realized.subtitle}
          icon={CircleDollarSign}
          quickActionsTitle={t.dashboard.quickActions}
          quickActions={quickActions}
          metaBadges={[
            { key: 'updated', label: `${t.app.updated} ${lastUpdatedDisplay ?? '—'}`, className: 'bg-blue-50 text-blue-700 border-blue-100' },
            { key: 'rate', icon: TrendingUp, label: `1 USD ≈ ${formatCurrency(rate, 'ILS', locale)}` },
            {
              key: 'net',
              label: `${formatSignedCurrency(netProfitUsd, 'USD', locale)} · ${formatSignedCurrency(netProfitIls, 'ILS', locale)} ${t.realized.netProfitAfterTax}`,
              className: getTrendTone(netProfitUsd).badge,
            },
          ]}
        />

        <DashboardMain>
          <DashboardSurface>
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
                    <Button asChild size="sm" className="gap-2 bg-[var(--color-primary-500)] text-white shadow-sm hover:bg-[var(--color-primary-700)]">
                      <Link href="/positions">
                        <Receipt className="h-4 w-4" />
                        <span>{t.realized.goToPositions}</span>
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-xl font-semibold text-slate-900">{t.realized.summaryTitle}</h2>
                        <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(netProfitUsd).badge}`}
                  >
                    {getTrendIcon(netProfitUsd)}
                    <span className="flex flex-col leading-tight">
                      <span>{formatSignedCurrency(netProfitUsd, 'USD', locale)}</span>
                      <span className="text-[11px] text-overlay-slate-600">
                        {formatSignedCurrency(netProfitIls, 'ILS', locale)}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-overlay-slate-600">{t.realized.netProfitAfterTax}</span>
                  </span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.totalProceeds}</p>
                            <p className="text-2xl font-semibold text-slate-900">
                              {formatCurrency(totals.proceedsUsd, 'USD', locale)}
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              {formatCurrency(totals.proceedsIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.totalCost}</p>
                            <p className="text-2xl font-semibold text-slate-900">
                              {formatCurrency(totals.costUsd, 'USD', locale)}
                            </p>
                            <p className="text-xs font-medium text-slate-500">
                              {formatCurrency(totals.costIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.totalProfit}</p>
                            <p className={`text-2xl font-semibold ${getTrendTone(totals.profitUsd).text}`}>
                              {formatSignedCurrency(totals.profitUsd, 'USD', locale)}
                            </p>
                            <p className={`text-xs font-medium ${getTrendTone(totals.profitUsd).text}`}>
                              {formatSignedCurrency(totals.profitIls, 'ILS', locale)}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="relative z-10 space-y-3">
                            <p className="text-sm font-medium text-slate-500">{t.realized.taxesTitle}</p>
                            <div className="space-y-1">
                              <span className="sr-only">{t.realized.taxesUsdLabel}</span>
                              <p className="text-2xl font-semibold text-slate-900">
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
                                className={`rounded-xl border ${tone.border} bg-white p-4 shadow-sm`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-slate-500">{item.display}</p>
                                    <p className="text-xs text-slate-400">{item.symbol}</p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {getTrendIcon(item.profitUsd)}
                                    <span className="flex flex-col leading-tight">
                                      <span>{formatSignedCurrency(item.profitUsd, 'USD', locale)}</span>
                                      <span className="text-[11px]">
                                        {formatSignedCurrency(item.profitIls, 'ILS', locale)}
                                      </span>
                                    </span>
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
                                      <span className="mt-0.5 block text-xs text-slate-500">
                                        {formatCurrency(item.proceedsIls, 'ILS', locale)}
                                      </span>
                                    </span>
                                  </p>
                                  <p>
                                    {t.realized.totalCost}:{' '}
                                    <span className="font-medium text-slate-700">
                                      {formatCurrency(item.costUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs text-slate-500">
                                        {formatCurrency(item.costIls, 'ILS', locale)}
                                      </span>
                                    </span>
                                  </p>
                                  <p>
                                    {t.realized.totalProfit}:{' '}
                                    <span className={`font-medium ${tone.text}`}>
                                      {formatSignedCurrency(item.profitUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs">
                                        {formatSignedCurrency(item.profitIls, 'ILS', locale)}
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
                              className={`rounded-xl border ${tone.border} bg-white p-4 shadow-sm`}
                            >
                              <div className="relative z-10 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-slate-500">{sale.display}</p>
                                    <p className="text-xs text-slate-400">{sale.symbol}</p>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                                    {getTrendIcon(sale.profitUsd)}
                                    <span className="flex flex-col leading-tight">
                                      <span>{formatSignedCurrency(sale.profitUsd, 'USD', locale)}</span>
                                      <span className="text-[11px]">
                                        {formatSignedCurrency(sale.profitIls, 'ILS', locale)}
                                      </span>
                                    </span>
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
                                      <span className="mt-0.5 block text-xs text-slate-500">
                                        {formatCurrency(sale.proceedsIls, 'ILS', locale)}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.costBasis}</p>
                                    <p className="text-slate-700">
                                      {formatCurrency(sale.costBasisUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs text-slate-500">
                                        {formatCurrency(sale.costBasisIls, 'ILS', locale)}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-600">{t.realized.profit}</p>
                                    <p className={`text-sm font-semibold ${tone.text}`}>
                                      {formatSignedCurrency(sale.profitUsd, 'USD', locale)}
                                      <span className="mt-0.5 block text-xs">
                                        {formatSignedCurrency(sale.profitIls, 'ILS', locale)}
                                      </span>
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
          </DashboardSurface>
        </DashboardMain>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
