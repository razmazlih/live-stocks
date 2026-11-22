'use client';

import { PerformanceSkeleton, RealizedTaxNote } from '@/components/portfolio/performance-skeleton';

import Link from 'next/link';
import { reconciliationQuality } from '@/lib/reconciliation-quality';
import { useMemo } from 'react';
import { CircleDollarSign, ChevronDown } from 'lucide-react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { calculateRealizedTaxLiability, formatCurrency, formatPercent } from '@/lib/calculations';
import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { formatSignedCurrency, getTrendTone } from '@/lib/utils/portfolio-display';
import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';

export function RealizedPanel() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { loading, positions, realizedSales: realizedSalesWithFx, summary, usdToIls } =
    usePortfolioData();


  const historyIncomplete = !reconciliationQuality(positions).completeTransactionHistory;
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

  const isHebrew = locale === 'he';
  if (loading) return <PerformanceSkeleton view="realized" locale={locale} />;
  if (!hasSales) return <DashboardSurface><div className="flex flex-col items-center gap-3 py-14 text-center"><CircleDollarSign aria-hidden="true" className="h-7 w-7 text-blue-600" /><h2 className="text-lg font-semibold">{t.realized.emptyTitle}</h2><p className="text-sm text-slate-500">{historyIncomplete ? (locale === "he" ? "אין מכירות מתועדות. התאמת היתרה אינה מוכיחה שלא היו מכירות, ולכן הרווח הממומש הכולל אינו ידוע." : "No sales are recorded. A balance checkpoint does not establish that no sales occurred; complete realized profit is unknown.") : t.realized.emptyDescription}</p></div></DashboardSurface>;

  return <div className="space-y-6">
    {historyIncomplete && <DashboardSurface><p role="status" className="text-sm">{locale === 'he'
      ? 'הסכומים כאן הם סכומי ביניים של המכירות המתועדות בלבד. התאמת יתרה אינה מכירה ואינה ממציאה רווח. עסקאות חסרות עשויות לשנות את הרווח הכולל ואת אומדן המס.'
      : 'These are subtotals of recorded sales only. A balance reconciliation is not a sale and creates no realized profit. Missing executions can change lifetime profit and tax.'}</p></DashboardSurface>}

    <DashboardSurface>
      <h2 className="mb-5 text-xl font-semibold">{t.realized.summaryTitle}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4">
        {[
          { label: t.realized.totalProceeds, usd: totals.proceedsUsd, ils: totals.proceedsIls },
          { label: historyIncomplete ? (isHebrew ? 'רווח ממומש מתועד בלבד' : 'Recorded realized profit only') : t.realized.totalProfit, usd: totals.profitUsd, ils: totals.profitIls },
          { label: historyIncomplete ? (isHebrew ? 'אומדן מס למכירות מתועדות בלבד' : 'Recorded-sales tax subtotal') : (isHebrew ? 'אומדן מס' : 'Estimated tax'), usd: taxSummary.taxUsd, ils: taxSummary.taxIls },
          { label: t.realized.netProfitAfterTax, usd: netProfitUsd, ils: netProfitIls },
        ].map((item) => <div key={item.label}><dt className="text-sm text-slate-500">{item.label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl"><bdi>{formatSignedCurrency(item.usd, 'USD', locale)}</bdi></dd><dd className="mt-1 text-xs tabular-nums text-slate-500"><bdi>{formatSignedCurrency(item.ils, 'ILS', locale)}</bdi></dd></div>)}
      </dl>
      <RealizedTaxNote locale={locale} />
    </DashboardSurface>

    <DashboardSurface>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold">{t.realized.bySymbolTitle}</h2><p className="text-sm text-slate-500">{t.realized.bySymbolSubtitle}</p></div>
      <div className="divide-y divide-slate-100">
        {salesBySymbol.map((item) => <div key={item.symbol} className="grid grid-cols-2 items-center gap-3 py-4 sm:grid-cols-4">
          <StockLink symbol={item.symbol} display={item.display} kind="symbol" />
          <div className="text-end"><p className="text-xs text-slate-500">{t.realized.totalProfit}</p><p className={`mt-1 font-semibold tabular-nums ${getTrendTone(item.profitUsd).text}`}><bdi>{formatSignedCurrency(item.profitUsd, 'USD', locale)}</bdi></p><p className="text-xs text-slate-500"><bdi>{formatSignedCurrency(item.profitIls, 'ILS', locale)}</bdi></p></div>
          <div><p className="text-xs text-slate-500">{t.realized.totalProceeds}</p><p className="mt-1 text-sm tabular-nums"><bdi>{formatCurrency(item.proceedsUsd, 'USD', locale)}</bdi></p><p className="text-xs text-slate-500"><bdi>{formatCurrency(item.proceedsIls, 'ILS', locale)}</bdi></p></div>
          <div><p className="text-xs text-slate-500">{t.realized.totalCost} · {t.realized.quantity}: <bdi>{item.quantity.toLocaleString(locale)}</bdi></p><p className="mt-1 text-sm tabular-nums"><bdi>{formatCurrency(item.costUsd, 'USD', locale)}</bdi></p><p className="text-xs text-slate-500"><bdi>{formatCurrency(item.costIls, 'ILS', locale)}</bdi></p></div>
        </div>)}
      </div>
    </DashboardSurface>

    <DashboardSurface>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold">{t.realized.salesTitle}</h2><p className="text-sm text-slate-500">{t.realized.salesSubtitle}</p></div>
      <div className="divide-y divide-slate-100">
        {sortedSales.map((sale, index) => {
          const sellDate = new Date(sale.sellDate);
          const date = Number.isFinite(sellDate.getTime()) ? sellDate.toLocaleDateString(isHebrew ? 'he-IL' : 'en-US') : '—';
          return <details key={`${sale.id ?? sale.symbol}-${sale.sellDate}-${index}`} className="summary-details group py-2">
            <summary id={`realized-summary-sale-${index}`} className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-semibold"><bdi>{sale.symbol}</bdi> · {sale.display}</span><span className="mt-1 block text-xs text-slate-500">{date} · {t.realized.quantity}: <bdi>{sale.quantity.toLocaleString(locale)}</bdi></span>{sale.basisSource === 'reconciled_average' && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">{isHebrew ? 'רווח לפי עלות ממוצעת מותאמת · לא אימות FIFO של הברוקר' : 'Gain uses reconciled average basis · broker FIFO unverified'}</span>}</span>
              <span className="flex shrink-0 items-center gap-3"><span className={`font-semibold tabular-nums ${getTrendTone(sale.profitUsd).text}`}><bdi>{formatSignedCurrency(sale.profitUsd, 'USD', locale)}</bdi></span><ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 text-slate-400" /></span>
            </summary>
            <div className="summary-details-content grid grid-cols-2 gap-4 pb-4 pt-3 text-sm sm:grid-cols-4">
              {[
                { label: t.realized.sellPrice, value: formatCurrency(sale.sellPrice, 'USD', locale) },
                { label: t.realized.entryPrice, value: formatCurrency(sale.averageEntryPrice, 'USD', locale) },
                { label: t.realized.proceeds, value: formatCurrency(sale.proceedsUsd, 'USD', locale), secondary: formatCurrency(sale.proceedsIls, 'ILS', locale) },
                { label: t.realized.costBasis, value: formatCurrency(sale.costBasisUsd, 'USD', locale), secondary: formatCurrency(sale.costBasisIls, 'ILS', locale) },
                { label: t.realized.profit, value: formatSignedCurrency(sale.profitUsd, 'USD', locale), secondary: formatSignedCurrency(sale.profitIls, 'ILS', locale) },
                { label: t.realized.profitPercent, value: formatPercent(sale.profitPercent, locale) },
                { label: t.realized.holdingPeriod, value: `${Math.round(sale.holdingPeriodDays).toLocaleString(locale)} ${t.realized.holdingPeriodUnit}` },
              ].map((item) => <div key={item.label}><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 tabular-nums"><bdi>{item.value}</bdi></p>{item.secondary ? <p className="text-xs text-slate-500"><bdi>{item.secondary}</bdi></p> : null}</div>)}
              <StockLink symbol={sale.symbol} display={isHebrew ? 'לפרטי המניה' : 'Stock details'} kind={`sale-${index}`} />
            </div>
          </details>;
        })}
      </div>
    </DashboardSurface>
  </div>;
}

function StockLink({symbol, display, kind}: {symbol: string; display: string; kind: string}) {
  return <Link id={`realized-${kind}-${symbol}`} href={buildStockHref(symbol, '/portfolio?view=realized')} onClick={(event) => rememberReturnContext(kind.startsWith('sale-') ? `realized-summary-${kind}` : event.currentTarget.id)} className="flex min-h-11 flex-col justify-center text-sm font-semibold text-blue-700 hover:underline"><span>{display}</span><span className="text-xs font-normal text-slate-500"><bdi>{symbol}</bdi></span></Link>;
}
