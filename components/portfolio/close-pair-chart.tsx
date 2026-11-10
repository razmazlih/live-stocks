'use client';

import { useMemo } from 'react';
import { Sparkline } from '@/components/charts/sparkline';
import { buildClosePairHistory } from '@/lib/close-pair-history';
import type { ClosePairProposal } from '@/lib/close-pair-proposals';
import { formatCurrency } from '@/lib/calculations';
import type { HistoricalPoint } from '@/types';

const EMPTY_HISTORY: HistoricalPoint[] = [];

export function ClosePairChart({ proposal, sparklineData, locale }: {
  proposal: ClosePairProposal;
  sparklineData: Record<string, HistoricalPoint[]>;
  locale: 'he' | 'en';
}) {
  const he = locale === 'he';
  const winner = proposal.winner.position;
  const loser = proposal.loser.position;
  const winnerHistory = sparklineData[winner.activationId ?? winner.id ?? winner.symbol] ?? EMPTY_HISTORY;
  const loserHistory = sparklineData[loser.activationId ?? loser.id ?? loser.symbol] ?? EMPTY_HISTORY;
  const points = useMemo(() => buildClosePairHistory(proposal, winnerHistory, loserHistory), [proposal, winnerHistory, loserHistory]);
  const money = (value: number) => formatCurrency(value, 'USD', locale);
  const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', {day: 'numeric', month: 'short', timeZone: 'UTC'});
  const last = points[points.length - 1];

  return <div className="px-4 pb-4 sm:px-5">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
      <p className="font-medium text-slate-500">{he ? 'הדמיית הרווח לאורך זמן' : 'Profit simulation over time'}</p>
      {points.length >= 2 && Math.abs(last.close - proposal.netProfitUsd) >= 0.005 ? <span className="text-[10px] text-slate-500">{he ? `סגירה אחרונה · ${date(last.timestamp)}: ` : `Last close · ${date(last.timestamp)}: `}<bdi className={`font-semibold tabular-nums ${last.close >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{last.close > 0 ? '+' : ''}{money(last.close)}</bdi></span> : null}
    </div>
    {points.length < 2 ? <p className="flex min-h-24 items-center justify-center rounded-lg bg-slate-50/70 px-4 text-center text-xs leading-5 text-slate-500">{he ? 'אין מספיק נתונים היסטוריים משותפים לשתי המניות' : 'Not enough shared history for both stocks'}</p> : <>
      <div role="img" aria-label={he ? `רווח משולב של ${winner.symbol} ו־${loser.symbol} לפי הכמות והעלות שנותרו היום, מ־${date(points[0].timestamp)} עד ${date(last.timestamp)}, ערך אחרון ${money(last.close)}, לפני מס ועלויות מכירה` : `Combined profit for ${winner.symbol} and ${loser.symbol} using today's remaining quantities and costs, ${date(points[0].timestamp)} to ${date(last.timestamp)}, latest ${money(last.close)}, before tax and exit costs`} dir="ltr">
        <div aria-hidden="true" ref={element => { element?.setAttribute('inert', ''); }}>
          <Sparkline points={points} width={420} height={100} interactive={false} showYAxis yAxisWidth={58} baseline={0} baselineColor="#cbd5e1" color="#059669" belowEntryColor="#e11d48" priceFormatter={money} />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-400" dir="ltr"><span>{date(points[0].timestamp)}</span><span>{date(last.timestamp)}</span></div>
    </>}
    <p className="mt-2 text-[10px] leading-4 text-slate-500">{he ? 'לפי הכמות והעלות שנותרו היום · USD · הקו המקווקו מסמן איזון' : 'Current remaining quantities & costs · USD · dashed line marks break-even'}</p>
  </div>;
}
