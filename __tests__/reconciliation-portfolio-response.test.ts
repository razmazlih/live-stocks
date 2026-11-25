// @vitest-environment node
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ candles: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/server', () => ({ PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' } }));
vi.mock('@/lib/services/finnhub', () => ({ fetchFinnhubQuote: async () => ({ price: 120, dailyChange: 2 }) }));
vi.mock('@/lib/services/exchange-rate', () => ({ getUsdToIlsRate: async () => 3.5 }));
vi.mock('@/lib/services/yahoo-candles', () => ({ fetchYahooCandlesData: mocks.candles }));
import { buildPortfolioResponse } from '@/lib/server/portfolio-response';
import type { SupabaseClient } from '@supabase/supabase-js';
it('public account/widget response preserves market valuation and marks full accounting unavailable', async () => {
  mocks.candles.mockClear();
  mocks.candles.mockResolvedValue({ s: 'ok', t: [Date.UTC(2026, 0, 1) / 1000], c: [3.5] });
  const response = await buildPortfolioResponse({ supabase: {} as SupabaseClient, userId: 'owner', finnhubToken: null, includeTargetHistory: true, snapshot: {
    positions: [{ id: 'p', symbol: 'ABC', display: 'ABC', image_url: '', quantity: 2, entry_price: 100, entry_date: '2026-01-01', location: 'bank_one' }],
    position_lots: [
      { id: 'buy', position_id: 'p', side: 'BUY', quantity: 2, price: 100, executed_at: '2026-01-01', has_commission: false, commission_amount: 0 },
      { id: 'sync', position_id: 'p', side: 'RECONCILE', quantity: 3, price: 90, executed_at: '2026-11-01', basis_acquired_on: null, has_commission: false, commission_amount: 0 },
    ], settings: { annual_growth_rate: .1 },
  } });
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.summary).toMatchObject({ totalValue: 360, totalCost: 270, totalCurrentPnLUsd: null, totalNetPnLUsd: null, totalTaxesPaidUsd: null });
  expect(data.dataQuality).toMatchObject({ completeTransactionHistory: false, reconciledSymbols: ['ABC'] });
  expect(data.stocks[0]).toMatchObject({ quantity: 3, currentPnLUsd: 90, currentPnLIls: null });
  expect(data.targetHistory).toEqual([{ timestamp: Date.parse(data.timestamp), gapUsd: null, gapIls: null }]);
  expect(mocks.candles.mock.calls.map(([symbol]) => symbol)).toEqual(['ILS=X']);
});

it('loads FX back to a known original basis years before its observation date', async () => {
  mocks.candles.mockClear();
  mocks.candles.mockResolvedValue({ s: 'ok', t: [Date.UTC(2010, 2, 1) / 1000], c: [3] });
  const response = await buildPortfolioResponse({ supabase: {} as SupabaseClient, userId: 'owner', finnhubToken: null, snapshot: {
    positions: [{ id: 'p', symbol: 'ABC', display: 'ABC', image_url: '', quantity: 0, entry_price: 0, entry_date: '2026-11-01', location: 'bank_one' }],
    position_lots: [{ id: 'sync', position_id: 'p', side: 'RECONCILE', quantity: 3, price: 90, executed_at: '2026-11-01', basis_acquired_on: '2010-03-01', has_commission: false, commission_amount: 0 }], settings: { annual_growth_rate: .1 },
  } });
  expect(mocks.candles).toHaveBeenCalledWith('ILS=X', Date.UTC(2010, 2, 1) / 1000 - 10 * 86400, expect.any(Number), 'D');
  const data = await response.json();
  expect(data.stocks[0]).toMatchObject({ quantity: 3, currentPnLUsd: 90, currentPnLIls: 450 });
  expect(data.summary.totalNetPnLUsd).toBeNull();
});

it('account/widget response preserves valuation while unknown fees suppress complete costs and profits', async () => {
  mocks.candles.mockResolvedValue({ s: 'ok', t: [Date.UTC(2026, 0, 1) / 1000], c: [3.5] });
  const response = await buildPortfolioResponse({ supabase: {} as SupabaseClient, userId: 'owner', finnhubToken: null, snapshot: {
    positions: [{ id: 'p', symbol: 'ABC', display: 'ABC', image_url: '', quantity: 2, entry_price: 100, entry_date: '2026-01-01', location: 'bank_one' }],
    position_lots: [{ id: 'buy', position_id: 'p', side: 'BUY', quantity: 2, price: 100, executed_at: '2026-01-01', has_commission: false, commission_amount: 0, commission_known: false }],
    settings: { annual_growth_rate: .1 },
  } }, { includeWeightedPrice: true });
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.dataQuality).toMatchObject({ completeCommissionHistory: false, missingCommissionSymbols: ['ABC'] });
  expect(data.dataQuality.warnings.join(' ')).toContain('unknown, not zero');
  expect(data.summary).toMatchObject({ totalValue: 240, totalCost: null, totalCurrentPnLUsd: null, totalNetPnLUsd: null, totalTaxesPaidUsd: null });
  expect(data.stocks[0]).toMatchObject({ quantity: 2, currentPrice: 120, totalValueUsd: 240, entryPrice: null, currentPnLUsd: null, roiPercent: null });
  expect(data.stocks[0].pnlDelta.value).toBeNull();
  expect(data.weightedPrice).toBeUndefined();
});
