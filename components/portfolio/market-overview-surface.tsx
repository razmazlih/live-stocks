'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';

import Link from 'next/link';
import { Activity, ArrowUpRight, ChartNoAxesColumnIncreasing, ChevronDown, Crosshair, Layers3, Wallet } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { AnnualTargetEditor, type TargetControls } from './annual-target-editor';
import { useStockInspector } from './stock-inspector';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatCurrency, resolveIntlLocale } from '@/lib/display/formatting';
import type { MarketOverview } from '@/lib/market-overview';
import { getPerformanceTotals, type PerformanceOptions } from '@/lib/performance-display';
import { reconciliationQuality } from '@/lib/reconciliation-quality';
import type { Locale, PortfolioSummary, Position, Settings } from '@/types';
import styles from './market-overview-surface.module.css';

type Money = (amount: number | null | undefined, signed?: boolean) => string;
interface Props {
  marketOverview?: MarketOverview | null;
  summary: PortfolioSummary | null;
  positions: Position[];
  currency: Settings['currency'];
  locale: Locale;
  options: Required<PerformanceOptions>;
  sourceName: (id: string, locale: Locale) => string;
  targetControls?: TargetControls;
}

const valid = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
const tone = (value: number | null | undefined) => !valid(value) || Math.abs(value) < 0.005 ? undefined : value > 0 ? 'gain' : 'loss';

function tradingDate(date: string | null, locale: Locale) {
  if (!date) return '';
  const time = Date.parse(date + 'T12:00:00Z');
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(time);
}

function quoteTime(timestamp: number, locale: Locale) {
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(timestamp);
}

function More({ label, title, description, locale, children }: { label: string; title: string; description: string; locale: Locale; children: ReactNode }) {
  return <Dialog>
    <DialogTrigger asChild><button type="button" className={styles.more}>{label}<ArrowUpRight aria-hidden="true" /></button></DialogTrigger>
    <DialogContent dir={locale === 'he' ? 'rtl' : 'ltr'} lang={locale} closeLabel={locale === 'he' ? 'סגירה' : 'Close'} className="sm:max-w-xl">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {children}
    </DialogContent>
  </Dialog>;
}

type AmountRow = { id: string; name: string; amount: number | null };

function StockAction({ symbol, children, nested = false }: { symbol: string; children: ReactNode; nested?: boolean }) {
  const inspect = useStockInspector();
  if (!inspect) return <>{children}</>;
  const action = <button type="button" className={styles.stockAction} onClick={event => {
    const trigger = event.currentTarget;
    if (nested) requestAnimationFrame(() => inspect({ symbol }, trigger));
    else inspect({ symbol }, trigger);
  }}>{children}</button>;
  return nested ? <DialogClose asChild>{action}</DialogClose> : action;
}

function AmountRows({ rows, locale, currency, stocks, nested }: { rows: AmountRow[]; locale: Locale; stocks?: boolean; nested?: boolean; currency: Settings['currency'] }) {
  const max = Math.max(0, ...rows.map(row => Math.abs(row.amount ?? 0)));
  return <ul className={styles.rows}>{rows.map(row => <li key={row.id}>
    <bdi className={styles.rowName}>{stocks ? <StockAction symbol={row.id} nested={nested}>{row.name}</StockAction> : row.name}</bdi>
    <div aria-hidden="true" className={styles.diverging} dir="ltr"><i data-tone={tone(row.amount)} style={{ width: max ? Math.abs(row.amount ?? 0) / max * 50 + '%' : 0 }} /></div>
    <AnimatedNumber value={row.amount} locale={locale} currency={currency} signed identity={row.id} className={styles.rowAmount} data-tone={tone(row.amount)} />
  </li>)}</ul>;
}

