'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { buildClosePairReviewPrompt } from '@/lib/close-pair-review-prompt';
import { buildClosePairProposals, getCloseProposalLegs } from '@/lib/close-pair-proposals';
import { formatCurrency } from '@/lib/calculations';
import { useInvestmentSources } from '@/hooks/use-investment-sources';
import { useApp } from '@/lib/context';
import type { ClosePairProposal } from '@/lib/close-pair-proposals';
import { ClosePairChart } from './close-pair-chart';
import { ClosePairDetails } from './close-pair-details';
import type { HistoricalPoint, Position, PositionMetrics } from '@/types';

function pairKey(proposal: ClosePairProposal) {
  return JSON.stringify(getCloseProposalLegs(proposal).map(leg => [leg.position.symbol, leg.position.location, leg.position.id]));
}

export function ClosePairProposals({ metrics, positions, sparklineData = {} }: { metrics: PositionMetrics[]; positions?: Position[]; sparklineData?: Record<string, HistoricalPoint[]> }) {
  const { locale, settings } = useApp();
  const { sourceName } = useInvestmentSources();
  const he = locale === 'he';
  const [expandedPairs, setExpandedPairs] = useState<Set<string>>(() => new Set());
  const panelId = useId();
  const [showIdeas, setShowIdeas] = useState(false);
  const proposals = useMemo(() => buildClosePairProposals(metrics, 3, Date.now(), settings.annualGrowthRate, positions), [metrics, positions, settings.annualGrowthRate]);
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

  const anyExpanded = proposals.some(proposal => expandedPairs.has(pairKey(proposal)));

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-label={he ? 'הצעות לסגירת החזקות' : 'Full-position exit ideas'}>
    <h2>
      <button type="button" aria-expanded={showIdeas} aria-controls={panelId} onClick={() => setShowIdeas(open => !open)}
        className="flex min-h-14 w-full items-center gap-2 px-4 py-3 text-start text-sm font-semibold text-slate-950 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5 sm:text-base">
        <span>{he ? 'הצעות לסגירת החזקות' : 'Full-position exit ideas'}</span>{' '}
        <span className="text-sm font-normal tabular-nums text-slate-500">({proposals.length})</span>
        <ChevronDown aria-hidden className={`ms-auto h-4 w-4 text-slate-500 transition-transform motion-reduce:transition-none ${showIdeas ? 'rotate-180' : ''}`} />
      </button>
    </h2>
    <div id={panelId} hidden={!showIdeas}>
    {showIdeas && (proposals.length > 0 ? <>
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">
      <p>{he ? 'כולל מכירות קודמות' : 'Includes prior sales'}</p>
      <button type="button" onClick={copyForAi} disabled={copying} aria-label={he ? 'העתקת פרומפט לבדיקה ב־AI' : 'Copy prompt for AI review'} title={he ? 'העתקת פרומפט למחקר והכרעה לגבי כל קבוצה' : 'Copy a prompt for research and a verdict on each group'} className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"><Copy aria-hidden className="h-3.5 w-3.5" />{copying ? (he ? 'מעתיק…' : 'Copying…') : (he ? 'בדיקת AI' : 'AI review')}</button>
    </div>

    <div data-testid="close-pair-preview" className={`grid items-start gap-3 border-y border-slate-100 bg-slate-50/60 p-3 sm:gap-4 sm:p-4 ${proposals.length === 2 ? 'md:grid-cols-2' : proposals.length > 2 ? 'xl:grid-cols-3' : ''}`}>
      {proposals.map((proposal, index) => {
        const key = pairKey(proposal);
        const expanded = expandedPairs.has(key);
        const legs = getCloseProposalLegs(proposal);
        const symbols = legs.map(leg => leg.position.symbol).join(' + ');
        return <article key={key} className={`holding-card min-w-0 overflow-hidden ${expanded ? 'holding-card-open' : ''}`}>
          <div className="relative isolate">
          <div className="px-4 pb-3 pt-3 sm:px-5">
            <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5" dir="ltr">{legs.map((leg, legIndex) => <span key={leg.position.symbol} className="inline-flex items-center gap-1.5">{legIndex > 0 && <span className="text-xs text-slate-400">+</span>}<span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold tracking-tight text-slate-950">{leg.position.symbol}</span></span>)}</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">{[...new Set(legs.flatMap(leg => leg.locations ?? [leg.position.location]))].map(location => sourceName(location, locale)).join(' · ')}</span>
              </span>
              <span className="min-w-0 text-end"><span className="block text-[11px] text-slate-500">{he ? 'מעל היעד האישי · USD' : 'Above personal target · USD'}</span><span className="mt-1 block text-2xl font-semibold leading-tight tracking-tight text-emerald-700"><bdi>+{money(proposal.surplusUsd)}</bdi></span></span>
            </span>
          </div>
        <ClosePairChart proposal={proposal} sparklineData={sparklineData} locale={locale} compact={!expanded} />
          <div className="mx-4 flex min-h-8 items-center justify-between gap-3 border-t border-slate-100 pb-2 pt-1.5 sm:mx-5">
            <span className="text-[10px] text-slate-500">{he ? 'לפני מס ועלויות מכירה' : 'Before tax & exit costs'}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">{expanded ? (he ? 'פחות פרטים' : 'Less detail') : (he ? 'לפירוט הסגירה' : 'View exit details')}<ChevronDown aria-hidden className="holding-chevron h-3.5 w-3.5 text-slate-400" /></span>
          </div>
          <button type="button" aria-label={he ? `${expanded ? 'סגירת' : 'פתיחת'} פרטי ${symbols}` : `${expanded ? 'Collapse' : 'Expand'} ${symbols} details`} aria-expanded={expanded} aria-controls={`${panelId}-${index}`} onClick={() => setExpandedPairs(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} title={he ? 'לחצו בכל מקום בכרטיס, גם על הגרף, לפתיחה או לסגירה' : 'Click anywhere in the preview, including the chart, to expand or collapse'} className="absolute inset-0 z-10 w-full cursor-pointer rounded-2xl transition-colors hover:bg-blue-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 motion-reduce:transition-none" />
          </div>
        <div id={`${panelId}-${index}`} aria-hidden={!expanded} ref={element => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
          <div className="min-h-0 overflow-hidden">
            <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
              <ClosePairDetails proposal={proposal} locale={locale} />
            </div>
          </div>
        </div>
      </article>;
      })}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] leading-5 text-slate-500 sm:px-5">
      <p>{he ? 'יעד אישי להיום · USD · לפני מס ועלויות מכירה' : 'Personal target to date · USD · before tax & exit costs'}</p>

    </div>
    <div className={anyExpanded ? 'holding-card-open' : ''}><div aria-hidden={!anyExpanded} ref={element => { if (anyExpanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal"><div className="min-h-0 overflow-hidden"><details className="px-4 pb-3 text-[11px] leading-relaxed text-slate-500 sm:px-5"><summary className="flex min-h-[44px] cursor-pointer items-center text-blue-700">{he ? 'מה כלול בחישוב?' : 'What’s included?'}</summary><p>{he ? 'הדמיה בדולרים לפי המחירים הזמינים ועלות FIFO, כולל עמלות קנייה ומכירה שהוזנו ותוצאות כל המכירות הקודמות של כל סימול בכל החשבונות. יעד התשואה השנתי האישי נצבר לכל מנת קנייה עד מכירתה או עד היום אם היא עדיין פתוחה, ואינו תחזית שוק. כל קבוצה משלבת מניה ברווח מעל היעד עם מניה מפסידה אחת או יותר. הרווח המצטבר המשולב חייב להיות חיובי ומעל היעד האישי של כולן. מס, עמלות מכירה ושינויי מחיר אינם כלולים ועשויים לשנות את התוצאה. העדפה להפסד הגדול ביותר שניתן לסגור ואז לסך ההפסדים המכוסים; כל מניה מופיעה בקבוצה אחת בלבד. הפרומפט כולל את כמויות וסכומי ההצעות המוצגות, להדבקה ידנית ב־AI. ההצעות אינן מבצעות מכירה.' : 'USD simulation using available prices and FIFO cost, including recorded buy and sell fees and every prior sale result for each symbol across accounts. The personal annual return target accrues for each purchase until it is sold, or until today while open; it is not a market forecast. Each group combines one profitable holding above target with one or more losing holdings; cumulative profit must be positive and exceed all personal targets. Tax, exit fees and price changes are excluded and may change the result. Prioritizes the largest individual loss, then total covered losses; each stock appears in one group only. The prompt includes the displayed quantities and amounts for manually pasting into your AI. These ideas do not execute trades.'}</p></details></div></div></div>
    </> : <p role="status" className="border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-500 sm:px-5">{he ? 'לא נמצאו הצעות שעומדות בתנאים בנתונים הזמינים. החזקות עם הפסד קטן או חדש מוגנות; אין צורך לייצר מכירה.' : 'No qualifying exit groups in the available data. Small or recent losses are protected; no sale is required.'}</p>)}
    </div>
  </section>;
}
