'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { buildClosePairReviewPrompt } from '@/lib/close-pair-review-prompt';
import { buildClosePairProposals } from '@/lib/close-pair-proposals';
import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { buildStockHref } from '@/lib/navigation-context';
import type { ClosePairProposal } from '@/lib/close-pair-proposals';
import { ClosePairChart } from './close-pair-chart';
import type { HistoricalPoint, PositionMetrics } from '@/types';

function pairKey(proposal: ClosePairProposal) {
  return JSON.stringify([proposal.winner.position.location, proposal.winner.position.id, proposal.winner.position.symbol, proposal.loser.position.id, proposal.loser.position.symbol]);
}

export function ClosePairProposals({ metrics, sparklineData = {} }: { metrics: PositionMetrics[]; sparklineData?: Record<string, HistoricalPoint[]> }) {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(() => new Set());
  const panelId = useId();
  const proposals = useMemo(() => buildClosePairProposals(metrics, 3, Date.now(), settings.annualGrowthRate), [metrics, settings.annualGrowthRate]);
  const [copying, setCopying] = useState(false);
  const copyForAi = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(buildClosePairReviewPrompt(proposals, locale));
      toast.success(he ? 'הפרומפט הועתק — אפשר להדביק ב־AI' : 'Prompt copied — paste it into your AI');
    } catch {
      toast.error(he ? 'ההעתקה נכשלה. אפשר לנסות שוב.' : 'Copy failed. Please try again.');
    } finally {
      setCopying(false);
    }
  };
  const money = (value: number) => formatCurrency(value, 'USD', locale);
  if (!proposals.length) return null;

  const anyExpanded = proposals.some(proposal => expandedPairs.has(pairKey(proposal)));

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={he ? 'הצעות לסגירת שתי פוזיציות' : 'Two-position exit ideas'}>
    <div className="flex items-center gap-3 px-4 py-5 sm:px-5">
      <span aria-hidden className="holding-monogram flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50/60 text-blue-600"><ArrowLeftRight className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1"><h2 className="text-base font-semibold tracking-tight text-slate-950">{he ? 'הצעות לסגירת שתי פוזיציות' : 'Two-position exit ideas'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{he ? 'זוגות שמכסים גם את יעד התשואה האישי' : 'Pairs that also cover your personal return target'}</p></div>
      <span className="hidden rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex">{he ? proposals.length === 1 ? 'הצעה אחת' : `${proposals.length} הצעות` : `${proposals.length} ${proposals.length === 1 ? 'idea' : 'ideas'}`}</span>
    </div>

    <div data-testid="close-pair-preview" className={`grid items-start gap-3 border-y border-slate-100 bg-slate-50/60 p-3 sm:gap-4 sm:p-4 ${proposals.length === 2 ? 'md:grid-cols-2' : proposals.length > 2 ? 'xl:grid-cols-3' : ''}`}>
      {proposals.map((proposal, index) => {
        const key = pairKey(proposal);
        const expanded = expandedPairs.has(key);
        return <article key={key} className={`holding-card min-w-0 overflow-hidden ${expanded ? 'holding-card-open' : ''}`}>
          <div className="relative isolate">
          <div className="px-4 pb-4 pt-4 sm:px-5">
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[11px] text-slate-500">{proposal.winner.position.location === 'bank_two' ? (he ? 'בנק 2' : 'Bank 2') : (he ? 'בנק 1' : 'Bank 1')}</span>
            </span>
            <span className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5" dir="ltr"><span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-base font-semibold tracking-tight text-slate-950">{proposal.winner.position.symbol}</span><span className="text-xs text-slate-400"> + </span><span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-base font-semibold tracking-tight text-slate-950">{proposal.loser.position.symbol}</span></span>
                <span className="mt-2 block text-[11px] leading-4 text-slate-500">{he ? 'סגירה מלאה של שתי ההחזקות' : 'Close both holdings in full'}</span>
              </span>
              <span className="min-w-0 text-end"><span className="block text-[11px] text-slate-500">{he ? 'מעל היעד האישי · USD' : 'Above personal target · USD'}</span><span className="mt-1 block text-[28px] font-semibold leading-tight tracking-tight text-emerald-700"><bdi>+{money(proposal.surplusUsd)}</bdi></span></span>
            </span>
          </div>
          <dl className="mx-4 mb-3 grid grid-cols-2 gap-2 text-xs sm:mx-5">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"><dt className="text-[11px] text-slate-600">{he ? 'רווח משולב בסגירה' : 'Combined exit profit'}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900"><bdi>{money(proposal.netProfitUsd)}</bdi></dd></div>
            <div className="rounded-xl border border-blue-100/60 bg-blue-50/40 px-3 py-2.5 text-end"><dt className="text-[11px] text-slate-600">{he ? 'יעד הרווח להיום' : 'Profit target to date'}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-blue-700"><bdi>{money(proposal.targetProfitUsd)}</bdi></dd></div>
          </dl>
          <p className="mx-4 mb-4 text-[10px] leading-4 text-slate-500 sm:mx-5">{he ? 'מעל היעד = רווח בסגירה פחות יעד הרווח להיום' : 'Above target = exit profit minus profit target to date'}</p>
        <ClosePairChart proposal={proposal} sparklineData={sparklineData} locale={locale} />
          <div className="mx-4 flex min-h-11 items-center justify-between gap-3 border-t border-slate-100 pb-3 pt-2 sm:mx-5">
            <span className="text-[10px] text-slate-500">{he ? 'לפני מס ועלויות מכירה' : 'Before tax & exit costs'}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">{expanded ? (he ? 'פחות פרטים' : 'Less detail') : (he ? 'לפירוט הסגירה' : 'View exit details')}<ChevronDown aria-hidden className="holding-chevron h-3.5 w-3.5 text-slate-400" /></span>
          </div>
          <button type="button" aria-label={he ? `${expanded ? 'סגירת' : 'פתיחת'} פרטי ${proposal.winner.position.symbol} + ${proposal.loser.position.symbol}` : `${expanded ? 'Collapse' : 'Expand'} ${proposal.winner.position.symbol} + ${proposal.loser.position.symbol} details`} aria-expanded={expanded} aria-controls={`${panelId}-${index}`} onClick={() => setExpandedPairs(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} title={he ? 'לחצו בכל מקום בכרטיס, גם על הגרף, לפתיחה או לסגירה' : 'Click anywhere in the preview, including the chart, to expand or collapse'} className="absolute inset-0 z-10 w-full cursor-pointer rounded-2xl transition-colors hover:bg-blue-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 motion-reduce:transition-none" />
          </div>
        <div id={`${panelId}-${index}`} aria-hidden={!expanded} ref={element => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
          <div className="min-h-0 overflow-hidden">
            <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
              <ul className={`border-t border-slate-200/70 pt-2 text-sm ${proposals.length === 1 ? 'grid gap-x-8 gap-y-1 sm:grid-cols-2' : 'space-y-1'}`}>
                {[proposal.winner, proposal.loser].map(leg => <li key={leg.position.symbol} className="flex items-center justify-between gap-3">
                  <Link href={buildStockHref(leg.position.symbol, typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${leg.surplusUsd >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="min-w-0"><bdi className="block font-medium">{leg.position.symbol}</bdi><span className="mt-0.5 block text-[11px] text-slate-500">{he ? 'כל' : 'All'} {leg.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })} {he ? 'המניות' : 'shares'} · <bdi>{money(leg.currentPrice)}</bdi> {he ? 'למניה' : '/ share'}</span><span className="mt-1 block text-[10px] text-slate-500">{he ? 'רווח' : 'Profit'} <bdi>{money(leg.pnlUsd)}</bdi> · {he ? 'יעד' : 'Target'} <bdi>{money(leg.targetProfitUsd)}</bdi></span></span>
                  </Link>
                  <div className="shrink-0 text-end"><p className="text-[10px] text-slate-500">{he ? 'פער מהיעד' : 'Gap to target'}</p><bdi className={`mt-0.5 block text-sm font-semibold tabular-nums ${leg.surplusUsd >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{leg.surplusUsd > 0 ? '+' : ''}{money(leg.surplusUsd)}</bdi></div>
                </li>)}
              </ul>
              <dl className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-blue-100/60 bg-blue-50/50 px-3 py-3 text-xs"><dt className="text-slate-500">{he ? 'תמורת מכירה משוערת' : 'Estimated sale proceeds'}</dt><dd className="font-medium tabular-nums text-slate-900"><bdi>{money(proposal.proceedsUsd)}</bdi></dd></dl>
            </div>
          </div>
        </div>
      </article>;
      })}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] leading-5 text-slate-500 sm:px-5">
      <p>{he ? 'יעד אישי להיום · USD · לפני מס ועלויות מכירה' : 'Personal target to date · USD · before tax & exit costs'}</p>
      <button type="button" onClick={copyForAi} disabled={copying} aria-label={he ? 'העתקת פרומפט לבדיקה ב־AI' : 'Copy prompt for AI review'} title={he ? 'העתקת פרומפט למחקר והכרעה לגבי כל זוג' : 'Copy a prompt for research and a verdict on each pair'} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-blue-100 bg-blue-50/70 px-4 text-xs font-semibold text-blue-700 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-100/70 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"><Copy aria-hidden className="h-3.5 w-3.5" />{copying ? (he ? 'מעתיק…' : 'Copying…') : (he ? 'בדיקת AI' : 'AI review')}</button>
    </div>
    <div className={anyExpanded ? 'holding-card-open' : ''}><div aria-hidden={!anyExpanded} ref={element => { if (anyExpanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal"><div className="min-h-0 overflow-hidden"><p className="holding-detail-content px-4 pb-4 text-[11px] leading-relaxed text-slate-500 sm:px-5">{he ? 'הדמיה בדולרים לפי המחירים הזמינים ועלות FIFO, כולל עמלות קנייה שהוזנו. יעד התשואה השנתי האישי נצבר ממועד כל קנייה על יתרת המניות בלבד, ואינו תחזית שוק. מוצגים רק זוגות שהרווח בסגירתם חיובי וגם מכסה את יעד הרווח של שתיהן. מס, עמלות מכירה ושינויי מחיר אינם כלולים ועשויים לשנות את התוצאה. מיון לפי החוסר המכוסה מול היעד ואז היתרה מעל היעד; כל מניה מופיעה בזוג אחד בלבד. הפרומפט כולל את כמויות וסכומי ההצעות המוצגות, להדבקה ידנית ב־AI. ההצעות אינן מבצעות מכירה.' : 'USD simulation using available prices and FIFO cost, including recorded purchase fees. The personal annual return target accrues from each purchase on remaining shares only; it is not a market forecast. Pairs must have positive exit profit and also cover both personal profit targets. Tax, exit fees and price changes are excluded and may change the result. Ranked by covered target shortfall, then surplus above target; each stock appears in one pair only. The prompt includes the displayed quantities and amounts for manually pasting into your AI. These ideas do not execute trades.'}</p></div></div></div>
  </section>;
}
