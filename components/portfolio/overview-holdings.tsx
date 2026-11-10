'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, Circle, Search, Target } from 'lucide-react';
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
  return { holding: params.get('holding'), q: (params.get('q') ?? '').slice(0, 200), filter: FILTERS.includes(filter as typeof FILTERS[number]) ? filter as typeof FILTERS[number] : 'all' };
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
  const activeValues = metrics.filter((metric) => metric.position.quantity > 0).map((metric) => currency === 'ILS' ? metric.currentValueIls : metric.currentValue);
  const portfolioValue = activeValues.every(Number.isFinite) ? activeValues.reduce((sum, value) => sum + value, 0) : Number.NaN;
  const money = (value: number) => Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const price = (m: PositionMetrics) => currency === 'ILS' ? m.currentPrice * (m.currentValue > 0 ? m.currentValueIls / m.currentValue : Number.NaN) : m.currentPrice;
  const tone = (value: number) => value > 0.01 ? 'text-emerald-700' : value < -0.01 ? 'text-rose-600' : 'text-slate-600';
  const percent = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${formatPercent(value, locale)}` : '—';
  const gapLabel = (gap: number) => !Number.isFinite(gap) ? (he ? 'מרחק מהיעד' : 'Distance to target') : gap < -0.01 ? (he ? 'חסר ליעד' : 'Below target') : gap > 0.01 ? (he ? 'מעל היעד' : 'Above target') : (he ? 'ביעד' : 'On target');
  const columns = he ? ['מניה', 'מחיר', 'שווי', 'מרחק מהיעד', 'רווח / הפסד', 'מגמת המחיר'] : ['Stock', 'Price', 'Value', 'Distance to target', 'Profit / loss', 'Price trend'];
  return <DashboardSurface className="rounded-xl p-4 sm:p-5">
    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="text-xl font-semibold text-slate-950">{he ? 'החזקות פעילות' : 'Active holdings'}</h2><div className="relative w-full sm:w-56"><Search aria-hidden className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-slate-400" /><Input aria-label={he ? 'חיפוש בהחזקות' : 'Search holdings'} placeholder={he ? 'חיפוש מניה' : 'Search stocks'} value={state.q} onChange={(event) => patch({ q: event.target.value })} className="rounded-lg border-slate-200 ps-9" /></div></div>
    <div className="mb-4 flex items-center justify-between gap-3 text-xs text-slate-500"><label className="flex items-center gap-2"><span>{he ? 'הצגה' : 'Show'}</span><select aria-label={he ? 'סינון החזקות' : 'Filter holdings'} value={state.filter} onChange={(event) => patch({ filter: event.target.value === 'all' ? null : event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">{FILTERS.map((filter, index) => <option key={filter} value={filter}>{labels[index]}</option>)}</select></label><div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1"><span>{filtered.length} {he ? 'החזקות' : 'holdings'} · {currency}</span><span className="inline-flex items-center gap-1.5"><Circle aria-hidden className="h-2.5 w-2.5 fill-emerald-50 text-emerald-700" />{he ? 'כניסה' : 'Entry'}</span><span className="inline-flex items-center gap-1.5"><Circle aria-hidden className="h-2.5 w-2.5 fill-red-50 text-red-700" />{he ? 'יציאה' : 'Exit'}</span></div></div>
    {filtered.length ? <>
      <table className="hidden w-full text-sm xl:table"><thead><tr className="bg-slate-50 text-xs font-medium text-slate-500">{columns.map((column, index) => <th key={column} className={`px-3 py-3 font-medium ${index ? 'text-end' : 'text-start'}`}>{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((m) => {
        const id = `overview-${m.position.activationId ?? m.position.id ?? m.position.symbol}`;
        const pnl = currency === 'ILS' ? m.positionPnLIls : m.positionPnLUsd;
        const gap = currency === 'ILS' ? m.combinedIls : m.combined;
        return <tr key={id} className="hover:bg-slate-50/70"><td className="px-3 py-3"><Link id={id} href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} className="inline-flex min-h-11 flex-col justify-center rounded text-start"><span className="font-semibold text-slate-950" dir="ltr">{m.position.symbol}</span><span className="text-xs text-slate-500">{m.position.display}</span></Link></td><td className="px-3 py-3 text-end tabular-nums"><bdi>{money(price(m))}</bdi><span className={`mt-1 block text-xs ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi> <span className="text-slate-400">{he ? 'יומי' : 'today'}</span></span></td><td className="px-3 py-3 text-end tabular-nums"><bdi>{money(currency === 'ILS' ? m.currentValueIls : m.currentValue)}</bdi></td><td className={`px-3 py-3 text-end font-semibold tabular-nums ${tone(gap)}`}><bdi>{money(Math.abs(gap))}</bdi><span className="mt-1 block text-xs font-normal">{gapLabel(gap)}</span></td><td className={`px-3 py-3 text-end tabular-nums ${tone(pnl)}`}><bdi>{money(pnl)}</bdi><span className="mt-1 block text-xs"><bdi>{percent(m.roiPercent)}</bdi> <span className="font-normal text-slate-400">{he ? 'מהקנייה' : 'since entry'}</span></span></td><td className="w-36 px-3 py-3"><StockMiniChart metric={m} points={sparklineData[m.position.activationId ?? m.position.id ?? m.position.symbol] ?? []} compact /></td></tr>;
      })}</tbody></table>
      <div className="space-y-2 xl:hidden">{filtered.map((m) => {
        const key = m.position.activationId ?? m.position.id ?? m.position.symbol;
        const id = `overview-mobile-${key}`;
        const expanded = state.holding === key;
        const pnl = currency === 'ILS' ? m.positionPnLIls : m.positionPnLUsd;
        const gap = currency === 'ILS' ? m.combinedIls : m.combined;
        const value = currency === 'ILS' ? m.currentValueIls : m.currentValue;
        const cost = value - pnl;
        const holdingReturn = Number.isFinite(cost) && cost > 0 ? pnl / cost * 100 : undefined;
        const allocation = Number.isFinite(value) && portfolioValue > 0 ? value / portfolioValue * 100 : undefined;
        const entryDate = new Date(m.position.entryDate);
        const entryLabel = Number.isFinite(entryDate.getTime()) ? entryDate.toLocaleDateString(he ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        return <article key={id} className={`holding-card ${expanded ? 'holding-card-open' : ''}`}>
          <button id={id} type="button" aria-expanded={expanded} aria-controls={`${id}-details`} aria-describedby={`${id}-summary`} aria-label={he ? `${expanded ? 'סגירת' : 'פתיחת'} פרטי ${m.position.symbol}` : `${expanded ? 'Collapse' : 'Expand'} ${m.position.symbol} details`} onClick={() => patch({ holding: expanded ? null : key })} className="holding-toggle block w-full rounded-2xl px-4 pb-4 pt-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-5">
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="holding-monogram flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-xs font-bold text-slate-600">{m.position.symbol.slice(0, 2)}</span>
                <span className="min-w-0"><span className="block truncate text-base font-semibold tracking-tight text-slate-950" dir="ltr">{m.position.symbol}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{m.position.display}</span></span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-end"><span className="block text-[11px] text-slate-500">{he ? 'שווי היום' : 'Value today'}</span><span className="mt-1 block text-lg font-semibold tabular-nums tracking-tight text-slate-950"><bdi>{money(value)}</bdi></span></span>
                <ChevronDown aria-hidden="true" className="holding-chevron h-4 w-4 text-slate-400" />
              </span>
            </span>
            <span id={`${id}-summary`} className="mt-4 grid grid-cols-[1.25fr_1fr_0.75fr] items-start gap-3 sm:gap-5">
              <span><span className="inline-flex items-center gap-1.5 text-xs font-medium leading-5 text-slate-600"><Target aria-hidden className="h-3.5 w-3.5 text-blue-500" />{gapLabel(gap)}</span><span className={`mt-1 block text-lg font-semibold tabular-nums ${tone(gap)}`}><bdi>{money(Math.abs(gap))}</bdi></span></span>
              <span><span className="block text-xs leading-5 text-slate-500">{he ? 'עלות הקנייה' : 'Purchase cost'}</span><span className="mt-1 block text-sm font-medium tabular-nums text-slate-700"><bdi>{money(cost)}</bdi></span></span>
              <span><span className="block text-xs leading-5 text-slate-500">{he ? 'מהתיק' : 'Of portfolio'}</span><span className="mt-1 block text-sm font-medium tabular-nums text-slate-700"><bdi>{allocation !== undefined ? formatPercent(allocation, locale) : '—'}</bdi></span></span>
            </span>
          </button>
          <div id={`${id}-details`} aria-hidden={!expanded} ref={(element) => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
            <div className="min-h-0 overflow-hidden">
              <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4 pt-1 sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">{he ? 'מחיר מניה · USD' : 'Share price · USD'}</dt><dd className="mt-1.5 text-base font-semibold tabular-nums text-slate-900"><bdi>{Number.isFinite(m.currentPrice) ? formatCurrency(m.currentPrice, 'USD', locale) : '—'}</bdi><span className={`ms-2 inline-block text-xs font-medium ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi> <span className="text-slate-500">{he ? 'היום' : 'today'}</span></span></dd></div>
                  <div><dt className="text-xs text-slate-500">{he ? 'עלות למניה · USD' : 'Avg. share cost · USD'}</dt><dd className="mt-1.5 text-base font-semibold tabular-nums text-slate-900"><bdi>{Number.isFinite(m.position.entryPrice) ? formatCurrency(m.position.entryPrice, 'USD', locale) : '—'}</bdi></dd></div>
                  <div className="col-span-2 flex items-center justify-between gap-3 text-xs sm:col-span-1 sm:block"><dt className="text-slate-500">{he ? 'רווח / הפסד' : 'Profit / loss'}</dt><dd className={`font-medium tabular-nums sm:mt-1.5 sm:text-base ${tone(pnl)}`}><bdi>{money(pnl)}</bdi><span className="ms-2 inline-block text-xs"><bdi>{percent(holdingReturn)}</bdi></span></dd></div>
                </dl>
                <div className="mt-5"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{he ? 'מחיר המניה לאורך זמן' : 'Share price history'}</span><span className="flex items-center gap-3 text-[11px]"><span className="inline-flex items-center gap-1"><span aria-hidden className="w-3 border-t border-dashed border-slate-300" />{he ? 'עלות קנייה' : 'Buy cost'}</span><span className="inline-flex items-center gap-1"><span aria-hidden className="w-3 border-t border-dashed border-slate-400" />{he ? 'יעד' : 'Target'}</span></span></div><StockMiniChart metric={m} points={sparklineData[key] ?? []} /></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><p className="text-xs text-slate-500"><bdi>{Number.isFinite(m.position.quantity) ? m.position.quantity.toLocaleString(he ? 'he-IL' : 'en-US', { maximumFractionDigits: 6 }) : '—'}</bdi> {he ? 'מניות' : 'shares'} <span className="mx-1 text-slate-300">·</span> {he ? 'מאז' : 'Since'} {entryLabel}</p><Link href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{he ? `לפרטי ${m.position.symbol}` : `View ${m.position.symbol} details`}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 rtl:-scale-x-100" /></Link></div>
                <details className="group text-[11px] leading-relaxed text-slate-500"><summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ChevronDown aria-hidden className="h-3 w-3 transition-transform group-open:rotate-180" />{he ? 'אופן החישוב' : 'Calculation details'}</summary><p className="max-w-2xl pb-2">{he ? 'הרווח והתשואה הם על ההחזקה הפתוחה בלבד, במטבע התיק, כולל עמלות קנייה שהוזנו ולפני מס. העלות למניה היא ממוצעת וכוללת עמלות קנייה. מחירי המניה והגרף בדולרים. היעד אישי ואינו תחזית שוק.' : 'Profit and return cover only the open holding in your portfolio currency, including recorded buy fees and before tax. Average share cost includes buy fees. Share prices and the chart are in USD. The personal target is not a market forecast.'}</p></details>
              </div>
            </div>
          </div>
        </article>;
      })}</div>
    </> : <p className="py-10 text-center text-sm text-slate-500">{he ? 'אין החזקות פעילות התואמות לסינון.' : 'No active holdings match your filters.'}</p>}
  </DashboardSurface>;
}
