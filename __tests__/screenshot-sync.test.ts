import { describe, expect, it } from 'vitest';
import { buildScreenshotSyncPlan, screenshotSyncInputSchema, type ScreenshotSyncInput } from '@/lib/screenshot-sync';
import type { Position } from '@/types';
const input = (overrides: Partial<ScreenshotSyncInput> = {}): ScreenshotSyncInput => ({ location: 'bank_one', observedAt: '2026-01-01', rows: [{ symbol: 'AAPL', quantity: 1.25, averageCostUsd: 100, acquiredOn: '2025-01-01' }], ...overrides });
const position = (overrides: Partial<Position> = {}): Position => ({ symbol: 'AAPL', quantity: 1.25, entryPrice: 100, entryDate: '2025-01-01', location: 'bank_one', display: 'Apple', imageUrl: '', ...overrides });
describe('screenshot synchronization boundaries', () => {
  it('normalizes symbols and preserves fractional quantities', () => {
    const parsed = screenshotSyncInputSchema.parse(input({ rows: [{ ...input().rows[0], symbol: ' aapl ' }] }));
    expect(parsed.rows[0].symbol).toBe('AAPL');
    expect(buildScreenshotSyncPlan(parsed, []).changes[0].quantity).toBe(1.25);
  });
  it.each([0, -1, Infinity, NaN, 0.00001, 1_000_000_001])('rejects invalid or unsupported quantities %s', quantity => {
    expect(screenshotSyncInputSchema.safeParse(input({ rows: [{ ...input().rows[0], quantity }] })).success).toBe(false);
  });
  it('rejects ambiguous symbols, duplicate symbols and unexpected ownership fields', () => {
    expect(screenshotSyncInputSchema.safeParse({ ...input(), userId: 'another-owner' }).success).toBe(false);
    expect(screenshotSyncInputSchema.safeParse(input({ rows: [input().rows[0], { ...input().rows[0], symbol: 'aapl' }] })).success).toBe(false);
    expect(screenshotSyncInputSchema.safeParse(input({ rows: [{ ...input().rows[0], symbol: 'Apple Inc' }] })).success).toBe(false);
  });
  it.each(['2025-02-29', '2026-13-01', '2026-1-01', '2099-01-01'])('rejects invalid observation date %s', observedAt => {
    expect(screenshotSyncInputSchema.safeParse(input({ observedAt })).success).toBe(false);
  });
  it('rejects acquisition dates after the observed snapshot', () => {
    expect(screenshotSyncInputSchema.safeParse(input({ rows: [{ ...input().rows[0], acquiredOn: '2026-01-02' }] })).success).toBe(false);
  });
  it('requires both cost and explicit acquisition date for new holdings', () => {
    expect(buildScreenshotSyncPlan(input({ rows: [{ ...input().rows[0], averageCostUsd: null }] }), []).blocked[0].reason).toBe('missing_cost');
    expect(buildScreenshotSyncPlan(input({ rows: [{ ...input().rows[0], acquiredOn: null }] }), []).blocked[0].reason).toBe('missing_acquisition_date');
  });
  it('does not change matched positions or rows missing from a partial screenshot', () => {
    const plan = buildScreenshotSyncPlan(input(), [position(), position({ symbol: 'MSFT', quantity: 7 })]);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.changes).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
  it('keeps brokerage accounts isolated', () => {
    expect(buildScreenshotSyncPlan(input(), [position({ location: 'bank_two' })]).canApply).toBe(true);
  });
  it('blocks quantity or cost discrepancies rather than inventing buy/sell executions', () => {
    expect(buildScreenshotSyncPlan(input(), [position({ quantity: 2 })]).blocked[0].reason).toBe('existing_position_differs');
    expect(buildScreenshotSyncPlan(input(), [position({ entryPrice: 101 })]).canApply).toBe(false);
    expect(buildScreenshotSyncPlan(input(), [position({ quantity: 0 })]).changes).toEqual([]);
  });
  it('uses FIFO remaining cost and commissions instead of stale position fields', () => {
    const existing = position({ quantity: 999, entryPrice: 999, lots: [
      { type: 'BUY', quantity: 2, price: 99, executedAt: '2025-01-01', hasCommission: true, commissionAmount: 2 },
      { type: 'SELL', quantity: 0.75, price: 120, executedAt: '2025-02-01', hasCommission: false, commissionAmount: 0 },
    ] });
    expect(buildScreenshotSyncPlan(input(), [existing]).unchanged).toHaveLength(1);
  });
  it('aggregates consolidated ledgers for no-op matches without modifying them', () => {
    expect(buildScreenshotSyncPlan(input(), [position({ quantity: 1 }), position({ quantity: 0.25 })]).unchanged).toHaveLength(1);
  });
  it('never permits partial application while an unresolved row remains', () => {
    const plan = buildScreenshotSyncPlan(input({ rows: [...input().rows, { symbol: 'MSFT', quantity: 2, averageCostUsd: null, acquiredOn: null }] }), []);
    expect(plan.changes).toHaveLength(1);
    expect(plan.canApply).toBe(false);
  });
  it('accepts absent screenshot cost only for an unchanged existing quantity', () => {
    expect(buildScreenshotSyncPlan(input({ rows: [{ ...input().rows[0], averageCostUsd: null, acquiredOn: null }] }), [position()]).unchanged).toHaveLength(1);
  });
});
