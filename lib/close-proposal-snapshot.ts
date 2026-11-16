import { hasReconciliationHistory } from '@/lib/reconciliation-quality';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildClosePairProposals, buildCloseProposalLegs, DEFAULT_CLOSE_PAIR_POLICY, getCloseProposalLegs, isEligibleCloseProposalLoser } from '@/lib/close-pair-proposals';
import { computeOpenLots } from '@/lib/positions';
import { validateActionPlan, type InvestmentSnapshot } from '@/lib/investment-actions';
import type { Position, PositionMetrics } from '@/types';

interface QuoteObservation { priceUsd: number | null; marketTimestamp: string | null; source: string; status: string }
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const symbolKey = (symbol: string) => symbol.trim().toUpperCase();

/** Compact server-computed proposals; no lot/account records are duplicated in the response. */
export function buildCloseProposalSnapshot(input: {
  positions: Position[]; metrics: PositionMetrics[]; annualGrowthRate: number | null;
  ownerId?: string; sources?: { id: string; name: string }[]; asOf: number; quotes: Record<string, QuoteObservation>; maxLosers?: 1 | 3;
}) {
  const { positions, metrics, annualGrowthRate, asOf, quotes } = input;
  const policy = { ...DEFAULT_CLOSE_PAIR_POLICY, maxLosers: input.maxLosers ?? 3 };
  const openSymbols = [...new Set(metrics.map(metric => symbolKey(metric.position.symbol)))];
  const missingQuoteSymbols = [...new Set(positions.filter(position => {
    const quantity = position.lots?.length ? computeOpenLots(position.lots).reduce((sum, lot) => sum + lot.quantity, 0) : position.quantity;
    return quantity > 1e-8 && !openSymbols.includes(symbolKey(position.symbol));
  }).map(position => symbolKey(position.symbol)))].sort();
  const validLegs = annualGrowthRate === null ? [] : buildCloseProposalLegs(metrics, positions, asOf, annualGrowthRate);
  const validSymbols = new Set(validLegs.map(leg => symbolKey(leg.position.symbol)));
  const reconciledSymbols = new Set(positions.filter(position => hasReconciliationHistory(position, asOf)).map(position => symbolKey(position.symbol)));
  const invalidHistorySymbols = annualGrowthRate === null ? [] : openSymbols.filter(symbol => !validSymbols.has(symbol)).sort();
  const exclusions = [
    ...missingQuoteSymbols.map(symbol => ({ symbol, reason: 'missing_or_invalid_quote' })),
    ...invalidHistorySymbols.filter(symbol => !reconciledSymbols.has(symbol)).map(symbol => ({ symbol, reason: 'invalid_or_inconsistent_source_history' })),
    ...[...reconciledSymbols].map(symbol => ({ symbol, reason: 'reconciliation_history_incomplete' })),
  ];
  // Re-read and recompute on every call. Clock milliseconds are not source-data
  // changes; using the UTC day keeps review IDs usable without caching personal data.
  // ownerId binds identical source records to their authenticated account.
  const calculationDay = Math.floor(asOf / 86_400_000);
  const snapshotId = fingerprint({ ownerId: input.ownerId ?? null, calculationDay, annualGrowthRate, positions, quotes, policy });
  const proposals = annualGrowthRate === null ? [] : buildClosePairProposals(metrics.filter(metric => !reconciledSymbols.has(symbolKey(metric.position.symbol))), 3, asOf, annualGrowthRate, positions.filter(position => !reconciledSymbols.has(symbolKey(position.symbol))), policy);
  const searchTruncated = validLegs.filter(leg => isEligibleCloseProposalLoser(leg, policy)).length > DEFAULT_CLOSE_PAIR_POLICY.maxCandidateLosers;
  const policyFilteredLossSymbols = validLegs.filter(leg => (leg.unrealizedPnlUsd ?? 0) < 0 && !isEligibleCloseProposalLoser(leg, policy)).map(leg => symbolKey(leg.position.symbol));
  return {
    snapshotId, calculatedAt: new Date(asOf).toISOString(),
    availability: annualGrowthRate === null ? 'unavailable' : exclusions.length || searchTruncated ? 'partial' : 'complete',
    unavailableReason: annualGrowthRate === null ? 'Personal annual return target is unavailable; no substitute target was assumed.' : null,
    policy: { ...policy, ownerConfirmedDefaults: true,
      meaning: 'Owner-confirmed screening defaults; these do not establish investment horizon or risk tolerance. Loss percent uses remaining open FIFO cost; holding age is cost-weighted across remaining purchases. Recent holdings qualify only at the severe-loss threshold. Each group closes one winner plus up to maxLosers losing symbols, fully across all accounts. Positive cumulative profit and positive surplus above all accrued personal targets are required.' },
    annualGrowthRate, coverage: { openSymbolCount: openSymbols.length + missingQuoteSymbols.length, validSymbolCount: validLegs.length,
      exclusions, policyFilteredLossSymbols, searchTruncated, maximumGroups: 3, selection: 'Bounded ranked search, not exhaustive market optimization. Symbols never repeat between selected groups.' },
    proposals: proposals.map(proposal => {
      const legs = getCloseProposalLegs(proposal).map((leg, index) => ({
        symbol: symbolKey(leg.position.symbol), company: leg.position.display, role: index === 0 ? 'winner' : 'loser', action: 'SELL' as const,
        quantity: leg.quantity, referencePriceUsd: leg.currentPrice,
        marketTimestamp: quotes[symbolKey(leg.position.symbol)]?.marketTimestamp ?? null,
        quoteSource: quotes[symbolKey(leg.position.symbol)]?.source ?? null,
        remainingFifoCostUsd: leg.costBasisUsd, estimatedGrossProceedsUsd: leg.proceedsUsd,
        priorRealizedProfitUsd: leg.realizedPnlUsd ?? 0, unrealizedProfitUsd: leg.unrealizedPnlUsd ?? leg.pnlUsd,
        cumulativeProfitUsd: leg.pnlUsd, personalTargetProfitUsd: leg.targetProfitUsd,
        surplusAboveTargetUsd: leg.surplusUsd, weightedHoldingDays: leg.weightedHoldingDays ?? null, openLossPercent: leg.lossPercent ?? null,
        accounts: (leg.historicalPositions ?? [leg.position]).map(position => ({ location: position.location,
          sourceName: input.sources?.find(source => source.id === position.location)?.name ?? null,
          quantity: position.lots?.length ? computeOpenLots(position.lots).reduce((sum, lot) => sum + lot.quantity, 0) : position.quantity,
        })).filter(account => account.quantity > 1e-8),
      }));
      return { proposalId: fingerprint({ snapshotId, legs: legs.map(leg => ({ symbol: leg.symbol, quantity: leg.quantity })) }), legs,
        combinedCumulativeProfitUsd: proposal.netProfitUsd,
        combinedPriorRealizedProfitUsd: legs.reduce((sum, leg) => sum + leg.priorRealizedProfitUsd, 0),
        combinedUnrealizedProfitUsd: legs.reduce((sum, leg) => sum + leg.unrealizedProfitUsd, 0),
        estimatedGrossProceedsUsd: proposal.proceedsUsd, personalTargetProfitUsd: proposal.targetProfitUsd,
        surplusAboveTargetUsd: proposal.surplusUsd, coveredTargetShortfallUsd: proposal.coveredShortfallUsd };
    }),
    limitations: ['Only recorded data and last available quotes are used; this is not investment approval or an order.',
      'Prior realized profit is historical, not money earned by selling now. Gross sale proceeds contain returned capital and are not profit.',
      'Recorded commissions are included; future sale fees, slippage and tax are excluded. No tax offset or saving is established.',
      'Calculated time is not market time. Quotes are last available provider observations and may be delayed or from an earlier market session.',
      'No proposal means no qualifying group was selected under this policy and available coverage; incomplete coverage cannot establish that none exists.'],
  };
}

