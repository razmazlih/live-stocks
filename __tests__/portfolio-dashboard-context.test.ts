import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ from: vi.fn(), candles: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  requireApiPrincipal: async () => ({ userId: 'auth0|test-user', supabase: { from: mocks.from } }),
  authenticationResponse: () => null,
  PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
}));
vi.mock('@/lib/auth/credentials', () => ({ readFinnhubCredential: async () => 'secret-do-not-export' }));
vi.mock('@/lib/services/exchange-rate', () => ({ getUsdToIlsRate: async () => 3.7 }));
vi.mock('@/lib/services/finnhub-cache', () => ({ resolveFinnhubToken: async () => 'token', fetchFinnhubQuoteCached: async () => ({ c: 120, d: 2 }), FinnhubConfigError: class extends Error {} }));
vi.mock('@/lib/services/yahoo-candles', () => ({ fetchYahooCandlesData: mocks.candles }));
import { GET } from '@/app/api/portfolio/dashboard/route';

const day = (date: number) => Date.UTC(2026, 10, date);
let lots: { id: string; side: 'BUY' | 'SELL'; quantity: number; price: number; executed_at: string; has_commission: boolean; commission_amount: number }[];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T20:00:00Z'));
  lots = [{ id: 'buy', side: 'BUY', quantity: 2, price: 100, executed_at: '2026-11-12T12:00:00Z', has_commission: false, commission_amount: 0 }];
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ order: async () => ({
      data: [{ id: 'one', symbol: 'TEST', display: 'Test', location: 'bank_one', quantity: 2, entry_price: 100, entry_date: '2026-11-12', position_lots: lots }], error: null,
    }) }) }),
  }));
  mocks.candles.mockImplementation(async (symbol: string) => ({ s: 'ok', t: [4, 5, 11, 12, 13].map(date => (day(date) + 14 * 3600000) / 1000), c: symbol === 'TEST' ? [80, 90, 105, 110, 999] : [3.7, 3.7, 3.7, 3.7, 3.7] }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('dashboard pre-entry chart context', () => {
  it('fetches a week of real context once, without adding it to activation candles', async () => {
    const response = await GET(new NextRequest('http://localhost/api/portfolio/dashboard'));
    const body = await response.json();
    const key = body.activationPositions[0].activationId;
    expect(body.contextCandlesByKey[key].map((point: { close: number }) => point.close)).toEqual([90, 105, 110]);
    expect(body.candlesByKey[key].map((point: { close: number }) => point.close)).not.toContain(90);
    expect(body.candlesByKey[key].map((point: { close: number }) => point.close)).not.toContain(105);
    const requests = mocks.candles.mock.calls.filter(([symbol]) => symbol === 'TEST');
    expect(requests).toHaveLength(1);
    expect(requests[0][1]).toBe(day(5) / 1000);
  });

  it('caps closed-cycle context at its exit day', async () => {
    lots = [
      { ...lots[0], executed_at: '2026-11-10T12:00:00Z' },
      { ...lots[0], id: 'sell', side: 'SELL', executed_at: '2026-11-11T12:00:00Z' },
    ];
    const response = await GET(new NextRequest('http://localhost/api/portfolio/dashboard'));
    const body = await response.json();
    const key = body.activationPositions[0].activationId;
    expect(body.contextCandlesByKey[key].every((point: { timestamp: number }) => point.timestamp < day(12))).toBe(true);
    expect(body.candlesByKey[key].map((point: { close: number }) => point.close)).toEqual([105]);
  });
});

it('returns core values without waiting for holding charts or the benchmark', async () => {
  const response = await GET(new NextRequest('http://localhost/api/portfolio/dashboard?part=core'));
  expect(await response.json()).toMatchObject({ deferredHistory: true, quotes: { TEST: { c: 120 } }, candlesByKey: {} });
  expect(mocks.candles.mock.calls.map(([symbol]) => symbol)).toEqual(['ILS=X']);
  mocks.candles.mockClear();
  const history = await GET(new NextRequest('http://localhost/api/portfolio/dashboard?part=history'));
  expect(await history.json()).toHaveProperty('spyPoints');
  expect(mocks.candles.mock.calls.map(([symbol]) => symbol).sort()).toEqual(['SPY', 'TEST']);
});
