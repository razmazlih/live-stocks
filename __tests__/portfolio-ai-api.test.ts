import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), quote: vi.fn(), fx: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  requireApiPrincipal: async () => ({ userId: 'auth0|test-user', supabase: { from: mocks.from } }),
  authenticationResponse: () => null,
  PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
}));
vi.mock('@/lib/auth/credentials', () => ({ readFinnhubCredential: async () => 'secret-do-not-export' }));
vi.mock('@/lib/services/finnhub', () => ({ fetchFinnhubQuote: mocks.quote }));
vi.mock('@/lib/services/exchange-rate', () => ({ fetchExchangeRateResponse: mocks.fx, extractExchangeRate: (data: { rates: { ILS: number } }) => data.rates.ILS }));
vi.mock('@/lib/services/yahoo-candles', () => ({ fetchYahooCandlesData: vi.fn().mockResolvedValue({ c: [], t: [], s: 'ok' }) }));
vi.mock('next/cache', () => ({ unstable_cache: (load: () => Promise<unknown>) => load }));
let GET: typeof import('@/app/api/portfolio/ai/route').GET;

const rows: Record<string, unknown[]> = {};
beforeEach(async () => {
  vi.resetModules();
  ({ GET } = await import('@/app/api/portfolio/ai/route'));
  vi.clearAllMocks();
  rows.positions = [{ id: 'p1', symbol: 'ABC', display: 'ABC', quantity: 2, entry_price: 100, entry_date: '2025-01-01', location: 'bank_one' }];
  rows.position_lots = [{ id: 'l1', position_id: 'p1', side: 'BUY', price: 100, quantity: 2, executed_at: '2025-01-01', has_commission: false, commission_amount: 0 }];
  rows.position_plans = [{ id: 'plan1', position_id: null, symbol: 'XYZ', side: 'buy', target_price: 50, target_quantity: 3, target_date: '2027-01-01', status: 'pending' }];
  rows.settings = [{ annual_growth_rate: 0.1, currency: 'ILS', finnhub_token: 'secret-do-not-export' }];
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => ({ order: () => ({ range: async (start: number, end: number) => ({ data: rows[table].slice(start, end + 1), error: null }) }) }) }) }));
  mocks.quote.mockResolvedValue({ price: 120, dailyChange: 2, timestamp: 1793000000 });
  mocks.fx.mockResolvedValue({ rates: { ILS: 3.5 } });
});

describe('GET portfolio AI snapshot', () => {
  it('exports holdings, goals, standalone plans, provenance and no token', async () => {
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(data.holdings[0]).toMatchObject({ currentPriceUsd: 120, marketValueUsd: 240, allocationPercent: 100 });
    expect(data.goals.annualGrowthRatePercent).toBe(10);
    expect(data.goals.symbolTargets[0].requiredExitPrice).toBeGreaterThan(100);
    expect(data.plans[0]).toMatchObject({ symbol: 'XYZ', targetQuantity: 3, status: 'pending' });
    expect(data.positions[0].lots).toHaveLength(1);
    expect(data.closePairProposals.policy.maxLosers).toBe(3);
    expect(data.closePairOnlyProposals.policy.maxLosers).toBe(1);
    expect(data.closePairProposals.snapshotId).not.toBe(data.closePairOnlyProposals.snapshotId);
    expect(data.closePairProposals.availability).toBe('complete');
    expect(data.quotes.ABC.marketTimestamp).toBeTruthy();
    expect(JSON.stringify(data)).not.toContain('secret-do-not-export');
  });
  it('offers escaped HTML for browsing tools with the same complete snapshot', async () => {
    rows.positions[0] = { ...(rows.positions[0] as object), display: '<script>alert("x")</script>' };
    const response = await GET(new Request('https://example.com/api/portfolio/ai?format=html'));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('generatedAt');
    expect(html).toContain('realizedSales');
    expect(html).not.toContain('secret-do-not-export');
  });
  it('does not fabricate prices, full valuations or FX', async () => {
    mocks.quote.mockResolvedValue(null);
    mocks.fx.mockRejectedValue(new Error('offline'));
    const data = await (await GET()).json();
    expect(data.summary).toBeNull();
    expect(data.holdings[0].currentPriceUsd).toBeNull();
    expect(data.holdings[0].allocationPercent).toBeNull();
    expect(data.currencies.usdToIls).toBeNull();
    expect(data.realized.totals.profitIls).toBeNull();
    expect(data.dataQuality.completeMarketValuation).toBe(false);
    expect(data.closePairProposals.availability).toBe('partial');
    expect(data.closePairProposals.coverage.exclusions).toContainEqual({ symbol: 'ABC', reason: 'missing_or_invalid_quote' });
  });
  it('keeps USD valuation but omits historical ILS calculations when FX history is missing', async () => {
    const data = await (await GET()).json();
    expect(data.holdings[0].marketValueUsd).toBe(240);
    expect(data.holdings[0].unrealizedPnlUsd).toBe(40);
    expect(data.holdings[0].unrealizedPnlIls).toBeNull();
    expect(data.summary.totalCurrentPnLIls).toBeNull();
    expect(data.summary.totalProjectedPnLIls).toBeNull();
    expect(data.dataQuality.warnings.join(' ')).toContain('affected ILS calculations are omitted');
  });
  it('fails explicitly when a required table cannot be read', async () => {
    mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'denied' } }) }) }) }) }));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get('retry-after')).toBe('30');
    await GET();
    expect(mocks.from).toHaveBeenCalledTimes(8);
  });
  it('reads beyond the first page and deduplicates market requests', async () => {
    rows.positions = Array.from({ length: 501 }, (_, i) => ({ ...(rows.positions[0] as object), id: `p${i}` }));
    const data = await (await GET()).json();
    expect(data.positions).toHaveLength(501);
    expect(mocks.quote).toHaveBeenCalledTimes(2);
  });
  it('does not replace a missing user target with an invented goal', async () => {
    rows.settings = [];
    const data = await (await GET()).json();
    expect(data.goals.annualGrowthRate).toBeNull();
    expect(data.closePairProposals.availability).toBe('unavailable');
    expect(data.goals.symbolTargets).toBeNull();
    expect(data.summary.totalProjectedPnLUsd).toBeNull();
    expect(data.realized.totals.expectedProfitUsd).toBeNull();
  });
});
