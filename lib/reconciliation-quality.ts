import type { Position } from '@/types';

/** A balance observation does not explain the missing cash flows or realized P/L. */
export function hasReconciliationHistory(position: Position, through = Number.POSITIVE_INFINITY): boolean {
  return (position.lots ?? []).some(lot => lot.type === 'RECONCILE'
    && Date.parse(lot.executedAt) <= through);
}

export const RECONCILIATION_HISTORY_WARNING = 'Broker balances include reconciliation checkpoints. Current USD quantity, cost and unrealized profit use the confirmed balance; historical trades and recorded realized sales are preserved. Missing executions and cash flows are unknown, so lifetime profit, complete tax estimates, targets and benchmark comparisons are unavailable.';

export function reconciliationQuality(positions: Position[]) {
  const reconciledSymbols = [...new Set(positions.filter(position => hasReconciliationHistory(position))
    .map(position => position.symbol.trim().toUpperCase()))].sort();
  return {
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