function Daily({ market, currency, locale, sourceName, leading, compact }: {
  market: MarketOverview; currency: Settings['currency']; locale: Locale; sourceName: Props['sourceName']; leading: boolean; compact: boolean;
}) {
  const he = locale === 'he';
  const key = currency === 'USD' ? 'amountUsd' : 'amountIls';
  const daily = market.daily;
  const [detailOpen, setDetailOpen] = useState(false);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const amount = daily[key];
  const session = tradingDate(market.sessionDate, locale);
  const partial = daily.coveredPositions < daily.totalPositions;
  const dayLabel = tone(amount) === 'gain' ? (he ? 'הרווח היום' : 'Your gain today')
    : tone(amount) === 'loss' ? (he ? 'ההפסד היום' : 'Your loss today')
    : (he ? 'השינוי בתיק היום' : 'Your change today');
  const title = partial ? (he ? 'שינוי בהחזקות הזמינות' : 'Change in covered holdings')
    : daily.previousSession ? (he ? 'תוצאת המסחר האחרונה' : 'Last trading day result')
    : leading ? dayLabel : (he ? 'תוצאת יום המסחר' : 'Trading day result');
  const symbols = daily.contributors.map(row => ({ id: row.symbol, name: row.symbol, amount: row[key] }));
  const sources = daily.sourceContributors.map(row => ({ id: row.sourceId, name: sourceName(row.sourceId, locale), amount: row[key] }));
  const hasBreakdown = symbols.length > 0 || sources.length > 0 || daily.missingSymbols.length > 0;
  const fxDate = tradingDate(daily.fxDate, locale);
  const description = [
    session,
    he ? 'שינוי במחירי המניות לפני עמלות ומס' : 'Equity movement before fees and tax',
    currency === 'ILS' && fxDate ? (he ? `המרה לשקלים לפי שער ${fxDate}` : `USD converted at the ${fxDate} reference rate`) : '',
  ].filter(Boolean).join(' · ');
  const dailyAmount = <AnimatedNumber value={amount} locale={locale} currency={currency} signed identity={market.sessionDate} data-tone={tone(amount)} className={leading ? styles.bigNumber : styles.subNumber} />;
  return <div className={styles.pane} data-part="daily" data-compact={compact || undefined}>
    <h2 className={styles.eyebrow}><Activity aria-hidden="true" />{title}</h2>
    <div className={styles.metricLine}>{hasBreakdown ? <button type="button" className={styles.metricAction} aria-label={title} aria-haspopup="dialog" onClick={event => {
        detailTrigger.current = event.currentTarget; setDetailOpen(true);
      }}>{dailyAmount}</button> : dailyAmount}
      {valid(daily.percent) && <AnimatedNumber kind="percent" value={daily.percent} locale={locale} signed identity={market.sessionDate} className={styles.percent} data-tone={tone(daily.percent)} />}
    </div>
    <p className={styles.note}>{session}{valid(market.asOf) && <> · {quoteTime(market.asOf, locale)}</>}
      {daily.delayed && <> · {he ? 'מחירים בהשהיה' : 'Delayed prices'}</>}
      {daily.provisional && <> · {he ? 'אומדן לפי תאריכי העסקאות' : 'Estimated from trade dates'}</>}
    </p>
    {daily.previousSession && <p className={styles.note}>{he ? 'טרם התקבלו מחירים מהמסחר של היום.' : 'Prices for today’s session are unavailable.'}</p>}
    {partial && <p className={styles.note}>{he ? `מבוסס על ${daily.coveredPositions} מתוך ${daily.totalPositions} החזקות` : `Covers ${daily.coveredPositions} of ${daily.totalPositions} positions`}</p>}
    {!valid(amount) && <p className={styles.note}>{he ? 'חסרים נתונים לחישוב השינוי בתיק.' : 'Insufficient data for a portfolio total.'}</p>}
    {leading && symbols.length > 0 && <div className={styles.drivers}><h3>{he ? 'התרומות הגדולות לשינוי' : 'Largest contributions'}</h3><AmountRows stocks rows={symbols.slice(0, 3)} locale={locale} currency={currency} /></div>}
    {hasBreakdown && <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
      <DialogTrigger asChild><button type="button" className={styles.more} onClick={event => { detailTrigger.current = event.currentTarget; }}>
        {he ? 'לפירוט השינוי' : 'Explore daily change'}<ArrowUpRight aria-hidden="true" /></button></DialogTrigger>
      <DialogContent dir={he ? 'rtl' : 'ltr'} lang={locale} closeLabel={he ? 'סגירה' : 'Close'} className="sm:max-w-xl"
        onCloseAutoFocus={event => { if (detailTrigger.current?.isConnected) { event.preventDefault(); detailTrigger.current.focus({ preventScroll: true }); } }}>
        <DialogHeader><DialogTitle>{he ? 'פירוט השינוי היומי' : 'Daily change breakdown'}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className={styles.detailGroups}>
        {symbols.length > 0 && <section><h3>{he ? 'לפי מניה' : 'By stock'}</h3><AmountRows stocks nested rows={symbols} locale={locale} currency={currency} /></section>}
        {sources.length > 0 && <section><h3>{he ? 'לפי מקור השקעה' : 'By investment source'}</h3><AmountRows rows={sources} locale={locale} currency={currency} /></section>}
        {daily.missingSources.length > 0 && <p className={styles.note}>{he ? 'מקורות עם נתונים חסרים' : 'Sources with missing data'} · {daily.missingSources.map(id => sourceName(id, locale)).join(' · ')}</p>}
        {daily.missingSymbols.length > 0 && <p className={styles.note}>{he ? 'נתונים חסרים עבור' : 'Missing data for'} <bdi>{daily.missingSymbols.join(', ')}</bdi></p>}
      </div>
      </DialogContent>
    </Dialog>}
  </div>;
}

