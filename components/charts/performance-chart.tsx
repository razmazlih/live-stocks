'use client';

import { useId, useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '@/lib/context';
import { formatCurrency } from '@/lib/calculations';
import { getPerformanceColorStops, getPerformanceSeries, parsePerformanceRange, PERFORMANCE_RANGES } from '@/lib/performance-display';
import { useUrlState } from '@/hooks/use-url-state';
import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

export function PerformanceChart({ data, summary, compact = false }: { data: PortfolioTimelinePoint[]; summary: PortfolioSummary; compact?: boolean }) {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const currency = settings.currency;
  const [range, patch] = useUrlState(parsePerformanceRange);
  const id = useId().replace(/:/g, '');
  const series = useMemo(() => getPerformanceSeries(data, range, currency), [data, range, currency]);
  const colorStops = useMemo(() => getPerformanceColorStops(series), [series]);
  const enoughHistory = series.filter((point) => point.actual !== null).length > 1;
  const money = (value: number) => Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  return <section aria-label={he ? 'ביצועים מול היעד' : 'Performance vs. target'} className="space-y-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{he ? 'ביצועים מול היעד' : 'Performance vs. target'}</h2>
      <div role="group" aria-label={he ? 'טווח הגרף' : 'Chart range'} className="flex w-full rounded-lg border border-slate-200 bg-white p-0.5 sm:w-auto" dir="ltr">
        {PERFORMANCE_RANGES.map((item) => <button key={item} aria-pressed={range === item} onClick={() => patch({ chartRange: item })} className={`min-w-0 flex-1 rounded-md px-2 text-xs font-medium transition-colors sm:min-w-[45px] ${range === item ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{item === 'All' ? he ? 'הכל' : 'All' : item}</button>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
      <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-5 bg-red-600" />{he ? 'הפסד' : 'Loss'}</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-5 bg-blue-600" />{he ? 'רווח מתחת ליעד' : 'Profit below target'}</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden className="h-0.5 w-5 bg-emerald-600" />{he ? 'רווח מעל היעד' : 'Profit above target'}</span>
      <span className="inline-flex items-center gap-2"><span aria-hidden className="w-5 border-t-2 border-dashed border-slate-400" />{he ? 'יעד אישי' : 'Personal target'}</span>
      <span className="ms-auto">{currency} · {he ? 'לפני אומדן מס' : 'Before estimated tax'}</span>
    </div>
    <p className="text-xs text-slate-500">{he ? 'היסטוריה לפי נתוני סוף יום; בימים ללא מסחר משמש המחיר האחרון הזמין. היום מתעדכן לפי הנתונים הזמינים כעת. נתונים חסרים אינם מושלמים בשער של היום.' : 'History uses daily closing data; non-trading days use the last available price. Today updates with currently available data. Missing history is not replaced with today’s FX.'}</p>
    {enoughHistory ? <div className={compact ? 'h-[230px] w-full sm:h-[280px]' : 'h-[270px] w-full sm:h-[340px]'} dir="ltr">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">{colorStops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} />)}</linearGradient>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="0">{colorStops.map((stop, index) => <stop key={index} offset={`${stop.offset}%`} stopColor={stop.color} stopOpacity={0.08} />)}</linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} scale="time" axisLine={false} tickLine={false} minTickGap={42} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value: number) => new Date(value).toLocaleDateString(he ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} />
          <YAxis axisLine={false} tickLine={false} width={68} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value: number) => new Intl.NumberFormat(he ? 'he-IL' : 'en-US', { notation: 'compact', style: 'currency', currency, maximumFractionDigits: 1 }).format(value)} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg" dir={he ? 'rtl' : 'ltr'}><p className="mb-2 text-xs text-slate-500">{new Date(Number(label)).toLocaleDateString(he ? 'he-IL' : 'en-US', { timeZone: 'UTC' })}</p>{payload.map((item) => <div key={String(item.dataKey)} className="flex items-center justify-between gap-5 py-1"><span>{item.dataKey === 'actual' ? he ? 'רווח בפועל' : 'Actual P/L' : he ? 'יעד אישי' : 'Personal target'}</span><bdi className="font-semibold tabular-nums">{money(Number(item.value))}</bdi></div>)}</div> : null} />
          <Area type="linear" dataKey="actual" name={he ? 'רווח בפועל' : 'Actual P/L'} stroke={`url(#${id}-line)`} strokeWidth={2.5} fill={`url(#${id}-fill)`} isAnimationActive={false} connectNulls={false} />
          {Number.isFinite(summary.totalProjectedPnLUsd) ? <Line type="linear" dataKey="target" name={he ? 'יעד אישי' : 'Personal target'} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div> : <div className="flex min-h-[230px] items-center justify-center text-center text-sm text-slate-500">{he ? 'אין מספיק נתונים להצגת גרף בטווח שנבחר.' : 'Not enough data to chart this period.'}</div>}
  </section>;
}
