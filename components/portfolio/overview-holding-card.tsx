'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChartNoAxesCombined, ChevronDown, Target } from 'lucide-react';
import { useApp } from '@/lib/context';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';
import { getHoldingTarget } from '@/lib/holding-display';
import { buildHoldingPerformanceHistory } from '@/lib/holding-chart-history';
import { HoldingTrendBackground } from './holding-trend-background';
import { StockLogo } from '@/components/ui/stock-logo';
import type { SparklineEvent } from '@/components/charts/sparkline';
import type { HistoricalPoint, Position, PositionMetrics } from '@/types';

interface OverviewHoldingCardProps {
  metric: PositionMetrics;
  points: HistoricalPoint[];
  expanded: boolean;
  onToggle: () => void;
  sourceUrl: string;
  portfolioValue: number;
  historyPositions: Position[];
}

export function OverviewHoldingCard({ metric: m, points, expanded, onToggle, sourceUrl, portfolioValue, historyPositions }: OverviewHoldingCardProps) {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const currency = settings.currency;
  const cardRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const chartSlotRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const money = (value: number) => Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const usd = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatCurrency(value, 'USD', locale) : '—';
  const tone = (value: number) => value > 0.01 ? 'text-emerald-700' : value < -0.01 ? 'text-rose-600' : 'text-slate-600';
  const percent = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${formatPercent(value, locale)}` : '—';
  const gapLabel = (difference: number) => !Number.isFinite(difference) ? (he ? 'עלייה ליעד' : 'Rise to target') : difference < -0.001 ? (he ? 'עלייה ליעד' : 'Rise to target') : difference > 0.001 ? (he ? 'מעל היעד' : 'Above target') : (he ? 'ביעד' : 'On target');
  const events = useMemo<SparklineEvent[]>(() => {
    const lots = m.position.lots ?? [];
    const recorded = lots.flatMap((lot, index) => {
      const timestamp = new Date(lot.executedAt).getTime();
      if ((lot.type !== 'BUY' && lot.type !== 'SELL') || !Number.isFinite(timestamp) || !Number.isFinite(lot.price) || lot.price <= 0 || !Number.isFinite(lot.quantity) || lot.quantity <= 0) return [];
      return [{ id: lot.id ?? `${m.position.symbol}-${lot.type}-${index}`, timestamp, type: lot.type, price: lot.price, quantity: lot.quantity, typeLabel: lot.type === 'BUY' ? (he ? 'כניסה' : 'Entry') : (he ? 'יציאה' : 'Exit') }];
    });
    const entryTime = new Date(m.position.entryDate).getTime();
    if (!lots.length && Number.isFinite(entryTime) && Number.isFinite(m.position.entryPrice) && m.position.entryPrice > 0 && m.position.quantity > 0) recorded.push({ id: `${m.position.symbol}-entry`, timestamp: entryTime, type: 'BUY', price: m.position.entryPrice, quantity: m.position.quantity, typeLabel: he ? 'כניסה' : 'Entry' });
    return recorded.sort((a, b) => a.timestamp - b.timestamp);
  }, [m.position, he]);
  const profitPoints = useMemo(() => buildHoldingPerformanceHistory(historyPositions, points, settings.annualGrowthRate), [historyPositions, points, settings.annualGrowthRate]);
  const chartAvailable = profitPoints.filter(point => point.actual !== null && Number.isFinite(point.actual)).length > 1;
  const historyRange = useMemo(() => {
    const timestamps = [...new Set(points.filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close >= 0).map((point) => point.timestamp))].sort((a, b) => a - b);
    if (timestamps.length < 2) return null;
    const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return { start: date(Math.min(timestamps[0], ...events.map(event => event.timestamp))), end: date(Math.max(timestamps[timestamps.length - 1], ...events.map(event => event.timestamp))) };
  }, [points, events, he]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const toggle = toggleRef.current;
    const slot = chartSlotRef.current;
    const graph = graphRef.current;
    if (!card || !toggle || !slot || !graph) return;
    const measure = () => {
      const outer = card.getBoundingClientRect();
      const target = (expanded ? slot : toggle).getBoundingClientRect();
      const x = expanded ? target.left - outer.left - card.clientLeft : 0;
      const y = expanded ? target.top - outer.top - card.clientTop : target.height * 0.40;
      const width = expanded ? target.width : card.clientWidth;
      const height = expanded ? target.height : target.height * 0.55;
      graph.style.setProperty('--chart-x', `${x}px`);
      graph.style.setProperty('--chart-y', `${y}px`);
      graph.style.setProperty('--chart-w', `${width}px`);
      graph.style.setProperty('--chart-h', `${height}px`);
      graph.style.setProperty('--chart-marker-x', `${width > 0 ? 1000 / width : 1}`);
      graph.style.setProperty('--chart-marker-y', `${height > 0 ? 160 / height : 1}`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(toggle);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [expanded]);

  const key = m.position.activationId ?? m.position.id ?? m.position.symbol;
  const id = `overview-mobile-${key}`;
  const pnl = currency === 'ILS' ? m.positionPnLIls : m.positionPnLUsd;
  const target = getHoldingTarget(m);
  const value = currency === 'ILS' ? m.currentValueIls : m.currentValue;
  const cost = value - pnl;
  const holdingReturn = Number.isFinite(cost) && cost > 0 ? pnl / cost * 100 : undefined;
  const cumulativeProfit = profitPoints.at(-1)?.actual;
  const holdingTone = typeof cumulativeProfit !== 'number' || !Number.isFinite(cumulativeProfit) || Math.abs(cumulativeProfit) < 0.01 ? 'neutral' : cumulativeProfit > 0 ? 'profit' : 'loss';
  const allocation = Number.isFinite(value) && portfolioValue > 0 ? value / portfolioValue * 100 : undefined;
  const entryDate = new Date(m.position.entryDate);
  const entryLabel = Number.isFinite(entryDate.getTime()) ? entryDate.toLocaleDateString(he ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  return <article ref={cardRef} data-trend={holdingTone} className={`holding-card ${expanded ? 'holding-card-open' : ''}`}>
    <div ref={graphRef} aria-hidden="true" className="holding-trend-layer"><HoldingTrendBackground points={points} tone={holdingTone} expanded={expanded} baseline={m.position.entryPrice} targetPrice={target.salePrice} events={events} locale={locale} profitPoints={profitPoints} /></div>
    <button ref={toggleRef} id={id} type="button" aria-expanded={expanded} aria-controls={`${id}-details`} aria-describedby={`${id}-summary`} aria-label={he ? `${expanded ? 'סגירת' : 'פתיחת'} פרטי ${m.position.symbol}` : `${expanded ? 'Collapse' : 'Expand'} ${m.position.symbol} details`} onClick={onToggle} className="holding-toggle block w-full rounded-2xl px-4 pb-4 pt-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5">
      
      <span className="holding-summary-content">
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <StockLogo symbol={m.position.symbol} display={m.position.display} imageUrl={m.position.imageUrl} />
          <span className="min-w-0"><span className="block truncate text-base font-semibold tracking-tight text-slate-950" dir="ltr">{m.position.symbol}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{m.position.display}</span></span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-end"><span className="block text-[11px] text-slate-500">{he ? 'מחיר כעת · USD' : 'Current · USD'}</span><span className="mt-1 block text-lg font-semibold tabular-nums tracking-tight text-slate-950"><bdi>{usd(m.currentPrice)}</bdi></span></span>
          <ChevronDown aria-hidden="true" className="holding-chevron h-4 w-4 text-slate-400" />
        </span>
      </span>
      <span id={`${id}-summary`} className="mt-4 grid grid-cols-[1.25fr_1fr_0.9fr] items-start gap-3 sm:gap-5">
        <span><span className="inline-flex items-center gap-1.5 text-xs font-medium leading-5 text-slate-600"><Target aria-hidden className="h-3.5 w-3.5 text-blue-500" />{he ? 'מכירה ליעד' : 'Sell for target'}</span><span className="mt-1 block text-lg font-semibold tabular-nums text-blue-700"><bdi>{usd(target.salePrice)}</bdi></span></span>
        <span><span className="block text-xs leading-5 text-slate-500">{gapLabel(target.difference)}</span><span className={`mt-1 block text-lg font-semibold tabular-nums ${tone(target.difference)}`}><bdi>{target.distancePercent !== undefined ? formatPercent(target.distancePercent, locale) : '—'}</bdi></span></span>
        <span><span className="block text-xs leading-5 text-slate-500">{he ? 'שווי ההחזקה' : 'Holding value'}</span><span className="mt-1 block text-sm font-medium tabular-nums text-slate-700"><bdi>{money(value)}</bdi></span></span>
      </span>
      <span className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span title={he ? 'רווח מצטבר בסימול בכל החשבונות, לפי הנתון האחרון בגרף ובדולרים' : 'Cumulative symbol profit across all accounts, in USD, at the latest chart sample'} className={`holding-status inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium tabular-nums ${holdingTone === 'profit' ? 'bg-emerald-50/90 text-emerald-700' : holdingTone === 'loss' ? 'bg-rose-50/90 text-rose-700' : 'bg-slate-50/90 text-slate-600'}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${holdingTone === 'profit' ? 'bg-emerald-500' : holdingTone === 'loss' ? 'bg-rose-500' : 'bg-slate-400'}`} />{holdingTone === 'profit' ? (he ? 'רווח מצטבר' : 'Cumulative profit') : holdingTone === 'loss' ? (he ? 'הפסד מצטבר' : 'Cumulative loss') : typeof cumulativeProfit === 'number' && Number.isFinite(cumulativeProfit) ? (he ? 'באיזון' : 'At break-even') : (he ? 'רווח לא זמין' : 'P/L unavailable')} <bdi>{typeof cumulativeProfit === 'number' ? usd(Math.abs(cumulativeProfit)) : '—'}</bdi></span>
        <span className="text-[10px] text-slate-500">{he ? 'יעד להיום · כולל מכירות קודמות' : 'Today’s target · includes previous sales'}</span>
      </span>
      </span>
    </button>
    <div id={`${id}-details`} aria-hidden={!expanded} ref={(element) => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
      <div className="min-h-0 overflow-hidden">
        <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 pt-1 sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">{he ? 'עלות הקנייה' : 'Purchase cost'}</dt><dd className="mt-1.5 text-sm font-medium tabular-nums text-slate-900"><bdi>{money(cost)}</bdi></dd></div>
            <div><dt className="text-xs text-slate-500">{he ? 'שינוי היום' : 'Today’s change'}</dt><dd className={`mt-1.5 text-sm font-medium tabular-nums ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi></dd></div>
            <div className="col-span-2 flex items-center justify-between gap-3 text-xs sm:col-span-1 sm:block"><dt className="text-slate-500">{he ? 'רווח / הפסד פתוח' : 'Unrealized P/L'}</dt><dd className={`font-medium tabular-nums sm:mt-1.5 sm:text-sm ${tone(pnl)}`}><bdi>{money(pnl)}</bdi><span className="ms-2 inline-block text-xs"><bdi>{percent(holdingReturn)}</bdi></span></dd></div>
          </dl>
          <div className="mt-5">
            <div data-chart-meta="" className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{he ? 'רווח מצטבר · USD' : 'Cumulative profit · USD'}</span>{historyRange ? <span className="text-[10px]"><bdi>{historyRange.start} – {historyRange.end}</bdi></span> : null}</div>
            <div data-chart-meta="" className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] text-slate-500">
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" />{he ? 'הפסד' : 'Loss'}</span><span className="inline-flex items-center gap-1"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-500" />{he ? 'מתחת ליעד' : 'Below target'}</span><span className="inline-flex items-center gap-1"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{he ? 'ביעד ומעלה' : 'At / above target'}</span></span>
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><i aria-hidden className="w-3 border-t border-dashed border-slate-400" />{he ? 'איזון (0)' : 'Break-even (0)'}</span><span className="inline-flex items-center gap-1"><i aria-hidden className="w-3 border-t border-dashed border-blue-400" />{he ? 'יעד רווח לפי יום' : 'Daily profit target'}</span></span>
            </div>
            <div data-chart-meta="" className="mb-2 flex items-center gap-3 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2 w-2 rounded-full border-2 border-emerald-600 bg-white" />{he ? 'קנייה' : 'Buy'}</span><span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2 w-2 rounded-sm border-2 border-rose-600 bg-white" />{he ? 'מכירה' : 'Sell'}</span></div>
            <div ref={chartSlotRef} className="holding-chart-slot relative h-48 w-full sm:h-52" role={historyRange && chartAvailable ? 'img' : undefined} aria-label={historyRange && chartAvailable ? (he ? `גרף רווח מצטבר של ${m.position.symbol} בדולר, מ־${historyRange.start} עד ${historyRange.end}. אדום בהפסד, כחול ברווח מתחת ליעד וירוק ביעד ומעלה. ${events.filter(event => event.type === 'BUY').length} עסקאות קנייה רשומות, ${events.filter(event => event.type === 'SELL').length} עסקאות מכירה רשומות.` : `${m.position.symbol} cumulative USD profit from ${historyRange.start} to ${historyRange.end}. Red in loss, blue in profit below target, green at or above target. ${events.filter(event => event.type === 'BUY').length} recorded buys, ${events.filter(event => event.type === 'SELL').length} recorded sells.`) : undefined}>
              {!chartAvailable ? <p className="flex h-full items-center text-xs text-slate-400">{historyRange ? (he ? 'אין מספיק היסטוריית עסקאות לחישוב הרווח' : 'Not enough transaction history to calculate profit') : (he ? 'אין מספיק נתוני מחיר להצגת מגמה' : 'Not enough price data to show a trend')}</p> : null}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-white/60 p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:ps-3">
            <p className="px-1 text-[11px] leading-5 text-slate-500 sm:px-0"><bdi>{Number.isFinite(m.position.quantity) ? m.position.quantity.toLocaleString(he ? 'he-IL' : 'en-US', { maximumFractionDigits: 6 }) : '—'}</bdi> {he ? 'מניות' : 'shares'} · {allocation !== undefined ? formatPercent(allocation, locale) : '—'} {he ? 'מהתיק' : 'of portfolio'} <span className="mx-1 text-slate-300">·</span> {he ? 'מאז' : 'Since'} {entryLabel}</p>
            <Link href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} aria-label={he ? `לפרטי ${m.position.symbol}` : `View ${m.position.symbol} details`} className="group inline-flex min-h-[44px] shrink-0 items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/80 px-3 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transition-none sm:justify-center">
              <span className="inline-flex items-center gap-2"><ChartNoAxesCombined aria-hidden className="h-4 w-4 text-blue-500" /><span>{he ? 'פרטי המניה' : 'Stock details'}</span><bdi className="rounded border border-blue-100 bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">{m.position.symbol}</bdi></span>
              <ArrowLeft aria-hidden className="h-4 w-4 text-blue-500 ltr:rotate-180" />
            </Link>
          </div>
          <details className="group text-[11px] leading-relaxed text-slate-500"><summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ChevronDown aria-hidden className="h-3 w-3 transition-transform group-open:rotate-180" />{he ? 'אופן החישוב' : 'Calculation details'}</summary><p className="max-w-2xl pb-2">{he ? 'מחיר המכירה נדרש לעמידה ביעד האישי להיום במכירת כל יתרת המניות של הסימול, כולל רווחים והפסדים ממכירות קודמות ובחשבונות אחרים. עמלות שכבר הוזנו נכללות; מס ועמלת מכירה עתידית אינם נכללים. המחיר מעוגל מעלה לסנט. מחירי המניה בדולרים. הגרף מציג רווח מצטבר בדולרים של הסימול בכל החשבונות: רווחים והפסדים שכבר מומשו יחד עם השווי שנותר פחות העלות שנותרה. הרווח הפתוח מתייחס רק להחזקה הזו, במטבע התיק. צבע הרקע והתג המכווץ מציינים את הרווח המצטבר בסימול לפי התאריך האחרון שבגרף. קו האיזון בגרף הוא 0 רווח. יעד הרווח המצטבר מחושב לכל יום לפי העסקאות עד סוף אותו יום ב־UTC ושיעור התשואה השנתי שמוגדר כעת. חלק שנמכר מפסיק לצבור יעד ביום מכירתו; הרווח או ההפסד שמומש נשאר בסכום המצטבר. גם צבע הקו וההצללה נקבעים מול אותו יעד יומי. שינויים אמיתיים עקב מחיר, ביצוע עסקאות או עמלות נשמרים ללא החלקה מלאכותית. הנקודות מציינות עסקאות שנרשמו בפועל. נתונים חסרים מוצגים במקף.' : 'The sale price meets today’s personal target when selling all remaining shares of this symbol, accounting for prior realized gains and losses across accounts. Recorded fees are included; tax and future sale fees are excluded. The price rounds upward to a cent. Share prices are USD. The chart shows cumulative USD profit across all accounts for the symbol: realized gains and losses plus remaining market value minus remaining cost. Unrealized P/L covers this holding only, in your portfolio currency. The collapsed background and badge reflect cumulative symbol profit at the latest chart date. The zero line is literal zero profit. Daily cumulative profit targets use trades through that UTC day and the current annual return goal. Sold portions stop accruing a target at sale; their realized gains and losses remain in cumulative profit. Line and fill colors use that daily goal. Actual changes from prices, executions and fees are preserved without artificial smoothing. Markers represent recorded transactions. Missing data is shown as a dash.'}</p></details>
        </div>
      </div>
    </div>
  </article>;
}
