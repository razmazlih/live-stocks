import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Skeleton } from '@/components/ui/skeleton';
import type { getPerformanceTotals } from '@/lib/performance-display';
import { getTrendTone } from '@/lib/utils/portfolio-display';
import { translations } from '@/lib/translations';
import type { Locale } from '@/types';

export function PerformanceSummary({ locale, currency = 'USD', totals }: {
  locale: Locale; currency?: 'USD' | 'ILS'; totals?: ReturnType<typeof getPerformanceTotals>;
}) {
  const he = locale === 'he';
  return <DashboardSurface>
    <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
      {[
        { label: he ? 'רווח והפסד בתצוגה' : 'Displayed profit / loss', value: totals?.actual },
        { label: he ? 'יעד אישי להיום' : 'Personal target to date', value: totals?.target },
        { label: he ? 'פער מהיעד' : 'Gap to target', value: totals?.gap },
      ].map(({ label, value }) => <div key={label}>
        <dt className="text-sm text-slate-500">{label}</dt>
        <dd className={`mt-2 flex min-h-[1lh] items-center text-xl font-semibold tabular-nums sm:text-2xl ${getTrendTone(value ?? 0).text}`}>
          {totals ? <AnimatedNumber value={value} locale={locale} currency={currency} signed /> : <Skeleton className="h-5 w-20 max-w-full" />}
        </dd>
      </div>)}
    </dl>
    <p className="mt-4 text-xs text-slate-500">{he ? 'הרווח כולל ממומש ולא ממומש, לפי בחירת הניכויים בגרף. היעד אישי ואינו תחזית שוק.' : 'P/L includes realized and unrealized results, using the deduction controls below. The personal target is not a market forecast.'}</p>
  </DashboardSurface>;
}


export function RealizedSummary({ locale, incomplete = false, amounts }: {
  locale: Locale; incomplete?: boolean;
  amounts?: { proceedsUsd: number; proceedsIls: number; profitUsd: number; profitIls: number; taxUsd: number; taxIls: number; netUsd: number; netIls: number };
}) {
  const he = locale === 'he';
  const t = translations[locale].realized;
  return <DashboardSurface>
    <h2 className="mb-5 text-xl font-semibold">{t.summaryTitle}</h2>
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4">
      {[
        { label: t.totalProceeds, usd: amounts?.proceedsUsd, ils: amounts?.proceedsIls },
        { label: incomplete ? (he ? 'רווח ממומש מתועד בלבד' : 'Recorded realized profit only') : t.totalProfit, usd: amounts?.profitUsd, ils: amounts?.profitIls },
        { label: incomplete ? (he ? 'אומדן מס למכירות מתועדות בלבד' : 'Recorded-sales tax subtotal') : (he ? 'אומדן מס' : 'Estimated tax'), usd: amounts?.taxUsd, ils: amounts?.taxIls },
        { label: t.netProfitAfterTax, usd: amounts?.netUsd, ils: amounts?.netIls },
      ].map(item => <div key={item.label}>
        <dt className="text-sm text-slate-500">{item.label}</dt>
        <dd className="mt-2 flex min-h-[1lh] items-center text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">
          {amounts ? <AnimatedNumber value={item.usd} locale={locale} currency="USD" signed /> : <Skeleton className="h-5 w-20 max-w-full" />}
        </dd>
        <dd className="mt-1 flex min-h-[1lh] items-center text-xs tabular-nums text-slate-500">
          {amounts ? <AnimatedNumber value={item.ils} locale={locale} currency="ILS" signed /> : <Skeleton className="h-3 w-16 max-w-full" />}
        </dd>
      </div>)}
    </dl>
    <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">{he ? 'המס המוצג הוא אומדן לפי מודל החישוב של האפליקציה, ולא אישור מס ששולם.' : 'Tax is an estimate calculated by the app, not confirmation of tax paid.'}</p>
  </DashboardSurface>;
}
