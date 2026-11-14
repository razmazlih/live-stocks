'use client';

import { useMemo } from 'react';
import { Sparkline } from '@/components/charts/sparkline';
import { buildClosePairHistory } from '@/lib/close-pair-history';
import { getCloseProposalLegs, type ClosePairProposal } from '@/lib/close-pair-proposals';
import { formatCurrency } from '@/lib/calculations';
import type { HistoricalPoint } from '@/types';
import styles from './close-pair-chart.module.css';
import { expandPositionActivations } from '@/lib/positions';
import type { ClosePairLeg } from '@/lib/close-pair-proposals';

const EMPTY_HISTORY: HistoricalPoint[] = [];

function historyForLeg(leg: ClosePairLeg, data: Record<string, HistoricalPoint[]>): HistoricalPoint[] {
  if (!leg.historicalPositions) return data[leg.position.activationId ?? leg.position.id ?? leg.position.symbol] ?? EMPTY_HISTORY;
  const points = leg.historicalPositions.flatMap(position => [position, ...expandPositionActivations(position)].flatMap(activation => data[activation.activationId ?? activation.id ?? activation.symbol] ?? EMPTY_HISTORY));
  return [...new Map(points.map(point => [point.timestamp, point])).values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function ClosePairChart({ proposal, sparklineData, locale, compact = false }: {
  proposal: ClosePairProposal;
  sparklineData: Record<string, HistoricalPoint[]>;
  locale: 'he' | 'en';
  compact?: boolean;
}) {
  const he = locale === 'he';
  const legs = getCloseProposalLegs(proposal);
  const symbols = legs.map(leg => leg.position.symbol).join(he ? ' + ' : ' and ');
  const points = useMemo(() => {
    const groupLegs = getCloseProposalLegs(proposal);
    const histories = Object.fromEntries(groupLegs.map(leg => [leg.position.symbol.trim().toUpperCase(), historyForLeg(leg, sparklineData)]));
    return buildClosePairHistory(proposal, EMPTY_HISTORY, EMPTY_HISTORY, proposal.targetAsOf, histories);
  }, [proposal, sparklineData]);
  const money = (value: number) => formatCurrency(value, 'USD', locale);
  const date = (timestamp: number) => new Date(timestamp).toLocaleDateString(he ? 'he-IL' : 'en-US', {day: 'numeric', month: 'short', timeZone: 'UTC'});
  const last = points[points.length - 1];

  return <div className={`px-4 sm:px-5 ${styles.chart} ${compact ? styles.compactChart : ''}`}>
    <div aria-hidden={compact} className={`${styles.reveal} ${compact ? '' : styles.revealed}`}><div className="min-h-0 overflow-hidden"><div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
      <p className="font-medium text-slate-500">{he ? 'הפער מהיעד האישי לאורך זמן' : 'Gap to personal target over time'}</p>
      {points.length >= 2 && Math.abs(last.close - proposal.surplusUsd) >= 0.005 ? <span className="text-[10px] text-slate-500">{he ? `סגירה אחרונה · ${date(last.timestamp)}: ` : `Last close · ${date(last.timestamp)}: `}<bdi className={`font-semibold tabular-nums ${last.close >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{last.close > 0 ? '+' : ''}{money(last.close)}</bdi></span> : null}
    </div></div></div>
    {points.length < 2 ? <div className={`${styles.plot} ${compact ? styles.compactPlot : ''}`}><p className="flex h-full items-center justify-center rounded-lg bg-slate-50/70 px-4 text-center text-xs leading-5 text-slate-500">{he ? 'אין מספיק נתונים היסטוריים לחישוב הפער מהיעד' : 'Not enough historical data to calculate the target gap'}</p></div> : <>
      <div role="img" aria-label={he ? `פער משולב מהיעד של ${symbols} כולל רווחים והפסדים ממומשים מכל הסבבים, מ־${date(points[0].timestamp)} עד ${date(last.timestamp)}, ערך אחרון ${money(last.close)}, לפני מס ועלויות מכירה` : `Combined target surplus for ${symbols} including realized gains and losses from all cycles, ${date(points[0].timestamp)} to ${date(last.timestamp)}, latest ${money(last.close)}, before tax and exit costs`} dir="ltr">
        <div aria-hidden="true" ref={element => { element?.setAttribute('inert', ''); }} className={`${styles.plot} ${compact ? styles.compactPlot : ''}`}>
          <Sparkline points={points} width={420} height={100} interactive={false} showYAxis={false} yAxisWidth={58} baseline={0} baselineColor="#cbd5e1" color="#059669" belowEntryColor="#e11d48" priceFormatter={money} />
        </div>
      </div>
      <div aria-hidden={compact} className={`${styles.reveal} ${compact ? '' : styles.revealed}`}><div className="min-h-0 overflow-hidden"><div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-400" dir="ltr"><span>{date(points[0].timestamp)}</span><span>{date(last.timestamp)}</span></div></div></div>
    </>}
    <div aria-hidden={compact} className={`${styles.reveal} ${compact ? '' : styles.revealed}`}><div className="min-h-0 overflow-hidden"><p className="mt-2 text-[10px] leading-4 text-slate-500">{he ? 'כל מניה נכללת ממועד כניסתה, כולל תוצאות ממומשות מכל הסבבים · USD · הקו המקווקו מסמן עמידה ביעד האישי' : 'All holding cycles and previous sales · each holding joins from its entry date · USD · dashed line marks meeting your personal target'}</p></div></div>
  </div>;
}