export const closeProposalValidationSchema = z.object({ snapshotId: z.string().regex(/^[a-f0-9]{64}$/), proposalId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type CloseProposalSnapshot = ReturnType<typeof buildCloseProposalSnapshot>;

/** Recheck the complete server-owned group against the freshly calculated account snapshot. */
export function validateCloseProposal(snapshot: InvestmentSnapshot, input: z.infer<typeof closeProposalValidationSchema>, now = Date.now()) {
  const available = [snapshot.closePairProposals, snapshot.closePairOnlyProposals].filter(Boolean) as CloseProposalSnapshot[];
  const current = available.find(item => item.snapshotId === input.snapshotId) ?? available[0];
  const errors: string[] = [];
  if (!current || current.availability === 'unavailable') errors.push('Close proposals are unavailable; reload and review current data.');
  if (current && input.snapshotId !== current.snapshotId) errors.push('Snapshot changed; prices, holdings, history, targets, account or calculation day may differ. Read and review the current proposal again.');
  const proposal = current?.proposals.find(item => item.proposalId === input.proposalId);
  if (!proposal) errors.push('Proposal is absent from the current selected qualifying groups.');
  if (proposal) {
    const validated = validateActionPlan(snapshot, { budgetUsd: 0, actions: proposal.legs.map(leg => ({ symbol: leg.symbol, action: 'SELL', quantity: leg.quantity, priceUsd: leg.referencePriceUsd })) }, now);
    errors.push(...validated.errors);
    if (proposal.legs.length < 2 || proposal.legs.length > DEFAULT_CLOSE_PAIR_POLICY.maxLosers + 1 || proposal.combinedCumulativeProfitUsd < 0.01 - 1e-9 || proposal.surplusAboveTargetUsd < 0.01 - 1e-9) errors.push('Group no longer satisfies the complete-close screening rules.');
    if (proposal.legs.some(leg => !leg.marketTimestamp || !Number.isFinite(Date.parse(leg.marketTimestamp)) || Date.parse(leg.marketTimestamp) > now + 60_000)) errors.push('One or more quote timestamps are missing, invalid or future-dated.');
  }
  return { valid: errors.length === 0, errors, snapshotGeneratedAt: snapshot.generatedAt,
    snapshotId: current?.snapshotId ?? null, proposal: errors.length ? null : proposal,
    scope: 'Whole-group arithmetic, full recorded quantities and qualification in the freshly calculated account snapshot only. No budget is needed for a sell-only group.',
    limitations: ['This read reloads account records and recalculates qualification, but does not guarantee executable prices or holdings outside the application.', 'Verify quote market sessions and actual broker holdings before deciding. No orders are placed; grouping a recommendation does not make market execution atomic.', 'A valid result is not research approval, investor suitability or a guarantee after fees, tax or slippage.'] };
}
