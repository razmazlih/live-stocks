'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Circle, Search } from 'lucide-react';
import { useApp } from '@/lib/context';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { useUrlState } from '@/hooks/use-url-state';
import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';
import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { Input } from '@/components/ui/input';
import { StockMiniChart } from './stock-mini-chart';
import type { HistoricalPoint, PositionMetrics } from '@/types';

const FILTERS = ['all', 'winners', 'losers', 'ahead', 'lagging'] as const;
function parseHoldings(params: URLSearchParams) {
  const filter = params.get('filter');
  return { q: (params.get('q') ?? '').slice(0, 200), filter: FILTERS.includes(filter as typeof FILTERS[number]) ? filter as typeof FILTERS[number] : 'all' };
}

export function OverviewHoldings({ metrics, sparklineData = {} }: { metrics: PositionMetrics[]; sparklineData?: Record<string, HistoricalPoint[]> }) {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const [state, patch, sourceUrl] = useUrlState(parseHoldings);
  const labels = he ? ['הכל', 'ברווח', 'בהפסד', 'מעל היעד', 'מתחת ליעד'] : ['All', 'In profit', 'In loss', 'Above target', 'Below target'];
  const filtered = useMemo(() => metrics.filter((m) => {
    if (m.position.quantity <= 0 || !`${m.position.symbol} ${m.position.display}`.toLowerCase().includes(state.q.trim().toLowerCase())) return false;
    if (state.filter === 'winners') return m.positionPnLUsd > 0.01;
    if (state.filter === 'losers') return m.positionPnLUsd < -0.01;
    if (state.filter === 'ahead') return m.combined > 0.01;
    if (state.filter === 'lagging') return m.combined < -0.01;
    return true;
  }).sort((a, b) => a.combined - b.combined), [metrics, state.q, state.filter]);
  const currency = settings.currency;
  const money = (value: number) => Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const price = (m: PositionMetrics) => currency === 'ILS' ? m.currentPrice * (m.currentValue > 0 ? m.currentValueIls / m.currentValue : Number.NaN) : m.currentPrice;
  const tone = (value: number) => value > 0.01 ? 'text-emerald-700' : value < -0.01 ? 'text-rose-600' : 'text-slate-600';
  const percent = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${formatPercent(value, locale)}` : '—';
  const columns = he ? ['מניה', 'מחיר', 'שווי', 'רווח / הפסד', 'פער מהיעד', 'מגמת המחיר'] : ['Stock', 'Price', 'Value', 'Profit / loss', 'Target gap', 'Price trend'];
  return <DashboardSurface className="rounded-xl p-4 sm:p-5">
    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="text-xl font-semibold text-slate-950">{he ? 'החזקות פעילות' : 'Active holdings'}</h2><div className="relative w-full sm:w-56"><Search aria-hidden className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-slate-400" /><Input aria-label={he ? 'חיפוש בהחזקות' : 'Search holdings'} placeholder={he ? 'חיפוש מניה' : 'Search stocks'} value={state.q} onChange={(event) => patch({ q: event.target.value })} className="rounded-lg border-slate-200 ps-9" /></div></div>
    <div className="mb-4 flex items-center justify-between gap-3 text-xs text-slate-500"><label className="flex items-center gap-2"><span>{he ? 'הצגה' : 'Show'}</span><select aria-label={he ? 'סינון החזקות' : 'Filter holdings'} value={state.filter} onChange={(event) => patch({ filter: event.target.value === 'all' ? null : event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">{FILTERS.map((filter, index) => <option key={filter} value={filter}>{labels[index]}</option>)}</select></label><div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1"><span>{filtered.length} {he ? 'החזקות' : 'holdings'} · {currency}</span><span className="inline-flex items-center gap-1.5"><Circle aria-hidden className="h-2.5 w-2.5 fill-emerald-50 text-emerald-700" />{he ? 'כניסה' : 'Entry'}</span><span className="inline-flex items-center gap-1.5"><Circle aria-hidden className="h-2.5 w-2.5 fill-red-50 text-red-700" />{he ? 'יציאה' : 'Exit'}</span></div></div>
    {filtered.length ? <>
      <table className="hidden w-full text-sm xl:table"><thead><tr className="bg-slate-50 text-xs font-medium text-slate-500">{columns.map((column, index) => <th key={column} className={`px-3 py-3 font-medium ${index ? 'text-end' : 'text-start'}`}>{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((m) => {
        const id = `overview-${m.position.activationId ?? m.position.id ?? m.position.symbol}`;
        const pnl = currency === 'ILS' ? m.positionPnLIls : m.positionPnLUsd;
        const gap = currency === 'ILS' ? m.combinedIls : m.combined;
        return <tr key={id} className="hover:bg-slate-50/70"><td className="px-3 py-3"><Link id={id} href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} className="inline-flex min-h-11 flex-col justify-center rounded text-start"><span className="font-semibold text-slate-950" dir="ltr">{m.position.symbol}</span><span className="text-xs text-slate-500">{m.position.display}</span></Link></td><td className="px-3 py-3 text-end tabular-nums"><bdi>{money(price(m))}</bdi><span className={`mt-1 block text-xs ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi> <span className="text-slate-400">{he ? 'יומי' : 'today'}</span></span></td><td className="px-3 py-3 text-end tabular-nums"><bdi>{money(currency === 'ILS' ? m.currentValueIls : m.currentValue)}</bdi></td><td className={`px-3 py-3 text-end font-medium tabular-nums ${tone(pnl)}`}><bdi>{money(pnl)}</bdi><span className="mt-1 block text-xs"><bdi>{percent(m.roiPercent)}</bdi> <span className="font-normal text-slate-400">{he ? 'מהקנייה' : 'since entry'}</span></span></td><td className={`px-3 py-3 text-end font-medium tabular-nums ${tone(gap)}`}><bdi>{money(gap)}</bdi></td><td className="w-36 px-3 py-3"><StockMiniChart metric={m} points={sparklineData[m.position.activationId ?? m.position.id ?? m.position.symbol] ?? []} compact /></td></tr>;
      })}</tbody></table>
      <div className="divide-y divide-slate-100 xl:hidden">{filtered.map((m) => {
        const id = `overview-mobile-${m.position.activationId ?? m.position.id ?? m.position.symbol}`;
        const pnl = currency === 'ILS' ? m.positionPnLIls : m.positionPnLUsd;
        const gap = currency === 'ILS' ? m.combinedIls : m.combined;
        return <Link key={id} id={id} href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} className="block rounded-lg py-4 focus-visible:ring-2 focus-visible:ring-blue-500"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-950">{m.position.symbol}</p><p className="text-xs text-slate-500">{m.position.display}</p></div><bdi className="font-semibold tabular-nums">{money(currency === 'ILS' ? m.currentValueIls : m.currentValue)}</bdi></div><dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-slate-500">{columns[1]}</dt><dd className="mt-1 tabular-nums"><bdi>{money(price(m))}</bdi><span className={`mt-1 block ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi> <span className="text-slate-400">{he ? 'יומי' : 'today'}</span></span></dd></div><div><dt className="text-slate-500">{columns[3]}</dt><dd className={`mt-1 font-medium tabular-nums ${tone(pnl)}`}><bdi>{money(pnl)}</bdi><span className="mt-1 block"><bdi>{percent(m.roiPercent)}</bdi> <span className="font-normal text-slate-400">{he ? 'מהקנייה' : 'since entry'}</span></span></dd></div><div><dt className="text-slate-500">{columns[4]}</dt><dd className={`mt-1 font-medium tabular-nums ${tone(gap)}`}><bdi>{money(gap)}</bdi></dd></div></dl><div className="mt-4"><StockMiniChart metric={m} points={sparklineData[m.position.activationId ?? m.position.id ?? m.position.symbol] ?? []} /></div></Link>;
      })}</div>
    </> : <p className="py-10 text-center text-sm text-slate-500">{he ? 'אין החזקות פעילות התואמות לסינון.' : 'No active holdings match your filters.'}</p>}
  </DashboardSurface>;
}
