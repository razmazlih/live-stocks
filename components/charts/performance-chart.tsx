'use client';

import { useId, useMemo, useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '@/lib/context';
import { formatCurrency } from '@/lib/calculations';
import { getPerformanceColorStops, getPerformanceSeries, parsePerformanceOptions, parsePerformanceRange, PERFORMANCE_RANGES } from '@/lib/performance-display';
import { useUrlState } from '@/hooks/use-url-state';
import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

export function PerformanceChart({ data, summary, compact = false }: { data: PortfolioTimelinePoint[]; summary: PortfolioSummary; compact?: boolean }) {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const currency = settings.currency;
  const [range, patch] = useUrlState(parsePerformanceRange);
  const [options] = useUrlState(parsePerformanceOptions);
  const { includeFees, includeTaxes } = options;
  const id = useId().replace(/:/g, '');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const series = useMemo(() => getPerformanceSeries(data, range, currency, options), [data, range, currency, options]);
  const colorStops = useMemo(() => getPerformanceColorStops(series), [series]);
  const enoughHistory = series.filter((point) => point.actual !== null).length > 1;
  const money = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const basis = includeFees && includeTaxes ? (he ? 'לאחר עמלות ואומדן מס' : 'After fees & estimated tax') : !includeFees && !includeTaxes ? (he ? 'לפני ניכויים' : 'Before deductions') : includeFees ? (he ? 'לאחר עמלות בלבד' : 'After fees only') : (he ? 'לאחר אומדן מס בלבד' : 'After estimated tax only');
  const deductions = [
    { key: 'includeFees', enabled: includeFees, label: he ? 'עמלות שהוזנו' : 'Recorded fees', detail: he ? 'קנייה ומכירה' : 'Buy & sell transactions' },
    { key: 'includeTaxes', enabled: includeTaxes, label: he ? 'אומדן מס' : 'Estimated tax', detail: he ? 'על רווחים שמומשו' : 'On realized profits' },
  ];
  return <section aria-label={he ? 'ביצועים מול היעד' : 'Performance vs. target'} className="space-y-5" dir={he ? 'rtl' : 'ltr'}>
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
      <div><h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{he ? 'ביצועים מול היעד' : 'Performance vs. target'}</h2><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><p className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />{currency} · {basis}</p><button aria-expanded={optionsOpen} aria-controls={`${id}-options`} onClick={() => setOptionsOpen(open => !open)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${optionsOpen ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><SlidersHorizontal aria-hidden className="h-3 w-3" />{he ? 'אפשרויות חישוב' : 'Calculation options'}<ChevronDown aria-hidden className={`h-3 w-3 transition-transform motion-reduce:transition-none ${optionsOpen ? 'rotate-180' : ''}`} /></button></div></div>
      <div role="group" aria-label={he ? 'טווח הגרף' : 'Chart range'} className="flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 xl:w-auto" dir="ltr">
        {PERFORMANCE_RANGES.map((item) => <button key={item} aria-pressed={range === item} onClick={() => patch({ chartRange: item })} className={`min-h-9 min-w-0 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-w-[43px] ${range === item ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}>{item === 'All' ? he ? 'הכל' : 'All' : item}</button>)}
      </div>
    </div>
    <div id={`${id}-options`} hidden={!optionsOpen} className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><SlidersHorizontal aria-hidden className="h-4 w-4 text-blue-600" />{he ? 'מה נכנס לחישוב?' : 'What goes into the calculation?'}</div>
        <div role="group" aria-label={he ? 'בסיס חישוב מהיר' : 'Calculation presets'} className="inline-flex rounded-lg bg-slate-100 p-0.5">
          <button aria-pressed={includeFees && includeTaxes} onClick={() => patch({ includeFees: '1', includeTaxes: '1' })} className={`flex min-h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${includeFees && includeTaxes ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}><Sparkles aria-hidden className="h-3 w-3" />{he ? 'נטו' : 'Net'}</button>
          <button aria-pressed={!includeFees && !includeTaxes} onClick={() => patch({ includeFees: '0', includeTaxes: '0' })} className={`min-h-8 rounded-md px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${!includeFees && !includeTaxes ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{he ? 'ברוטו' : 'Gross'}</button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {deductions.map(({ key, enabled, label, detail }) => <button key={key} role="switch" aria-checked={enabled} aria-label={label} onClick={() => patch({ [key]: enabled ? '0' : '1' })} className={`flex min-h-[58px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${enabled ? 'border-blue-200 bg-white shadow-sm' : 'border-slate-200/80 bg-white/40'}`}><span><span className={`block text-xs font-semibold ${enabled ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span><span className="mt-0.5 block text-[11px] text-slate-500">{detail}</span></span><span aria-hidden className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`} dir="ltr"><span className={`flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-4' : 'translate-x-0'}`}>{enabled ? <Check className="h-2.5 w-2.5 text-blue-600" /> : null}</span></span></button>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500 sm:text-xs">
      <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-4 bg-red-600" />{he ? 'הפסד' : 'Loss'}</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-4 bg-blue-600" />{he ? 'מתחת ליעד' : 'Below target'}</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-4 bg-emerald-600" />{he ? 'מעל היעד' : 'Above target'}</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden className="w-4 border-t-2 border-dashed border-slate-400" />{he ? 'יעד אישי' : 'Personal target'}</span>
    </div>
    {enoughHistory ? <div className={compact ? 'h-[240px] w-full sm:h-[290px]' : 'h-[280px] w-full sm:h-[360px]'} dir="ltr">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">{colorStops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />)}</linearGradient>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="0">{colorStops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} stopOpacity={0.1} />)}</linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />
          <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} scale="time" axisLine={false} tickLine={false} minTickGap={42} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value: number) => new Date(value).toLocaleDateString(he ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} />
          <YAxis axisLine={false} tickLine={false} width={68} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value: number) => new Intl.NumberFormat(he ? 'he-IL' : 'en-US', { notation: 'compact', style: 'currency', currency, maximumFractionDigits: 1 }).format(value)} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Tooltip filterNull={false} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as typeof series[number];
            const rows = [
              { label: he ? 'רווח לפני ניכויים' : 'Profit before deductions', value: point.gross },
              { label: he ? 'עמלות שהוזנו' : 'Recorded fees', value: point.fees === null ? null : -point.fees, enabled: includeFees },
              { label: he ? 'אומדן מס על מימושים' : 'Estimated tax on realized gains', value: point.tax === null ? null : -point.tax, enabled: includeTaxes },
            ];
            return <div className="min-w-[220px] max-w-[280px] rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl" dir={he ? 'rtl' : 'ltr'}><p className="mb-3 text-[11px] font-medium text-slate-500">{new Date(Number(label)).toLocaleDateString(he ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p><div className="space-y-2">{rows.map(row => <div key={row.label} className={`flex items-center justify-between gap-5 ${row.enabled === false ? 'text-slate-400' : 'text-slate-600'}`}><span>{row.label}{row.enabled === false ? <span className="ms-1 text-[10px]">{he ? '(לא נוכה)' : '(excluded)'}</span> : null}</span><bdi className="font-medium tabular-nums">{money(row.value)}</bdi></div>)}</div><div className="mt-3 flex items-center justify-between gap-5 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-950"><span>{he ? 'רווח בתצוגה' : 'Displayed P/L'}</span><bdi className="tabular-nums">{money(point.actual)}</bdi></div><div className="mt-2 flex items-center justify-between gap-5 text-slate-500"><span>{he ? 'יעד אישי' : 'Personal target'}</span><bdi className="tabular-nums">{money(point.target)}</bdi></div></div>;
          }} />
          <Area type="linear" dataKey="actual" name={he ? 'רווח בפועל' : 'Actual P/L'} stroke={`url(#${id}-line)`} strokeWidth={2.5} fill={`url(#${id}-fill)`} isAnimationActive={false} connectNulls={false} />
          {Number.isFinite(summary.totalProjectedPnLUsd) ? <Line type="linear" dataKey="target" name={he ? 'יעד אישי' : 'Personal target'} stroke="#94a3b8" strokeWidth={1.8} strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div> : <div className="flex min-h-[230px] items-center justify-center text-center text-sm text-slate-500">{he ? 'אין מספיק נתונים להצגת גרף בטווח שנבחר.' : 'Not enough data to chart this period.'}</div>}
    <details className="group border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500"><summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 font-medium"><ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />{he ? 'איך מחושבים הנתונים?' : 'How are these values calculated?'}</summary><p className="mt-1 max-w-3xl">{he ? 'היסטוריה לפי נתוני סוף יום. ביום ללא מסחר משמש המחיר האחרון הזמין; היום מתעדכן בנתונים הזמינים כעת. העמלות הן הסכומים שהוזנו בעסקאות, והמס הוא אומדן על רווחים שמומשו, לא מס ששולם בפועל. היעד האישי אינו משתנה עם מתגי הניכויים. נתונים חסרים מוצגים כפער בגרף.' : 'History uses daily closing data. Non-trading days carry the last available price; today uses currently available data. Fees are the amounts recorded in transactions. Tax is an estimate on realized gains, not actual tax paid. Deduction controls do not change your personal target. Missing data appears as a gap.'}</p></details>
  </section>;
}
