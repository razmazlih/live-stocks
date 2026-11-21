'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { StockDetailsLink } from './stock-navigation';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useApp } from '@/lib/context';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';
import { getHoldingTarget } from '@/lib/holding-display';
import { buildHoldingChartReferences, buildHoldingPerformanceHistory } from '@/lib/holding-chart-history';
import { HoldingTrendBackground } from './holding-trend-background';
import { StockLogo } from '@/components/ui/stock-logo';
import type { SparklineEvent } from '@/components/charts/sparkline';
import type { HistoricalPoint, Position, PositionMetrics } from '@/types';

interface OverviewHoldingCardProps {
  metric: PositionMetrics;
  points: HistoricalPoint[];
  contextPoints?: HistoricalPoint[];
  expanded: boolean;
  onToggle: () => void;
  sourceUrl: string;
  portfolioValue: number;
  historyPositions: Position[];
}

export function OverviewHoldingCard({ metric: m, points, contextPoints, expanded, onToggle, sourceUrl, portfolioValue, historyPositions }: OverviewHoldingCardProps) {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const currency = settings.currency;
  const cardRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const chartSlotRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const openRequested = useRef(false);
  const toggleFromUser = () => {
    openRequested.current = !expanded;
    onToggle();
    if (expanded) toggleRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!expanded || !openRequested.current) return;
    openRequested.current = false;
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;
    let frame = 0;
    const started = performance.now();
    let lastFrame = started;
    const keepVisible = (time = performance.now()) => {
      const card = cardRef.current;
      if (cancelled || !card) return;
      const bounds = card.getBoundingClientRect();
      if (bounds.height <= 0) return;
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const navigation = document.querySelector('nav.glass-navigation')?.getBoundingClientRect();
      const bottom = Math.min(viewport, navigation && navigation.height > 0 && navigation.top > viewport / 2 ? navigation.top : viewport) - 12;
      const delta = bounds.top < 12 ? bounds.top - 12
        : bounds.bottom > bottom ? Math.min(bounds.bottom - bottom, bounds.top - 12) : 0;
      // Even a partially clipped card enters smoothly: never apply a large
      // correction on the first layout frame or after a slow frame.
      const travel = reducedMotion ? Math.abs(delta) : Math.max(1, Math.min(32, time - lastFrame) * 3.5);
      lastFrame = time;
      if (Math.abs(delta) > 0.5) {
        const step = Math.sign(delta) * Math.min(Math.abs(delta), travel);
        window.scrollTo({ top: Math.max(0, window.scrollY + step), behavior: reducedMotion ? 'auto' : 'instant' });
      }
    };
    // Follow the expanding geometry in the same frames as the reveal. There is
    // no second scrolling phase, and closing never changes the reading position.
    keepVisible(started);
    const followExpansion = (time: number) => {
      if (cancelled) return;
      keepVisible(time);
      if (time - started < 260) frame = window.requestAnimationFrame(followExpansion);
    };
    if (!reducedMotion) frame = window.requestAnimationFrame(followExpansion);
    const cancel = () => { cancelled = true; window.cancelAnimationFrame(frame); };
    const cancelWhenHidden = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', cancelWhenHidden);
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchmove', cancel, { passive: true });
    return () => {
      cancel();
      document.removeEventListener('visibilitychange', cancelWhenHidden);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
    };
  }, [expanded]);
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
  const contextPriceMode = profitPoints.filter(point => point.actual !== null && Number.isFinite(point.actual)).length < 2 && (contextPoints?.filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close >= 0).length ?? 0) >= 2;
  const displayPoints = contextPriceMode ? contextPoints! : points;
  const activeFromTimestamp = contextPriceMode ? Date.parse(m.position.activationStart ?? m.position.entryDate) : undefined;
  const priceReferences = useMemo(() => contextPriceMode ? buildHoldingChartReferences(historyPositions, [...displayPoints, ...events.map(event => ({ timestamp: event.timestamp, close: event.price }))], settings.annualGrowthRate) : undefined, [contextPriceMode, historyPositions, displayPoints, events, settings.annualGrowthRate]);
  const chartAvailable = contextPriceMode || profitPoints.filter(point => point.actual !== null && Number.isFinite(point.actual)).length > 1;
  const historyRange = useMemo(() => {
    const timestamps = [...new Set(displayPoints.filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close >= 0).map((point) => point.timestamp))].sort((a, b) => a - b);
    if (timestamps.length < 2) return null;
    const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return { start: date(Math.min(timestamps[0], ...events.map(event => event.timestamp))), end: date(Math.max(timestamps[timestamps.length - 1], ...events.map(event => event.timestamp))) };
  }, [displayPoints, events, he]);

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
  return <article ref={cardRef} data-trend={holdingTone} className={`holding-card overview-holding-card ${expanded ? 'holding-card-open overview-holding-card-open' : ''}`} onKeyDown={(event) => {
    if (expanded && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); toggleFromUser(); }
  }}>
    <div ref={graphRef} aria-hidden="true" className="holding-trend-layer"><HoldingTrendBackground points={displayPoints} tone={holdingTone} expanded={expanded} baseline={m.position.entryPrice} targetPrice={target.salePrice} events={events} locale={locale} profitPoints={contextPriceMode ? undefined : profitPoints} references={priceReferences} activeFromTimestamp={activeFromTimestamp} /></div>
    <button ref={toggleRef} id={id} type="button" aria-expanded={expanded} aria-controls={`${id}-details`} aria-describedby={`${id}-summary`} aria-label={he ? `${expanded ? 'סגירת' : 'פתיחת'} פרטי ${m.position.symbol}` : `${expanded ? 'Collapse' : 'Expand'} ${m.position.symbol} details`} onClick={toggleFromUser} className="holding-toggle block w-full rounded-2xl px-4 pb-3 pt-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5">
      <span id={`${id}-summary`} className="holding-summary-content">
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <StockLogo symbol={m.position.symbol} display={m.position.display} imageUrl={m.position.imageUrl} />
            <span className="min-w-0"><span className="block truncate text-base font-semibold tracking-tight text-slate-950" dir="ltr">{m.position.symbol}</span><span className="holding-company mt-0.5 block truncate text-xs text-slate-500">{m.position.display}</span></span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-end"><span className="block text-xs text-slate-500">{he ? 'שווי ההחזקה' : 'Holding value'}</span><bdi className="block text-lg font-semibold tabular-nums tracking-tight text-slate-950">{money(value)}</bdi></span>
            <ChevronDown aria-hidden="true" className="holding-chevron h-4 w-4 text-slate-400" />
          </span>
        </span>
        <span className="holding-summary-grid mt-3 grid grid-cols-2 gap-3">
          <span><span className="block text-xs text-slate-500">{he ? 'שינוי מחיר יומי' : 'Daily price change'}</span><span className={`mt-1 block text-base font-semibold tabular-nums ${tone(m.dailyChangePercent ?? 0)}`}><bdi>{percent(m.dailyChangePercent)}</bdi></span></span>
          <span><span className="block text-xs text-slate-500">{he ? 'תשואה מהקנייה' : 'Return since purchase'}</span><span className={`mt-1 block text-base font-semibold tabular-nums ${tone(holdingReturn ?? 0)}`}><bdi>{percent(holdingReturn)}</bdi></span></span>
        </span>
      </span>
    </button>
    <div id={`${id}-details`} aria-hidden={!expanded} ref={(element) => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
      <div className="min-h-0 cursor-pointer overflow-hidden" onClick={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!expanded || target?.closest('a, button, input, select, textarea, [role="button"]') || window.getSelection()?.isCollapsed === false) return;
        toggleFromUser();
      }}>
        <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 pt-1 sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">{he ? 'עלות הקנייה' : 'Purchase cost'}</dt><dd className="mt-1.5 text-sm font-medium tabular-nums text-slate-900"><bdi>{money(cost)}</bdi></dd></div>
            <div><dt className="text-xs text-slate-500">{he ? 'מחיר כעת · USD' : 'Current price · USD'}</dt><dd className="mt-1.5 text-sm font-medium tabular-nums text-slate-900"><bdi>{usd(m.currentPrice)}</bdi></dd></div>
            <div><dt className="text-xs text-slate-500">{he ? 'מכירה ליעד · USD' : 'Sell for target · USD'}</dt><dd className="mt-1.5 text-sm font-medium tabular-nums text-blue-700"><bdi>{usd(target.salePrice)}</bdi></dd></div>
            <div><dt className="text-xs text-slate-500">{gapLabel(target.difference)}</dt><dd className={`mt-1.5 text-sm font-medium tabular-nums ${tone(target.difference)}`}><bdi>{target.distancePercent !== undefined ? formatPercent(target.distancePercent, locale) : '—'}</bdi></dd></div>
            <div className="col-span-2 flex items-center justify-between gap-3 text-xs sm:col-span-1 sm:block"><dt className="text-slate-500">{he ? 'רווח / הפסד פתוח' : 'Unrealized P/L'}</dt><dd className={`font-medium tabular-nums sm:mt-1.5 sm:text-sm ${tone(pnl)}`}><bdi>{money(pnl)}</bdi></dd></div>
            <div><dt className="text-xs text-slate-500">{he ? 'רווח מצטבר בכל החשבונות · USD' : 'Cumulative P/L across accounts · USD'}</dt><dd className={`mt-1.5 text-sm font-medium tabular-nums ${tone(cumulativeProfit ?? 0)}`}><bdi>{usd(cumulativeProfit ?? undefined)}</bdi></dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">{he ? 'מחיר היעד להיום כולל מכירות קודמות.' : 'Today’s target includes previous sales.'}</p>
          <div className="holding-chart-detail mt-5">
            <div data-chart-meta="" className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500"><span>{contextPriceMode ? he ? 'מחיר המניה · USD' : 'Share price · USD' : he ? 'רווח מצטבר · USD' : 'Cumulative profit · USD'}</span>{historyRange ? <span className="text-[10px]"><bdi>{historyRange.start} – {historyRange.end}</bdi></span> : null}</div>
            <div data-chart-meta="" className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] text-slate-500">
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" />{contextPriceMode ? he ? 'מתחת לעלות' : 'Below cost' : he ? 'הפסד' : 'Loss'}</span><span className="inline-flex items-center gap-1"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-500" />{he ? 'מתחת ליעד' : 'Below target'}</span><span className="inline-flex items-center gap-1"><i aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{he ? 'ביעד ומעלה' : 'At / above target'}</span></span>
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><i aria-hidden className="w-3 border-t border-dashed border-slate-400" />{contextPriceMode ? he ? 'עלות המניות' : 'Purchase cost' : he ? 'איזון (0)' : 'Break-even (0)'}</span><span className="inline-flex items-center gap-1"><i aria-hidden className="w-3 border-t border-dashed border-blue-400" />{contextPriceMode ? he ? 'יעד מחיר' : 'Price target' : he ? 'יעד רווח לפי יום' : 'Daily profit target'}</span></span>
            </div>
            <div data-chart-meta="" className="mb-2 flex items-center gap-3 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2 w-2 rounded-full border-2 border-emerald-600 bg-white" />{he ? 'קנייה' : 'Buy'}</span><span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2 w-2 rounded-sm border-2 border-rose-600 bg-white" />{he ? 'מכירה' : 'Sell'}</span></div>
            <div ref={chartSlotRef} className="holding-chart-slot relative h-48 w-full sm:h-52" role={historyRange && chartAvailable ? 'img' : undefined} aria-label={historyRange && chartAvailable ? contextPriceMode ? (he ? `גרף מחיר ${m.position.symbol}, מ־${historyRange.start} עד ${historyRange.end}. לפני הכניסה אפור; צבעי הביצועים מתחילים בכניסה.` : `${m.position.symbol} price chart, ${historyRange.start} to ${historyRange.end}. Gray before entry; performance colors begin at entry.`) : (he ? `גרף רווח מצטבר של ${m.position.symbol} בדולר, מ־${historyRange.start} עד ${historyRange.end}. אדום בהפסד, כחול ברווח מתחת ליעד וירוק ביעד ומעלה. ${events.filter(event => event.type === 'BUY').length} עסקאות קנייה רשומות, ${events.filter(event => event.type === 'SELL').length} עסקאות מכירה רשומות.` : `${m.position.symbol} cumulative USD profit from ${historyRange.start} to ${historyRange.end}. Red in loss, blue in profit below target, green at or above target. ${events.filter(event => event.type === 'BUY').length} recorded buys, ${events.filter(event => event.type === 'SELL').length} recorded sells.`) : undefined}>
              {!chartAvailable ? <p className="flex h-full items-center text-xs text-slate-400">{historyRange ? (he ? 'אין מספיק היסטוריית עסקאות לחישוב הרווח' : 'Not enough transaction history to calculate profit') : (he ? 'אין מספיק נתוני מחיר להצגת מגמה' : 'Not enough price data to show a trend')}</p> : null}
            </div>
          </div>
          {contextPriceMode ? <p className="mt-1 text-[10px] text-slate-400">{he ? 'שבוע לפני הכניסה באפור · הצבעים מתחילים בכניסה להחזקה הנוכחית' : 'One week before entry in gray · colors begin at the current holding’s entry'}</p> : null}
          <div className="holding-detail-footer mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-slate-500"><bdi>{Number.isFinite(m.position.quantity) ? m.position.quantity.toLocaleString(he ? 'he-IL' : 'en-US', { maximumFractionDigits: 6 }) : '—'}</bdi> {he ? 'מניות' : 'shares'} · {allocation !== undefined ? formatPercent(allocation, locale) : '—'} {he ? 'מהתיק' : 'of portfolio'} <span className="mx-1 text-slate-300">·</span> {he ? 'מאז' : 'Since'} {entryLabel}</p>
            <button type="button" onClick={toggleFromUser} className="holding-close-action inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{he ? 'סגירת הכרטיס' : 'Close card'}<ChevronDown aria-hidden className="h-3.5 w-3.5 rotate-180" /></button>
          </div>

        </div>
      </div>
    </div>
    <div className="relative flex justify-end border-t border-slate-100 px-2 sm:px-3">
      <StockDetailsLink preview={{ symbol: m.position.symbol, display: m.position.display, imageUrl: m.position.imageUrl }} href={buildStockHref(m.position.symbol, sourceUrl || '/')} onClick={() => rememberReturnContext(id)} aria-label={he ? `לפרטי ${m.position.symbol}` : `View ${m.position.symbol} details`} className="stock-details-action inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        {he ? 'פרטי המניה' : 'Stock details'}<ArrowLeft aria-hidden className="h-3.5 w-3.5 ltr:rotate-180" />
      </StockDetailsLink>
    </div>
  </article>;
}
