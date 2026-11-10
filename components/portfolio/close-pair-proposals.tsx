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
  const { locale } = useApp();
  const he = locale === 'he';
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(() => new Set());
  const panelId = useId();
  const proposals = useMemo(() => buildClosePairProposals(metrics), [metrics]);
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
      <div className="min-w-0 flex-1"><h2 className="text-base font-semibold tracking-tight text-slate-950">{he ? 'הצעות לסגירת שתי פוזיציות' : 'Two-position exit ideas'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{he ? 'רווח שמכסה הפסד, בלי חפיפה בין הזוגות' : 'Profit covers loss, with no overlapping stocks'}</p></div>
      <span className="hidden rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex">{proposals.length} {he ? 'הצעות' : 'ideas'}</span>
    </div>

    <div data-testid="close-pair-preview" className={`grid items-start gap-3 border-y border-slate-100 bg-slate-50/60 p-3 sm:gap-4 sm:p-4 ${proposals.length === 2 ? 'md:grid-cols-2' : proposals.length > 2 ? 'xl:grid-cols-3' : ''}`}>
      {proposals.map((proposal, index) => {
        const key = pairKey(proposal);
        const expanded = expandedPairs.has(key);
        return <article key={key} className={`holding-card min-w-0 overflow-hidden ${expanded ? 'holding-card-open' : ''}`}>
          <button type="button" aria-label={he ? `${expanded ? 'סגירת' : 'פתיחת'} פרטי ${proposal.winner.position.symbol} + ${proposal.loser.position.symbol}` : `${expanded ? 'Collapse' : 'Expand'} ${proposal.winner.position.symbol} + ${proposal.loser.position.symbol} details`} aria-expanded={expanded} aria-controls={`${panelId}-${index}`} onClick={() => setExpandedPairs(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className="holding-toggle block w-full px-4 pb-4 pt-3 text-start transition-colors hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5 sm:pt-4">
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[11px] text-slate-500"><span className="font-medium text-slate-600">{he ? `זוג ${index + 1}` : `Pair ${index + 1}`}</span><span aria-hidden className="h-0.5 w-0.5 rounded-full bg-slate-300" />{proposal.winner.position.location === 'bank_two' ? (he ? 'בנק 2' : 'Bank 2') : (he ? 'בנק 1' : 'Bank 1')}</span>
              <span className="flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium text-slate-500"><span>{expanded ? (he ? 'פחות פרטים' : 'Less') : (he ? 'פרטים' : 'Details')}</span><ChevronDown aria-hidden className="holding-chevron h-3.5 w-3.5 text-slate-400" /></span>
            </span>
            <span className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5" dir="ltr"><span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold tracking-tight text-slate-950">{proposal.winner.position.symbol}</span><span className="text-xs text-slate-400"> + </span><span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold tracking-tight text-slate-950">{proposal.loser.position.symbol}</span></span>
                <span className="mt-2 block text-[11px] leading-4 text-slate-500">{he ? 'סגירה מלאה של שתי ההחזקות' : 'Close both holdings in full'}</span>
              </span>
              <span className="min-w-0 text-end"><span className="block text-[11px] text-slate-500">{he ? 'רווח משולב · USD' : 'Combined profit · USD'}</span><span className="mt-1 block text-2xl font-semibold tracking-tight text-emerald-700"><bdi>+{money(proposal.netProfitUsd)}</bdi></span></span>
            </span>
          </button>
          <dl className="mx-4 mb-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-2.5 text-xs sm:mx-5">
            <div><dt className="text-[11px] text-slate-500">{he ? 'רווח בפוזיציה' : 'Winning position'}</dt><dd className="mt-1 font-medium tabular-nums text-emerald-700"><bdi>+{money(proposal.profitUsd)}</bdi></dd></div>
            <div className="text-end"><dt className="text-[11px] text-slate-500">{he ? 'הפסד מכוסה' : 'Loss covered'}</dt><dd className="mt-1 font-medium tabular-nums text-rose-600"><bdi>{money(-proposal.lossUsd)}</bdi></dd></div>
          </dl>
        <ClosePairChart proposal={proposal} sparklineData={sparklineData} locale={locale} />
        <div id={`${panelId}-${index}`} aria-hidden={!expanded} ref={element => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
          <div className="min-h-0 overflow-hidden">
            <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
              <ul className={`border-t border-slate-200/70 pt-2 text-sm ${proposals.length === 1 ? 'grid gap-x-8 gap-y-1 sm:grid-cols-2' : 'space-y-1'}`}>
                {[proposal.winner, proposal.loser].map(leg => <li key={leg.position.symbol} className="flex items-center justify-between gap-3">
                  <Link href={buildStockHref(leg.position.symbol, typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${leg.pnlUsd > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="min-w-0"><bdi className="block font-medium">{leg.position.symbol}</bdi><span className="mt-0.5 block text-[11px] text-slate-500">{he ? 'כל' : 'All'} {leg.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })} {he ? 'המניות' : 'shares'} · <bdi>{money(leg.currentPrice)}</bdi> {he ? 'למניה' : '/ share'}</span></span>
                  </Link>
                  <bdi className={`shrink-0 text-sm font-medium tabular-nums ${leg.pnlUsd > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{leg.pnlUsd > 0 ? '+' : ''}{money(leg.pnlUsd)}</bdi>
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
      <p>{he ? 'USD · לפני מס ועלויות מכירה' : 'USD · before tax & exit costs'}</p>
      <button type="button" onClick={copyForAi} disabled={copying} aria-label={he ? 'העתקת פרומפט לבדיקה ב־AI' : 'Copy prompt for AI review'} title={he ? 'העתקת פרומפט למחקר והכרעה לגבי כל זוג' : 'Copy a prompt for research and a verdict on each pair'} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-blue-100 bg-blue-50/70 px-4 text-xs font-semibold text-blue-700 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-100/70 hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"><Copy aria-hidden className="h-3.5 w-3.5" />{copying ? (he ? 'מעתיק…' : 'Copying…') : (he ? 'בדיקת AI' : 'AI review')}</button>
    </div>
    <div className={anyExpanded ? 'holding-card-open' : ''}><div aria-hidden={!anyExpanded} ref={element => { if (anyExpanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal"><div className="min-h-0 overflow-hidden"><p className="holding-detail-content px-4 pb-4 text-[11px] leading-relaxed text-slate-500 sm:px-5">{he ? 'הדמיה בדולרים לפי המחירים הזמינים ועלות FIFO, כולל עמלות קנייה שהוזנו. מס, עמלות מכירה ושינויי מחיר אינם כלולים ועשויים לשנות את התוצאה. מיון לפי ההפסד המכוסה ואז הרווח שנותר; כל מניה מופיעה בזוג אחד בלבד. הפרומפט כולל את כמויות וסכומי ההצעות המוצגות, להדבקה ידנית ב־AI. ההצעות אינן מבצעות מכירה.' : 'USD simulation using available prices and FIFO cost, including recorded purchase fees. Tax, exit fees and price changes are excluded and may change the result. Ranked by covered loss, then remaining profit; each stock appears in one pair only. The prompt includes the displayed quantities and amounts for manually pasting into your AI. These ideas do not execute trades.'}</p></div></div></div>
  </section>;
}
