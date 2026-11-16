import type { Position } from '@/types';

/** A balance observation does not explain the missing cash flows or realized P/L. */
export function hasReconciliationHistory(position: Position, through = Number.POSITIVE_INFINITY): boolean {
  return (position.lots ?? []).some(lot => lot.type === 'RECONCILE'
    && Date.parse(lot.executedAt) <= through);
}

export const RECONCILIATION_HISTORY_WARNING = 'Broker balances include reconciliation checkpoints. Current USD quantity, cost and unrealized profit use the confirmed balance; historical trades and recorded realized sales are preserved. Missing executions and cash flows are unknown, so lifetime profit, complete tax estimates, targets and benchmark comparisons are unavailable.';

/** Legacy records predate the flag and retain their prior known-fee semantics. */
export function hasUnknownCommissions(position: Position): boolean {
  return (position.lots ?? []).some(lot => lot.commissionKnown === false);
}

export const UNKNOWN_COMMISSION_WARNING = 'Some recorded transaction commissions were not supplied. Missing fees are unknown, not zero. Exact net profit, complete cost totals, tax estimates and cost-dependent targets/proposals are unavailable for the affected history. Supply the missing commission amounts if precise profit or tax is needed; quantities and market values remain available.';

/** Retain exact market valuation while withholding cost-dependent aggregate amounts. */
export function withCommissionQuality<T extends object>(summary: T, complete: boolean) {
  if (complete) return summary;
  const unavailable = ['totalCost', 'totalCommissionsUsd', 'totalCommissionsIls',
    'totalCurrentPnLUsd', 'totalCurrentPnLIls', 'totalProjectedPnLUsd', 'totalProjectedPnLIls',
    'totalCombinedUsd', 'totalCombinedIls', 'totalRealizedProfitUsd', 'totalRealizedProfitIls',
    'totalTaxesPaidUsd', 'totalTaxesPaidIls', 'totalNetPnLUsd', 'totalNetPnLIls',
    'totalForecastGapUsd', 'totalForecastGapIls'];
  return { ...summary, ...Object.fromEntries(unavailable.map(key => [key, null])) };
}

export function reconciliationQuality(positions: Position[]) {
  const reconciledSymbols = [...new Set(positions.filter(position => hasReconciliationHistory(position))
    .map(position => position.symbol.trim().toUpperCase()))].sort();
  const missingCommissionSymbols = [...new Set(positions.filter(hasUnknownCommissions)
    .map(position => position.symbol.trim().toUpperCase()))].sort();
  return {
    completeCommissionHistory: missingCommissionSymbols.length === 0,
    missingCommissionSymbols,
    completeTransactionHistory: reconciledSymbols.length === 0,
    reconciledSymbols,
    realizedProfitScope: reconciledSymbols.length ? 'recorded_executions_only' as const : 'recorded_history' as const,
  };
}

/** FX acquisition basis may precede a broker observation by years. */
export function positionFxTimestamps(position: Position): number[] {
  return (position.lots ?? []).flatMap(lot => [lot.executedAt, lot.basisAcquiredOn]
    .filter((value): value is string => Boolean(value))
    .map(value => Date.parse(value)).filter(Number.isFinite));
}
