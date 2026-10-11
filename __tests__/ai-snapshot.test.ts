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
