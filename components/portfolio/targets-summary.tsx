import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent } from '@/lib/calculations';
import { translations } from '@/lib/translations';
import type { Locale } from '@/types';

export function TargetsSummary({ locale, growthRate, counts }: {
  locale: Locale; growthRate?: number; counts?: [number, number, number];
}) {
  const labels = translations[locale].exceptions;
  const he = locale === 'he';
  return <section className="space-y-4">
    <h2 className="text-xl font-semibold text-slate-900">{he ? 'ביצועים מול היעד האישי' : 'Performance against your personal target'}</h2>
    <p className="text-sm text-slate-500">{labels.annualTarget}: {growthRate === undefined
      ? <span className="inline-block h-3 w-8 rounded bg-slate-400/20" />
      : formatPercent(growthRate * 100, locale)} · {he ? 'יעד תשואה אישי, לא תחזית שוק.' : 'A personal return target, not a market forecast.'}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        [labels.openCount, 'border-blue-100 bg-blue-50 text-blue-700'],
        [labels.closedCount, 'border-emerald-100 bg-emerald-50 text-emerald-700'],
        [labels.warningCount, 'border-amber-100 bg-amber-50 text-amber-700'],
      ].map(([label, color], index) => <div key={label} className={`rounded-xl border p-4 ${color}`}>
        <p className="text-sm font-medium opacity-80">{label}</p>
        <div className="mt-2 flex h-9 items-center text-3xl font-semibold tabular-nums">{counts ? counts[index] : <Skeleton className="h-6 w-8" />}</div>
      </div>)}
    </div>
  </section>;
}

export function TargetSectionHeading({ title, description, count }: { title: string; description: string; count?: string }) {
  return <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
    <div><h2 className="text-xl font-semibold text-slate-900">{title}</h2><p className="text-sm text-slate-500">{description}</p></div>
    <span className="flex h-5 items-center text-sm font-medium text-slate-500">{count ?? <Skeleton className="h-3 w-3" />}</span>
  </div>;
}
