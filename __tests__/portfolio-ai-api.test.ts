import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), quote: vi.fn(), fx: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/services/finnhub', () => ({ fetchFinnhubQuote: mocks.quote }));
vi.mock('@/lib/services/exchange-rate', () => ({ fetchExchangeRateResponse: mocks.fx, extractExchangeRate: (data: { rates: { ILS: number } }) => data.rates.ILS }));
vi.mock('@/lib/services/yahoo-candles', () => ({ fetchYahooCandlesData: vi.fn().mockResolvedValue({ c: [], t: [], s: 'ok' }) }));
import { GET } from '@/app/api/portfolio/ai/route';

const rows: Record<string, unknown[]> = {};
beforeEach(() => {
  vi.clearAllMocks();
  rows.positions = [{ id: 'p1', symbol: 'ABC', display: 'ABC', quantity: 2, entry_price: 100, entry_date: '2025-01-01', location: 'bank_one' }];
  rows.position_lots = [{ id: 'l1', position_id: 'p1', side: 'BUY', price: 100, quantity: 2, executed_at: '2025-01-01', has_commission: false, commission_amount: 0 }];
  rows.position_plans = [{ id: 'plan1', position_id: null, symbol: 'XYZ', side: 'buy', target_price: 50, target_quantity: 3, target_date: '2027-01-01', status: 'pending' }];
  rows.settings = [{ annual_growth_rate: 0.1, currency: 'ILS', finnhub_token: 'secret-do-not-export' }];
  mocks.from.mockImplementation((table: string) => ({ select: () => ({ order: () => ({ range: async (start: number, end: number) => ({ data: rows[table].slice(start, end + 1), error: null }) }) }) }));
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
    expect(data.quotes.ABC.marketTimestamp).toBeTruthy();
    expect(JSON.stringify(data)).not.toContain('secret-do-not-export');
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
  });
  it('fails explicitly when a required table cannot be read', async () => {
    mocks.from.mockImplementation(() => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'denied' } }) }) }) }));
    expect((await GET()).status).toBe(500);
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
    expect(data.goals.symbolTargets).toBeNull();
    expect(data.summary.totalProjectedPnLUsd).toBeNull();
    expect(data.realized.totals.expectedProfitUsd).toBeNull();
  });
});
