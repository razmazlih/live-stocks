import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { Locale } from '@/types';

export function PerformanceChartHeading({ locale, currency, optionsOpen = false, optionsId, onToggle }: {
  locale: Locale; currency?: 'USD' | 'ILS'; optionsOpen?: boolean; optionsId?: string; onToggle?: () => void;
}) {
  const he = locale === 'he';
  return <header className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{he ? 'ביצועים מול היעד' : 'Performance vs. target'}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{he ? 'רווח והפסד מצטבר' : 'Cumulative profit & loss'} <span className="mx-1 text-slate-300">·</span> {currency ?? <span aria-hidden className="inline-block h-2.5 w-[3ch] rounded bg-slate-400/20" />}</p></div>
      <button aria-label={he ? 'אפשרויות חישוב' : 'Calculation options'} aria-expanded={optionsOpen} aria-controls={optionsId} onClick={onToggle} disabled={!onToggle} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${optionsOpen ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><SlidersHorizontal aria-hidden className="h-3.5 w-3.5" /><span>{he ? 'חישוב' : 'Calculation'}</span><ChevronDown aria-hidden className={`h-3 w-3 transition-transform motion-reduce:transition-none ${optionsOpen ? 'rotate-180' : ''}`} /></button>
    </header>;
}

export function PerformanceChartLegend({ locale }: { locale: Locale }) {
  const he = locale === 'he';
  return <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-[10px] text-slate-500 sm:text-[11px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="font-medium text-slate-600">{he ? 'רווח / הפסד' : 'Profit / loss'}</span><span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-600" />{he ? 'הפסד' : 'Loss'}</span><span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-600" />{he ? 'מתחת ליעד' : 'Below target'}</span><span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />{he ? 'מעל היעד' : 'Above target'}</span></div>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="w-4 border-t-2 border-dashed border-slate-400" />{he ? 'יעד אישי' : 'Personal target'}</span>
    </div>;
}
