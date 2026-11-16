// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/yahoo-candles', () => ({ fetchYahooCandlesData: vi.fn() }));
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import { findPurchaseDateCandidates, purchaseDateCandidatesInputSchema } from '@/lib/purchase-date-candidates';
const fetchCandles = vi.mocked(fetchYahooCandlesData);
const input = { symbol: 'AAPL', priceUsd: 100 };
const bar = (date: string, low = 99, high = 101, close = 100) => ({ timestamp: Date.parse(`${date}T14:30:00Z`) / 1000, low, high, close });
function bars(entries: ReturnType<typeof bar>[]) {
  return { s: 'ok', t: entries.map(b => b.timestamp), l: entries.map(b => b.low), h: entries.map(b => b.high), c: entries.map(b => b.close), o: entries.map(b => b.close), v: entries.map(() => 100) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-16T10:00:00Z')); fetchCandles.mockReset(); });
afterEach(() => { vi.useRealTimers(); });
describe('possible purchase-date search', () => {
  it('returns the latest five matching trading days without claiming an actual purchase', async () => {
    fetchCandles.mockResolvedValue(bars(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map(date => bar(date))));
    const result = await findPurchaseDateCandidates(input);
    expect(result.status).toBe('matched');
    expect(result.latestCandidateDate).toBe('2026-11-06');
    expect(result.candidates).toHaveLength(5);
    expect(result).toMatchObject({ estimated: true, canVerifyAcquisition: false, tolerancePercent: 0.5 });
    expect(result.warnings.join(' ')).toMatch(/splits/);
  });
  it('filters current-day, future, and out-of-range provider data', async () => {
    fetchCandles.mockResolvedValue(bars([bar('2026-11-17'), bar('2026-11-16'), bar('2020-01-01'), bar('2026-11-15')]));
    const result = await findPurchaseDateCandidates(input);
    expect(result.candidates.map(candidate => candidate.date)).toEqual(['2026-11-15']);
    expect(result.searchedThrough).toBe('2026-11-15');
  });
  it('separates range containment from nearby tolerance matches', async () => {
    fetchCandles.mockResolvedValue(bars([bar('2026-11-15', 100.4, 101, 100.5), bar('2026-11-14', 100.6, 101, 100.7), bar('2026-11-13')]));
    const result = await findPurchaseDateCandidates(input);
    expect(result.candidates.map(candidate => candidate.date)).toEqual(['2026-11-15', '2026-11-13']);
    expect(result.candidates[0].rangeContainsPrice).toBe(false);
    expect(result.candidates[1].rangeContainsPrice).toBe(true);
  });
  it('returns explicit no-match with valid data and never invents a date', async () => {
    fetchCandles.mockResolvedValue(bars([bar('2026-11-15', 200, 210, 205)]));
    expect(await findPurchaseDateCandidates(input)).toMatchObject({ status: 'no_match', latestCandidateDate: null, candidates: [] });
  });
  it('reports unavailable on provider failures or malformed bars', async () => {
    fetchCandles.mockRejectedValueOnce(new Error('private provider details'));
    expect(await findPurchaseDateCandidates(input)).toMatchObject({ status: 'unavailable', candidates: [] });
    fetchCandles.mockResolvedValue(bars([bar('2026-11-15', -1, 100), bar('2026-11-14', 101, 99), bar('2026-11-13', 99, 101, NaN)]));
    expect((await findPurchaseDateCandidates(input)).status).toBe('unavailable');
  });
  it('returns unavailable at the eight-second deadline when the provider never responds', async () => {
    fetchCandles.mockImplementation(() => new Promise(() => {}));
    const pending = findPurchaseDateCandidates(input);
    await vi.advanceTimersByTimeAsync(7999);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: 'unavailable', latestCandidateDate: null, candidates: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('normalizes symbol, bounds history and sends no private target price to the provider', async () => {
    fetchCandles.mockResolvedValue(bars([bar('2026-11-15')]));
    await findPurchaseDateCandidates({ ...input, symbol: ' aapl ', lookbackDays: 1825 });
    expect(fetchCandles).toHaveBeenCalledExactlyOnceWith('AAPL', expect.any(Number), Date.parse('2026-11-15T23:59:59Z') / 1000, 'D');
    const [, from, to] = fetchCandles.mock.calls[0];
    expect(to - from).toBe(1825 * 86400 - 1);
  });
  it.each([{ ...input, lookbackDays: 1826 }, { ...input, lookbackDays: 0 }, { ...input, priceUsd: 0 }, { ...input, priceUsd: Infinity }, { ...input, symbol: 'Apple Inc' }, { ...input, userId: 'other' }])('rejects invalid bounds or unrecognized fields', invalid => {
    expect(purchaseDateCandidatesInputSchema.safeParse(invalid).success).toBe(false);
  });
  it('bounds suggestions at or before the screenshot observation date', async () => {
    fetchCandles.mockResolvedValue(bars([bar('2026-11-15'), bar('2026-11-10'), bar('2026-11-09')]));
    const result = await findPurchaseDateCandidates({ ...input, throughDate: '2026-11-10' });
    expect(result.searchedThrough).toBe('2026-11-10');
    expect(result.latestCandidateDate).toBe('2026-11-10');
    expect(result.candidates.map(candidate => candidate.date)).toEqual(['2026-11-10', '2026-11-09']);
    expect(purchaseDateCandidatesInputSchema.safeParse({ ...input, throughDate: '2026-11-17' }).success).toBe(false);
    expect(purchaseDateCandidatesInputSchema.safeParse({ ...input, throughDate: '2026-02-30' }).success).toBe(false);
  });
  it('deduplicates matching dates', async () => {
    fetchCandles.mockResolvedValue(bars([bar('2026-11-15'), bar('2026-11-15')]));
    expect((await findPurchaseDateCandidates(input)).candidates).toHaveLength(1);
  });
});