function Extended({ market, locale, positions }: { market: MarketOverview; locale: Locale; positions: Position[] }) {
  const he = locale === 'he';
  const top = market.extended[0];
  const coverage = he ? `ציטוטים זמינים ל־${market.extendedCovered} מתוך ${market.extendedEligible} מניות` : `Quotes available for ${market.extendedCovered} of ${market.extendedEligible} stocks`;
  const name = (symbol: string) => positions.find(position => position.symbol.toUpperCase() === symbol)?.display;
  return <div className={styles.pane} data-part="mover">
    <h2 className={styles.eyebrow}><ChartNoAxesColumnIncreasing aria-hidden="true" />{he ? 'התנועה הבולטת מאז הסגירה' : 'Biggest move since close'}</h2>
    {top ? <>
      <div className={styles.moverIdentity}><bdi dir="ltr"><StockAction symbol={top.symbol}>{top.symbol}</StockAction></bdi>{name(top.symbol) && <span>{name(top.symbol)}</span>}</div>
      <div className={styles.metricLine}><AnimatedNumber value={top.percent} locale={locale} kind="percent" signed identity={top.symbol} className={styles.subNumber} data-tone={tone(top.percent)} /></div>
      <p className={styles.note}><AnimatedNumber value={top.price} locale={locale} identity={top.symbol} /> · {he ? 'עדכון מחיר' : 'Price update'} {quoteTime(top.asOf, locale)}{top.delayed && <> · {he ? 'בהשהיה' : 'Delayed'}</>}</p>
      <More locale={locale} title={he ? 'תנועות מאז הסגירה' : 'Moves since the close'} label={he ? 'לדירוג המניות' : 'View ranked moves'} description={coverage}>
        <ol className={styles.movers}>{market.extended.map(row => <li key={row.symbol}><div><strong><bdi><StockAction symbol={row.symbol} nested>{row.symbol}</StockAction></bdi></strong><small>{he ? 'עדכון מחיר' : 'Price update'} {quoteTime(row.asOf, locale)}{row.delayed && <> · {he ? 'בהשהיה' : 'Delayed'}</>}</small></div>
          <div><AnimatedNumber value={row.percent} locale={locale} kind="percent" signed identity={row.symbol} data-tone={tone(row.percent)} /><small><AnimatedNumber value={row.price} locale={locale} identity={row.symbol} /></small></div></li>)}</ol>
      </More>
    </> : <p className={styles.unavailable}>{market.extendedCovered ? (he ? 'בציטוטים הזמינים לא נמדד שינוי מהסגירה.' : 'Available quotes show no change since close.') : (he ? 'טרם התקבל ציטוט עדכני להחזקות.' : 'A fresh quote for your holdings is unavailable.')}</p>}
    <p className={styles.note}>{coverage}</p>
  </div>;
}

