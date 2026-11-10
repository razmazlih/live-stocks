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
import { OverviewHoldingCard } from './overview-holding-card';
import { getHoldingTarget } from '@/lib/holding-display';
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
    if (state.filter === 'ahead') return getHoldingTarget(m).difference > 0.01;
    if (state.filter === 'lagging') return getHoldingTarget(m).difference < -0.01;
    return true;
  }).sort((a, b) => { const left = getHoldingTarget(a); const right = getHoldingTarget(b); return (left.distancePercent !== undefined ? Math.sign(left.difference) * left.distancePercent : Infinity) - (right.distancePercent !== undefined ? Math.sign(right.difference) * right.distancePercent : Infinity); }), [metrics, state.q, state.filter]);
  const currency = settings.currency;
  const activeValues = metrics.filter((metric) => metric.position.quantity > 0).map((metric) => currency === 'ILS' ? metric.currentValueIls : metric.currentValue);
  const portfolioValue = activeValues.every(Number.isFinite) ? activeValues.reduce((sum, value) => sum + value, 0) : Number.NaN;
  const money = (value: number) => Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const usd = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatCurrency(value, 'USD', locale) : '—';
  const tone = (value: number) => value > 0.01 ? 'text-emerald-700' : value < -0.01 ? 'text-rose-600' : 'text-slate-600';
  const percent = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${formatPercent(value, locale)}` : '—';
  const gapLabel = (difference: number) => !Number.isFinite(difference) ? (he ? 'עלייה ליעד' : 'Rise to target') : difference < -0.001 ? (he ? 'עלייה ליעד' : 'Rise to target') : difference > 0.001 ? (he ? 'מעל היעד' : 'Above target') : (he ? 'ביעד' : 'On target');
  const columns = he ? ['מניה', 'מחיר כעת · USD', 'מכירה ליעד · USD', 'מרחק מהיעד', 'שווי', 'רווח / הפסד', 'מגמת המחיר'] : ['Stock', 'Current · USD', 'Sell for target · USD', 'Distance to target', 'Value', 'Profit / loss', 'Price trend'];
  return <DashboardSurface className="rounded-xl p-4 sm:p-5">
    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="text-xl font-semibold text-slate-950">{he ? 'החזקות פעילות' : 'Active holdings'}</h2><div className="relative w-full sm:w-56"><Search aria-hidden className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-slate-400" /><Input aria-label={he ? 'חיפוש בהחזקות' : 'Search holdings'} placeholder={he ? 'חיפוש מניה' : 'Search stocks'} value={state.q} onChange={(event) => patch({ q: event.target.value })} className="rounded-lg border-slate-200 ps-9" /></div></div>
    <div className="mb-4 flex items-center justify-between gap-3 text-xs text-slate-500"><label className="flex items-center gap-2"><span>{he ? 'הצגה' : 'Show'}</span><select aria-label={he ? 'סינון החזקות' : 'Filter holdings'} value={state.filter} onChange={(event) => patch({ filter: event.target.value === 'all' ? null : event.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">{FILTERS.map((filter, index) => <option key={filter} value={filter}>{labels[index]}</option>)}</select></label><div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1"><span>{filtered.length} {he ? 'החזקות' : 'holdings'} · {currency}</span><span className="inline-flex items-center gap-1.5"><Circle aria-hidden className="h-2.5 w-2.5 fill-emerald-50 text-emerald-700" />{he ? 'כניסה' : 'Entry'}</span><span className="inline-flex items-center gap-1.5"><Circle aria-hidden className="h-2.5 w-2.5 fill-red-50 text-red-700" />{he ? 'יציאה' : 'Exit'}</span></div></div>
    {filtered.length ? <>
      <table className="hidden w-full text-sm xl:table"><thead><tr className="bg-slate-50 text-xs font-medium text-slate-500">{columns.map((column, index) => <th key={column} className={`px-3 py-3 font-medium ${index ? 'text-end' : 'text-start'}`}>{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((m) => {
        const id = `overview-${m.position.activationId ?? m.position.id ?? m.position.symbol}`;
        const pnl = currency === 'ILS' ? m.positionPnLIls : m.positionPnLUsd;
        const target = getHoldingTarget(m);
        return <tr key={id} className="hover:bg-slate-50/70"><td className="px-3 py-3"><Link id={id} href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} className="inline-flex min-h-11 flex-col justify-center rounded text-start"><span className="font-semibold text-slate-950" dir="ltr">{m.position.symbol}</span><span className="text-xs text-slate-500">{m.position.display}</span></Link></td><td className="px-3 py-3 text-end tabular-nums"><bdi>{usd(m.currentPrice)}</bdi><span className={`mt-1 block text-xs ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi> <span className="text-slate-400">{he ? 'יומי' : 'today'}</span></span></td><td className="px-3 py-3 text-end font-semibold tabular-nums text-blue-700"><bdi>{usd(target.salePrice)}</bdi></td><td className={`px-3 py-3 text-end font-semibold tabular-nums ${tone(target.difference)}`}><bdi>{target.distancePercent !== undefined ? formatPercent(target.distancePercent, locale) : '—'}</bdi><span className="mt-1 block text-xs font-normal">{gapLabel(target.difference)}</span></td><td className="px-3 py-3 text-end tabular-nums"><bdi>{money(currency === 'ILS' ? m.currentValueIls : m.currentValue)}</bdi></td><td className={`px-3 py-3 text-end tabular-nums ${tone(pnl)}`}><bdi>{money(pnl)}</bdi><span className="mt-1 block text-xs"><bdi>{percent(m.roiPercent)}</bdi> <span className="font-normal text-slate-400">{he ? 'מהקנייה' : 'since entry'}</span></span></td><td className="w-36 px-3 py-3"><StockMiniChart metric={m} points={sparklineData[m.position.activationId ?? m.position.id ?? m.position.symbol] ?? []} compact targetPrice={target.salePrice ?? null} /></td></tr>;
      })}</tbody></table>
      <div className="space-y-2 xl:hidden">{filtered.map((metric) => {
        const key = metric.position.activationId ?? metric.position.id ?? metric.position.symbol;
        return <OverviewHoldingCard key={key} metric={metric} points={sparklineData[key] ?? []} expanded={state.holding === key} onToggle={() => patch({ holding: state.holding === key ? null : key })} sourceUrl={sourceUrl || '/'} portfolioValue={portfolioValue} />;
      })}</div>
    </> : <p className="py-10 text-center text-sm text-slate-500">{he ? 'אין החזקות פעילות התואמות לסינון.' : 'No active holdings match your filters.'}</p>}
  </DashboardSurface>;
}
