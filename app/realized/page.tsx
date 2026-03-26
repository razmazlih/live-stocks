'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  BarChart3,
  CircleDollarSign,
  RefreshCw,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { Button } from '@/components/ui/button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { calculateRealizedTaxLiability, formatCurrency, formatPercent } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

function formatSaleDate(sellDate: string, locale: 'he' | 'en') {
  const date = new Date(sellDate);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const shellClassName =
  'relative overflow-hidden rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/94 shadow-sm';
const sectionClassName =
  'relative overflow-hidden rounded-[26px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm';
const insetCardClassName =
  'rounded-[22px] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-slate-50)]/85 p-4';
const chipClassName =
  'inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/90 px-3 py-1.5 shadow-none';

export default function RealizedPnLPage() {
  const { locale } = useApp();
  const isRtl = locale === 'he';
  const { t } = useTranslation(locale);
  const {
    loading,
    refreshing,
    realizedSales: realizedSalesWithFx,
    summary,
    usdToIls,
    lastUpdate,
    reload,
  } = usePortfolioData();

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
    [realizedSales],
  );

  const chronologicalSales = useMemo(
    () =>
      sortedSales
        .slice()
        .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime()),
    [sortedSales],
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
      { proceedsUsd: 0, proceedsIls: 0, costUsd: 0, costIls: 0, profitUsd: 0, profitIls: 0 },
    );
  }, [sortedSales]);

  const salesBySymbol = useMemo(() => {
    const map = new Map<
      string,
      {
        symbol: string;
        display: string;
        quantity: number;
        tradeCount: number;
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
        tradeCount: 0,
        proceedsUsd: 0,
        proceedsIls: 0,
        costUsd: 0,
        costIls: 0,
        profitUsd: 0,
        profitIls: 0,
      };

      current.quantity += sale.quantity;
      current.tradeCount += 1;
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
        })),
      ),
    [chronologicalSales],
  );

  const hasSales = sortedSales.length > 0;
  const netProfitUsd = totals.profitUsd - taxSummary.taxUsd;
  const netProfitIls = totals.profitIls - taxSummary.taxIls;
  const profitableSalesCount = sortedSales.filter((sale) => sale.profitUsd > 0).length;
  const losingSalesCount = Math.max(sortedSales.length - profitableSalesCount, 0);
  const winRate = sortedSales.length > 0 ? (profitableSalesCount / sortedSales.length) * 100 : 0;
  const averageHoldingDays =
    sortedSales.length > 0
      ? sortedSales.reduce((acc, sale) => acc + sale.holdingPeriodDays, 0) / sortedSales.length
      : 0;
  const averageProfitPerExitUsd = sortedSales.length > 0 ? totals.profitUsd / sortedSales.length : 0;
  const profitMarginPercent = totals.costUsd > 0 ? (totals.profitUsd / totals.costUsd) * 100 : 0;
  const taxDragPercent = totals.profitUsd > 0 ? (taxSummary.taxUsd / totals.profitUsd) * 100 : 0;
  const netTone = getTrendTone(netProfitUsd);
  const grossTone = getTrendTone(totals.profitUsd);
  const maxSymbolProfitMagnitude = salesBySymbol.reduce(
    (max, item) => Math.max(max, Math.abs(item.profitUsd)),
    0,
  );

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
        include: ['reload'],
        overrides: {
          reload: {
            onClick: reload,
            disabled: loading || refreshing,
            iconClassName: loading || refreshing ? 'animate-spin' : undefined,
          },
        },
      }),
    [t, reload, loading, refreshing],
  );

  const copy = useMemo(
    () =>
      locale === 'he'
        ? {
            reportTag: 'דוח מימושים',
            netAfterTax: 'תוצאה נטו אחרי מס',
            grossProfit: 'רווח ממומש ברוטו',
            taxReserve: 'הפרשת מס משוערת',
            taxContext: 'הקשר מס',
            qualityTitle: 'איכות ביצוע',
            qualityNote:
              'התמונה כאן משלבת שיעור מימושים רווחיים, משך אחזקה ממוצע, וגרירת המס ביחס לרווח הגולמי.',
            taxNote:
              'המס מחושב על ציר המימושים המצטבר ומופחת מהרווח הגולמי כדי להגיע לשורת הנטו.',
            profitableExits: 'מימושים רווחיים',
            losingExits: 'מימושים שליליים',
            averageHold: 'משך אחזקה ממוצע',
            averageProfitPerExit: 'רווח ממוצע למימוש',
            profitPool: 'חלק במאגר הרווח',
            relativeStrength: 'עוצמה יחסית',
            symbolDigest: 'חלוקה לפי סימול',
            salesDigest: 'פירוט עסקאות',
            emptyTitle: 'עדיין אין מימושים להצגה',
            emptyDescription:
              'כשתתווסף עסקת מכירה, הדוח יציג את התמורה, העלות, הרווח, והמס המשוער בצורה עקבית וקריאה.',
            emptyCta: 'לעבור לפוזיציות',
          }
        : {
            reportTag: 'Realized PnL report',
            netAfterTax: 'Net after tax',
            grossProfit: 'Gross realized profit',
            taxReserve: 'Estimated tax reserve',
            taxContext: 'Tax context',
            qualityTitle: 'Execution quality',
            qualityNote:
              'This view combines profitable exits, average holding time, and tax drag versus the gross realized pool.',
            taxNote:
              'Taxes are estimated from the full realized timeline and deducted from gross profit to reach the net line.',
            profitableExits: 'Profitable exits',
            losingExits: 'Negative exits',
            averageHold: 'Average holding period',
            averageProfitPerExit: 'Average profit per exit',
            profitPool: 'Share of profit pool',
            relativeStrength: 'Relative strength',
            symbolDigest: 'By symbol',
            salesDigest: 'Transaction digest',
            emptyTitle: 'No realized exits yet',
            emptyDescription:
              'Once a sale is recorded, this report will show proceeds, cost basis, profit, and estimated tax in a consistent ledger view.',
            emptyCta: 'Go to positions',
          },
    [locale],
  );

  const summaryTiles: Array<{
    key: string;
    label: string;
    valueUsd: string;
    valueIls: string;
    helper: string;
    icon: LucideIcon;
    accentClass: string;
    valueClass: string;
  }> = [
    {
      key: 'proceeds',
      label: t.realized.totalProceeds,
      valueUsd: formatCurrency(totals.proceedsUsd, 'USD', locale),
      valueIls: formatCurrency(totals.proceedsIls, 'ILS', locale),
      helper: locale === 'he' ? 'תמורה כוללת מכל המימושים' : 'Total cash received from exits',
      icon: CircleDollarSign,
      accentClass: 'bg-[color:var(--color-blue-50)] text-[var(--color-primary-700)]',
      valueClass: 'text-[var(--color-primary-900)]',
    },
    {
      key: 'cost',
      label: t.realized.totalCost,
      valueUsd: formatCurrency(totals.costUsd, 'USD', locale),
      valueIls: formatCurrency(totals.costIls, 'ILS', locale),
      helper: locale === 'he' ? 'עלות בסיס מצטברת של אותם מימושים' : 'Cumulative cost basis for those exits',
      icon: Receipt,
      accentClass: 'bg-[color:var(--color-slate-100)] text-[var(--color-slate-600)]',
      valueClass: 'text-[var(--color-primary-900)]',
    },
    {
      key: 'profit',
      label: t.realized.totalProfit,
      valueUsd: formatSignedCurrency(totals.profitUsd, 'USD', locale),
      valueIls: formatSignedCurrency(totals.profitIls, 'ILS', locale),
      helper:
        locale === 'he'
          ? `${formatPercent(profitMarginPercent, locale)} מול בסיס העלות`
          : `${formatPercent(profitMarginPercent, locale)} vs cost basis`,
      icon: TrendingUp,
      accentClass: `${grossTone.badge} ${grossTone.border}`,
      valueClass: grossTone.text,
    },
    {
      key: 'tax',
      label: t.realized.taxesTitle,
      valueUsd: formatCurrency(taxSummary.taxUsd, 'USD', locale),
      valueIls: formatCurrency(taxSummary.taxIls, 'ILS', locale),
      helper:
        locale === 'he'
          ? `${formatPercent(taxDragPercent, locale)} מהרווח הגולמי`
          : `${formatPercent(taxDragPercent, locale)} of gross profit`,
      icon: ShieldCheck,
      accentClass: 'bg-[color:var(--color-amber-50)] text-[var(--color-amber-600)]',
      valueClass: 'text-[var(--color-primary-900)]',
    },
  ];

  const totalNetAfterTaxTiles = [
    {
      label: copy.grossProfit,
      value: formatSignedCurrency(totals.profitUsd, 'USD', locale),
      subvalue: formatSignedCurrency(totals.profitIls, 'ILS', locale),
    },
    {
      label: copy.taxReserve,
      value: formatCurrency(taxSummary.taxUsd, 'USD', locale),
      subvalue: formatCurrency(taxSummary.taxIls, 'ILS', locale),
    },
  ];

  return (
    <DashboardPageShell direction={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className={`${shellClassName} px-5 py-6 sm:px-6 sm:py-7`}>
          <div
            className={cn(
              'relative z-10 flex flex-col gap-6 lg:items-start',
              isRtl ? 'lg:flex-row-reverse' : 'lg:flex-row',
            )}
          >
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-[color:var(--color-neutral-white)]/80 p-2.5 text-[var(--color-primary-700)] shadow-sm ring-1 ring-[color:var(--color-slate-200)]/70">
                  <CircleDollarSign className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                <span className="inline-flex items-center rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-primary-700)] shadow-none">
                  {copy.reportTag}
                </span>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-black tracking-tight text-[var(--color-primary-900)] sm:text-4xl">
                      {t.realized.title}
                    </h1>
                    <p className="max-w-3xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                      {t.realized.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--color-slate-600)] sm:text-sm">
                <span className={chipClassName}>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary-400)]" />
                  {t.app.updated} {lastUpdatedDisplay ?? '—'}
                </span>
                <span className={chipClassName}>
                  <TrendingUp className="h-4 w-4 text-[var(--color-primary-500)]" />
                  1 USD ≈ {formatCurrency(rate, 'ILS', locale)}
                </span>
                <span className={chipClassName}>
                  <BarChart3 className="h-4 w-4 text-[var(--color-slate-500)]" />
                  {sortedSales.length} {locale === 'he' ? 'מימושים' : 'exits'}
                </span>
                <span className={chipClassName}>
                  <ShieldCheck className="h-4 w-4 text-[var(--color-emerald-500)]" />
                  {salesBySymbol.length} {locale === 'he' ? 'סימולים' : 'symbols'}
                </span>
              </div>
            </div>

            <div className="w-full space-y-3 sm:max-w-[24rem] sm:shrink-0">
              <div className={`${sectionClassName} p-5`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
                  {copy.netAfterTax}
                </p>
                <div className="mt-3 space-y-1">
                  <p className={cn('text-3xl font-semibold tracking-tight sm:text-[2.1rem]', netTone.text)}>
                    {formatSignedCurrency(netProfitUsd, 'USD', locale)}
                  </p>
                  <p className="text-sm text-[var(--color-slate-600)]">
                    {formatSignedCurrency(netProfitIls, 'ILS', locale)}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {totalNetAfterTaxTiles.map((tile) => (
                    <div key={tile.label} className="rounded-[18px] border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                        {tile.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">{tile.value}</p>
                      <p className="text-xs text-[var(--color-slate-500)]">{tile.subvalue}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--color-slate-500)]">{copy.taxNote}</p>
              </div>

              <QuickActionsSection title={t.realized.actions} actions={quickActions} />
            </div>
          </div>
        </header>

        <main className="mt-8 space-y-8">
          {loading ? (
            <section className={`${shellClassName} px-5 py-20 sm:px-6`}>
              <div className="relative z-10 flex flex-col items-center justify-center gap-3 text-[var(--color-slate-500)]">
                <RefreshCw className="h-5 w-5 animate-spin text-[var(--color-primary-500)]" />
                <p>{t.common.loading}</p>
              </div>
            </section>
          ) : !hasSales ? (
            <section className={`${shellClassName} px-5 py-16 sm:px-6 sm:py-20`}>
              <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center">
                <div className="rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-blue-50)] p-4 text-[var(--color-primary-700)] shadow-none">
                  <CircleDollarSign className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight text-[var(--color-primary-900)]">
                  {copy.emptyTitle}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                  {copy.emptyDescription}
                </p>
                <Button
                  asChild
                  size="sm"
                  className="mt-6 gap-2 bg-[var(--color-primary-500)] text-white shadow-sm hover:bg-[var(--color-primary-700)]"
                >
                  <Link href="/positions">
                    <Receipt className="h-4 w-4" />
                    <span>{copy.emptyCta}</span>
                  </Link>
                </Button>
              </div>
            </section>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {summaryTiles.map((tile) => {
                  const Icon = tile.icon;

                  return (
                    <article key={tile.key} className={`${sectionClassName} p-5`}>
                      <div className={cn('absolute right-4 top-4 rounded-[16px] p-2.5', tile.accentClass)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="relative z-10 space-y-3 pr-12">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
                          {tile.label}
                        </p>
                        <div className="space-y-1">
                          <p className={cn('text-2xl font-semibold tracking-tight sm:text-[2rem]', tile.valueClass)}>
                            {tile.valueUsd}
                          </p>
                          <p className="text-sm text-[var(--color-slate-600)]">{tile.valueIls}</p>
                        </div>
                        <p className="text-xs leading-5 text-[var(--color-slate-500)]">{tile.helper}</p>
                      </div>
                    </article>
                  );
                })}
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <article className={`${shellClassName} px-5 py-6 sm:px-6 sm:py-7`}>
                  <div className="relative z-10 space-y-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
                          {copy.taxContext}
                        </p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--color-primary-900)]">
                          {copy.netAfterTax}
                        </h2>
                      </div>
                      <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm', netTone.badge)}>
                        {getTrendIcon(netProfitUsd)}
                        <span>{formatSignedCurrency(netProfitUsd, 'USD', locale)}</span>
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {copy.grossProfit}
                        </p>
                        <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {formatSignedCurrency(totals.profitUsd, 'USD', locale)}
                        </p>
                        <p className="text-sm text-[var(--color-slate-500)]">
                          {formatSignedCurrency(totals.profitIls, 'ILS', locale)}
                        </p>
                      </div>
                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {copy.taxReserve}
                        </p>
                        <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {formatCurrency(taxSummary.taxUsd, 'USD', locale)}
                        </p>
                        <p className="text-sm text-[var(--color-slate-500)]">
                          {formatCurrency(taxSummary.taxIls, 'ILS', locale)}
                        </p>
                      </div>
                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {copy.profitPool}
                        </p>
                        <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {formatPercent(profitMarginPercent, locale)}
                        </p>
                        <p className="text-sm text-[var(--color-slate-500)]">
                          {locale === 'he' ? 'רווח מול בסיס העלות' : 'Profit relative to cost basis'}
                        </p>
                      </div>
                    </div>

                    <div className={`${insetCardClassName} space-y-3`}>
                      <div className="flex items-center justify-between text-sm text-[var(--color-slate-600)]">
                        <span>{copy.taxNote}</span>
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {formatPercent(Math.max(0, Math.min(taxDragPercent, 100)), locale)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--color-slate-200)]/80">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary-400),var(--color-emerald-400))]"
                          style={{ width: `${Math.max(0, Math.min(taxDragPercent, 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </article>

                <article className={`${shellClassName} px-5 py-6 sm:px-6 sm:py-7`}>
                  <div className="relative z-10 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
                          {copy.qualityTitle}
                        </p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--color-primary-900)]">
                          {locale === 'he' ? 'איכות הביצוע' : 'Execution quality'}
                        </h2>
                      </div>
                      <BarChart3 className="mt-1 h-5 w-5 text-[var(--color-primary-500)]" />
                    </div>

                    <p className="text-sm leading-6 text-[var(--color-slate-600)]">{copy.qualityNote}</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {locale === 'he' ? 'שיעור רווחיות' : 'Win rate'}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {formatPercent(winRate, locale)}
                        </p>
                        <p className="mt-2 text-sm text-[var(--color-slate-500)]">
                          {profitableSalesCount} {copy.profitableExits.toLowerCase()} · {losingSalesCount} {copy.losingExits.toLowerCase()}
                        </p>
                      </div>

                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {copy.averageHold}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {Math.round(averageHoldingDays).toLocaleString(locale)}
                        </p>
                        <p className="mt-2 text-sm text-[var(--color-slate-500)]">
                          {locale === 'he' ? 'ימים לכל מימוש' : 'days per exit'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {copy.averageProfitPerExit}
                        </p>
                        <p className={cn('mt-3 text-xl font-semibold tracking-tight', grossTone.text)}>
                          {formatSignedCurrency(averageProfitPerExitUsd, 'USD', locale)}
                        </p>
                        <p className="text-sm text-[var(--color-slate-500)]">
                          {formatSignedCurrency(averageProfitPerExitUsd * rate, 'ILS', locale)}
                        </p>
                      </div>

                      <div className={insetCardClassName}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                          {copy.profitPool}
                        </p>
                        <p className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                          {formatPercent(totals.costUsd > 0 ? (Math.abs(totals.profitUsd) / totals.costUsd) * 100 : 0, locale)}
                        </p>
                        <p className="text-sm text-[var(--color-slate-500)]">
                          {locale === 'he' ? 'חוזק רווח מול עלות' : 'Profit strength vs cost basis'}
                        </p>
                      </div>
                    </div>

                    <div className={`${insetCardClassName} space-y-3`}>
                      <div className="flex items-center justify-between text-sm text-[var(--color-slate-600)]">
                        <span>{copy.profitableExits}</span>
                        <span className="font-semibold text-[var(--color-primary-900)]">
                          {formatPercent(winRate, locale)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--color-slate-200)]/80">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-emerald-400),var(--color-primary-400))]"
                          style={{ width: `${Math.max(0, Math.min(winRate, 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              </section>

              {salesBySymbol.length > 0 && (
                <section className={`${shellClassName} px-5 py-6 sm:px-6 sm:py-7`}>
                  <div className="relative z-10 space-y-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
                          {copy.symbolDigest}
                        </p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--color-primary-900)]">
                          {locale === 'he' ? 'חוזק לפי סימול' : 'Contribution by symbol'}
                        </h2>
                      </div>
                      <p className="max-w-xl text-sm leading-6 text-[var(--color-slate-600)]">
                        {locale === 'he'
                          ? 'כל כרטיס מציג תרומה יחסית למאגר הרווח הכולל, כדי לראות במהירות אילו מימושים הניעו את התוצאה.'
                          : 'Each card shows relative contribution to the total realized pool so the main drivers are visible at a glance.'}
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {salesBySymbol.map((item) => {
                        const tone = getTrendTone(item.profitUsd);
                        const contributionShare =
                          maxSymbolProfitMagnitude > 0 ? (Math.abs(item.profitUsd) / maxSymbolProfitMagnitude) * 100 : 0;

                        return (
                          <article
                            key={item.symbol}
                            className={cn(
                              `${sectionClassName} p-5`,
                              tone.border,
                            )}
                          >
                            <div className="relative z-10 space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-[var(--color-primary-900)]">
                                    {item.display}
                                  </p>
                                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {item.symbol}
                                  </p>
                                </div>
                                <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm', tone.badge)}>
                                  {getTrendIcon(item.profitUsd)}
                                  <span>{formatSignedCurrency(item.profitUsd, 'USD', locale)}</span>
                                </span>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-[18px] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-slate-50)]/85 px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {locale === 'he' ? 'עסקאות' : 'Trades'}
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                    {item.tradeCount.toLocaleString(locale)}
                                  </p>
                                </div>
                                <div className="rounded-[18px] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-slate-50)]/85 px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.realized.quantity}
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                    {item.quantity.toLocaleString(locale)}
                                  </p>
                                </div>
                                <div className="rounded-[18px] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-slate-50)]/85 px-3 py-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {copy.relativeStrength}
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                    {formatPercent(
                                      maxSymbolProfitMagnitude > 0
                                        ? (Math.abs(item.profitUsd) / maxSymbolProfitMagnitude) * 100
                                        : 0,
                                      locale,
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs text-[var(--color-slate-500)]">
                                  <span>{copy.profitPool}</span>
                                  <span>{formatPercent(contributionShare, locale)}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--color-slate-200)]/80">
                                  <div
                                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary-400),var(--color-emerald-400))]"
                                    style={{ width: `${Math.max(0, Math.min(contributionShare, 100))}%` }}
                                  />
                                </div>
                              </div>

                              <div className="grid gap-3 text-sm text-[var(--color-slate-600)] sm:grid-cols-2">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.realized.totalProceeds}
                                  </p>
                                  <p className="mt-2 font-semibold text-[var(--color-primary-900)]">
                                    {formatCurrency(item.proceedsUsd, 'USD', locale)}
                                  </p>
                                  <p className="text-xs text-[var(--color-slate-500)]">
                                    {formatCurrency(item.proceedsIls, 'ILS', locale)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                    {t.realized.totalCost}
                                  </p>
                                  <p className="mt-2 font-semibold text-[var(--color-primary-900)]">
                                    {formatCurrency(item.costUsd, 'USD', locale)}
                                  </p>
                                  <p className="text-xs text-[var(--color-slate-500)]">
                                    {formatCurrency(item.costIls, 'ILS', locale)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              <section className={`${shellClassName} px-5 py-6 sm:px-6 sm:py-7`}>
                <div className="relative z-10 space-y-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
                        {copy.salesDigest}
                      </p>
                      <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--color-primary-900)]">
                        {t.realized.summaryTitle}
                      </h2>
                    </div>
                    <p className="max-w-xl text-sm leading-6 text-[var(--color-slate-600)]">
                      {locale === 'he'
                        ? 'כל שורה פועלת כמו רשומת יומן: תאריך, מחיר, עלות, רווח ומשך אחזקה מוצגים יחד ללא רעש מיותר.'
                        : 'Each row behaves like a compact ledger entry: date, prices, result, and holding period are shown together without visual noise.'}
                    </p>
                  </div>

                  <div className="hidden xl:grid xl:grid-cols-[minmax(220px,1.15fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(150px,0.75fr)] xl:gap-4 xl:px-4 xl:text-[10px] xl:font-semibold xl:uppercase xl:tracking-[0.22em] xl:text-[var(--color-slate-500)]">
                    <div>{locale === 'he' ? 'עסקה' : 'Exit'}</div>
                    <div>{locale === 'he' ? 'מחיר' : 'Price ladder'}</div>
                    <div>{locale === 'he' ? 'תזרים' : 'Cash flow'}</div>
                    <div>{locale === 'he' ? 'תוצאה' : 'Result'}</div>
                    <div>{locale === 'he' ? 'משך' : 'Duration'}</div>
                  </div>

                  <div className="space-y-3">
                    {sortedSales.map((sale) => {
                      const tone = getTrendTone(sale.profitUsd);
                      const formattedDate = formatSaleDate(sale.sellDate, locale);

                      return (
                        <article
                          key={`${sale.id ?? sale.symbol}-${sale.sellDate}`}
                          className={cn(
                            'grid gap-4 rounded-[22px] border border-[color:var(--color-slate-200)]/75 bg-[color:var(--color-neutral-white)]/94 p-4 shadow-none xl:grid-cols-[minmax(220px,1.15fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(180px,0.9fr)_minmax(150px,0.75fr)]',
                            tone.border,
                          )}
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm', tone.badge)}>
                                {getTrendIcon(sale.profitUsd)}
                                <span>{formatSignedCurrency(sale.profitUsd, 'USD', locale)}</span>
                              </span>
                              <span className="text-sm font-semibold text-[var(--color-primary-900)]">
                                {sale.display}
                              </span>
                            </div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                              {sale.symbol}
                            </p>
                            <p className="text-sm text-[var(--color-slate-600)]">{formattedDate}</p>
                            <p className="text-xs text-[var(--color-slate-500)]">
                              {sale.quantity.toLocaleString(locale)} {t.realized.quantity}
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.sellPrice}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                {formatCurrency(sale.sellPrice, 'USD', locale)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.entryPrice}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                {formatCurrency(sale.averageEntryPrice, 'USD', locale)}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.proceeds}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                {formatCurrency(sale.proceedsUsd, 'USD', locale)}
                              </p>
                              <p className="text-xs text-[var(--color-slate-500)]">
                                {formatCurrency(sale.proceedsIls, 'ILS', locale)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.costBasis}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                {formatCurrency(sale.costBasisUsd, 'USD', locale)}
                              </p>
                              <p className="text-xs text-[var(--color-slate-500)]">
                                {formatCurrency(sale.costBasisIls, 'ILS', locale)}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.profit}
                              </p>
                              <p className={cn('mt-2 text-sm font-semibold', tone.text)}>
                                {formatSignedCurrency(sale.profitUsd, 'USD', locale)}
                              </p>
                              <p className={cn('text-xs', tone.text)}>
                                {formatSignedCurrency(sale.profitIls, 'ILS', locale)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.profitPercent}
                              </p>
                              <p className={cn('mt-2 text-sm font-semibold', tone.text)}>
                                {formatPercent(sale.profitPercent, locale)}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 xl:block xl:space-y-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {t.realized.holdingPeriod}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                                {Math.round(sale.holdingPeriodDays).toLocaleString(locale)} {t.realized.holdingPeriodUnit}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                                {locale === 'he' ? 'תוצאה' : 'Outcome'}
                              </p>
                              <p className="mt-2 text-sm text-[var(--color-slate-600)]">
                                {sale.profitUsd >= 0
                                  ? locale === 'he'
                                    ? 'מימוש רווחי'
                                    : 'Positive exit'
                                  : locale === 'he'
                                    ? 'מימוש שלילי'
                                    : 'Negative exit'}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </DashboardPageShell>
  );
}