export function MarketOverviewSurface({ marketOverview: market, summary, positions, currency, locale, options, sourceName, targetControls }: Props) {
  const he = locale === 'he';
  const regular = market?.phase === 'regular';
  const extended = market?.phase === 'pre' || market?.phase === 'post' || market?.phase === 'overnight';
  const useClose = Boolean(market && (extended || market.phase === 'closed' || market.daily.previousSession));
  const targetSummary = useClose ? market?.closingSummary : summary;
  const totals = targetSummary ? getPerformanceTotals(targetSummary, currency, options) : null;
  const valuation = useClose && market?.closingSummary ? market.closingSummary : summary;
  const value = valuation ? getPerformanceTotals(valuation, currency, options).value : null;
  const latestValue = !market || market.phase === 'unknown' || market.daily.previousSession || (useClose && !market.closingSummary);
  const valueLabel = latestValue ? (he ? 'שווי ההחזקות האחרון הזמין' : 'Latest available holdings value') : (he ? 'שווי ההחזקות' : 'Holdings value');
  const quality = reconciliationQuality(positions);
  const complete = quality.completeTransactionHistory && quality.completeCommissionHistory;
  const actual = complete && valid(totals?.actual) ? totals.actual : null;
  const target = complete && valid(totals?.target) ? totals.target : null;
  const gap = valid(actual) && valid(target) ? Number((actual - target).toFixed(2)) : null;
  const money: Money = (amount, signed = false) => {
    if (!valid(amount)) return '—';
    const rounded = Number(amount.toFixed(2)) || 0;
    return (signed && rounded > 0 ? '+' : '') + formatCurrency(rounded, currency, locale);
  };
  const params = new URLSearchParams();
  if (!options.includeFees) params.set('includeFees', '0');
  if (!options.includeTaxes) params.set('includeTaxes', '0');
  const performanceHref = params.size ? '/portfolio?' + params : '/portfolio';
  params.set('view', 'targets');
  const targetHref = '/portfolio?' + params;
  const gapLabel = gap === null ? (he ? 'פער מהיעד המצטבר' : 'Cumulative target gap') : gap < 0 ? (he ? 'מתחת ליעד המצטבר' : 'Below cumulative target') : gap > 0 ? (he ? 'מעל היעד המצטבר' : 'Above cumulative target') : (he ? 'בדיוק ביעד המצטבר' : 'On cumulative target');
  const profitLabel = valid(actual) && actual < 0 ? (he ? 'הפסד מצטבר' : 'Cumulative loss') : (he ? 'רווח מצטבר' : 'Cumulative profit');
  const basis = options.includeFees ? (he ? 'לאחר עמלות' : 'After fees') : (he ? 'לפני עמלות' : 'Before fees');
  const tax = options.includeTaxes ? (he ? 'לאחר אומדן מס' : 'after estimated tax') : (he ? 'לפני מס' : 'before tax');
  const closeFxDate = useClose && currency === 'ILS' ? tradingDate(market?.closingFxDate ?? null, locale) : '';
  const closeDate = useClose && market?.closeDate ? tradingDate(market.closeDate, locale) : '';
  const missing = !quality.completeTransactionHistory && !quality.completeCommissionHistory ? (he ? 'חסרים פרטי עסקאות ועמלות לחישוב' : 'Transaction and fee details are missing')
    : !quality.completeTransactionHistory ? (he ? 'חסרות עסקאות לחישוב' : 'Transactions are missing')
    : !quality.completeCommissionHistory ? (he ? 'חסרים סכומי עמלות לחישוב' : 'Fee amounts are missing')
    : (he ? 'הנתונים לחישוב עדיין אינם זמינים' : 'Figures are currently unavailable');
  const scaleMin = Math.min(0, actual ?? 0, target ?? 0);
  const scaleMax = Math.max(0, actual ?? 0, target ?? 0);
  const axis = (n: number) => scaleMin === scaleMax ? 50 : (n - scaleMin) / (scaleMax - scaleMin) * 100;
  const targetAction = { 'aria-label': gapLabel + ' · ' + money(Math.abs(gap ?? 0)), 'data-tone': tone(gap),
    className: `${styles.targetLink} ${regular ? styles.subNumber : styles.bigNumber}` };
  const targetContents = <><AnimatedNumber value={gap} locale={locale} currency={currency} absolute identity={market?.closeDate} /><ArrowUpRight aria-hidden="true" /></>;
  const targetPane = <div key="target" className={styles.pane} data-part="target">
    <h2 className={styles.eyebrow}><Crosshair aria-hidden="true" />{gapLabel}</h2>
    <div className={styles.metricLine}>{gap === null ? <strong className={styles.subNumber}>—</strong>
      : targetControls && actual !== null ? <AnnualTargetEditor {...targetControls} actual={actual} locale={locale} currency={currency} options={options} href={targetHref}>
        <button type="button" {...targetAction}>{targetContents}</button></AnnualTargetEditor>
      : <Link href={targetHref} {...targetAction}>{targetContents}</Link>}</div>
    {closeDate && <p className={styles.note}>{market?.closeConfirmed ? (he ? 'בסגירת' : 'At close') : (he ? 'סגירה ממתינה לאימות ·' : 'Close awaiting confirmation ·')} {closeDate}</p>}
    {useClose && market?.closingProvisional && <p className={styles.note}>{he ? 'אומדן לפי תאריכי עסקאות, שעת הביצוע אינה ידועה.' : 'Estimated from trade dates. Execution times are unknown.'}</p>}
    {gap !== null && valid(actual) && valid(target) ? <>
      <div className={styles.comparison} dir="ltr" aria-hidden="true">
        <i className={styles.actualBar} data-tone={tone(actual)} style={{ left: Math.min(axis(0), axis(actual)) + '%', width: Math.abs(axis(actual) - axis(0)) + '%' }} />
        <i className={styles.targetTick} style={{ left: axis(target) + '%' }} />
      </div>
      <dl className={styles.pair}><div><dt><i className={styles.legendDot} data-tone={tone(actual)} />{profitLabel}</dt><dd><AnimatedNumber value={actual} locale={locale} currency={currency} /></dd></div>
        <div><dt><i className={styles.legendTick} />{he ? 'היעד המצטבר' : 'Cumulative target'}</dt><dd><AnimatedNumber value={target} locale={locale} currency={currency} /></dd></div></dl>
    </> : <div className={styles.unavailable}><p>{missing}</p><Link className={styles.more} href={performanceHref}>{he ? 'לפירוט הביצועים' : 'Performance details'}<ArrowUpRight aria-hidden="true" /></Link></div>}
  </div>;
  const dayPane = market && market.phase !== 'unknown' ? <Daily key="day" market={market} currency={currency} locale={locale} leading={regular} compact={extended} sourceName={sourceName} /> : null;
  const moverPane = extended && market ? <Extended key="mover" market={market} locale={locale} positions={positions} /> : null;
  return <section className={styles.surface} dir={he ? 'rtl' : 'ltr'} aria-label={he ? 'תמונת מצב התיק' : 'Portfolio summary'}>
    <div className={styles.balance}><Wallet aria-hidden="true" /><span>{valueLabel}</span><AnimatedNumber value={value} locale={locale} currency={currency} /></div>
    <div className={styles.workspace} data-solo={!dayPane || undefined} data-extended={extended || undefined}>
      {regular ? [dayPane, targetPane] : [targetPane, dayPane, moverPane]}
    </div>
    <details className={styles.basis}><summary><span><Layers3 aria-hidden="true" />{he ? 'מצטבר' : 'Cumulative'} · {basis} · {tax}</span><span>{he ? 'מה כלול?' : 'What’s included?'}<ChevronDown aria-hidden="true" /></span></summary>
      <div>{he ? 'שווי ההחזקות הוא שווי המניות הפתוחות במטבע התיק. הרווח המצטבר כולל עסקאות שמומשו ושינוי בשווי ההחזקות. היעד מחושב לפי התשואה האישית ומועד כל עסקה. המס הוא אומדן על מימושים.' : 'Holdings value covers open stocks in your portfolio currency. Cumulative profit includes realized trades and open holdings. The target uses your personal return goal and transaction dates. Tax is estimated on realized gains.'}{closeFxDate && <p>{he ? 'הסכומים המצטברים בשקלים חושבו לפי שער הייחוס של' : 'Closing totals in ILS use the reference FX rate for'} {closeFxDate}.</p>}</div>
    </details>
  </section>;
}
