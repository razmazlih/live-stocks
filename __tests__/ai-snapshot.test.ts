import { describe, expect, it } from 'vitest';
import { buildAiSnapshot } from '@/lib/ai-snapshot';
import type { PositionMetrics } from '@/types';

function holding(symbol: string, quantity: number, entryPrice: number, currentPrice: number, dailyChangePercent?: number): PositionMetrics {
  return { position: { symbol, display: symbol, quantity, entryPrice }, currentPrice, currentValue: quantity * currentPrice, dailyChangePercent } as PositionMetrics;
}

describe('AI portfolio snapshot', () => {
  it('merges banks and normalized tickers with weighted entry price, without leaking quantities or money totals', () => {
    const result = buildAiSnapshot([holding(' aapl ', 2, 10, 30, 1), holding('AAPL', 1, 20, 30, 1), holding('MSFT', 3, 30, 30, 2)], null, new Date('2026-10-11T10:00:00Z'), false);
    expect(result.stocks).toHaveLength(2);
    expect(result.stocks[0]).toMatchObject({ symbol: 'AAPL', averageEntryPriceUsd: 13.3333, currentPriceUsd: 30, allocationOfOpenPortfolioPercent: 50, changeSinceEntryPercent: 125 });
    expect(JSON.stringify(result)).not.toMatch(/quantity|currentValue|positionId|lots|commission/);
    expect(result.updatedAt).toBe('2026-10-11T10:00:00.000Z');
  });
  it('keeps allocation against the full open portfolio when selecting a subset', () => {
    const result = buildAiSnapshot([holding('AAPL', 1, 10, 30), holding('MSFT', 3, 10, 30), holding('CLOSED', 0, 10, 30)], ['AAPL'], null, true);
    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0].allocationOfOpenPortfolioPercent).toBe(25);
    expect(result.stocks[0].dailyChangePercent).toBeNull();
    expect(result.freshness).toBe('stale');
    expect(result.updatedAt).toBeNull();
  });
  it('supports an empty selection and excludes historical activations', () => {
    const historical = holding('OLD', 3, 10, 30);
    historical.position.isHistoricalActivation = true;
    expect(buildAiSnapshot([historical], null, null, false).stocks).toEqual([]);
    expect(buildAiSnapshot([holding('AAPL', 1, 10, 30)], [], null, false).stocks).toEqual([]);
  });
});

import { buildCloseProposalSnapshot, validateCloseProposal } from '@/lib/close-proposal-snapshot';
import { calculatePositionMetrics } from '@/lib/calculations';
import type { Position } from '@/types';

function closeFixture() {
  const asOf = Date.now();
  const positions = [
    { symbol: 'WIN', quantity: 10, entryPrice: 100 },
    { symbol: 'LOSS', quantity: 10, entryPrice: 100 },
  ].map(value => ({ ...value, display: value.symbol, imageUrl: '', location: 'bank_one', entryDate: new Date(asOf - 60 * 86400000).toISOString() })) as Position[];
  const quotes = { WIN: { priceUsd: 150, marketTimestamp: new Date(asOf).toISOString(), source: 'test', status: 'last_available' }, LOSS: { priceUsd: 90, marketTimestamp: new Date(asOf).toISOString(), source: 'test', status: 'last_available' } };
  const metrics = positions.map(position => calculatePositionMetrics(position, quotes[position.symbol as keyof typeof quotes].priceUsd, 1));
  const input = { positions, metrics, annualGrowthRate: 0.05, asOf, quotes };
  const groups = buildCloseProposalSnapshot(input);
  return { input, groups, snapshot: { schemaVersion: 1 as const, generatedAt: new Date(asOf).toISOString(), holdings: positions.map(position => ({ position: { ...position } })), closePairProposals: groups } };
}

describe('server close-proposal snapshots', () => {
  it('returns exact group amounts, quote times and account quantities without duplicate source lots', () => {
    const { groups } = closeFixture();
    expect(groups.availability).toBe('complete');
    expect(groups.proposals).toHaveLength(1);
    expect(groups.proposals[0]).toMatchObject({ combinedCumulativeProfitUsd: 400, combinedUnrealizedProfitUsd: 400, combinedPriorRealizedProfitUsd: 0, estimatedGrossProceedsUsd: 2400 });
    expect(groups.proposals[0].legs[0]).toMatchObject({ symbol: 'WIN', quantity: 10, accounts: [{ location: 'bank_one', quantity: 10 }] });
    expect(groups.proposals[0].legs.every(leg => !!leg.marketTimestamp)).toBe(true);
    expect(JSON.stringify(groups)).not.toContain('historicalPositions');
  });
  it('distinguishes absent target, incomplete quotes and invalid history from a real empty result', () => {
    const { input } = closeFixture();
    expect(buildCloseProposalSnapshot({ ...input, annualGrowthRate: null }).availability).toBe('unavailable');
    const missing = buildCloseProposalSnapshot({ ...input, metrics: input.metrics.slice(0, 1) });
    expect(missing.availability).toBe('partial');
    expect(missing.coverage.exclusions).toContainEqual({ symbol: 'LOSS', reason: 'missing_or_invalid_quote' });
    const bad = buildCloseProposalSnapshot({ ...input, positions: input.positions.map(position => ({ ...position, entryDate: 'invalid' })) });
    expect(bad.availability).toBe('partial');
    expect(bad.coverage.exclusions[0].reason).toBe('invalid_or_inconsistent_source_history');
    expect(buildCloseProposalSnapshot({ ...input, positions: [], metrics: [] })).toMatchObject({ availability: 'complete', proposals: [] });
  });
  it('validates full groups without a buy budget and rejects changed snapshots, removed legs and stale data', () => {
    const { groups, snapshot, input } = closeFixture();
    const args = { snapshotId: groups.snapshotId, proposalId: groups.proposals[0].proposalId };
    expect(validateCloseProposal(snapshot, args).valid).toBe(true);
    expect(validateCloseProposal({ ...snapshot, closePairProposals: buildCloseProposalSnapshot({ ...input, asOf: input.asOf + 1 }) }, args).valid).toBe(false);
    expect(validateCloseProposal({ ...snapshot, holdings: snapshot.holdings.slice(0, 1) }, args).valid).toBe(false);
    expect(validateCloseProposal({ ...snapshot, generatedAt: '2020-01-01T00:00:00.000Z' }, args).valid).toBe(false);
    expect(validateCloseProposal(snapshot, { ...args, proposalId: '0'.repeat(64) }).valid).toBe(false);
    expect(validateCloseProposal(snapshot, args).limitations.join(' ')).toContain('cache');
    const noTimestamp = buildCloseProposalSnapshot({ ...input, quotes: { ...input.quotes, LOSS: { ...input.quotes.LOSS, marketTimestamp: null } } });
    expect(validateCloseProposal({ ...snapshot, closePairProposals: noTimestamp }, { snapshotId: noTimestamp.snapshotId, proposalId: noTimestamp.proposals[0].proposalId }).errors.join(' ')).toContain('timestamps');
  });
});
