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
  it.each([-1, Infinity, NaN, 0.00001, 1_000_000_001])('rejects invalid or unsupported quantities %s', quantity => {
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
  it('requires cost but preserves an unknown acquisition date for snapshot baselines', () => {
    expect(buildScreenshotSyncPlan(input({ rows: [{ ...input().rows[0], averageCostUsd: null }] }), []).blocked[0].reason).toBe('missing_cost');
    expect(buildScreenshotSyncPlan(input({ rows: [{ ...input().rows[0], acquiredOn: null }] }), []).changes[0].acquiredOn).toBeNull();
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
  it('reconciles quantity and cost changes without fabricating trades', () => {
    const quantityChange = buildScreenshotSyncPlan(input(), [position({ quantity: 2 })]);
    expect(quantityChange.canApply).toBe(true);
    expect(quantityChange.changes[0]).toMatchObject({ kind: 'reconcile', previousQuantity: 2, quantity: 1.25 });
    expect(buildScreenshotSyncPlan(input(), [position({ entryPrice: 101 })]).changes[0]).toMatchObject({ previousAverageCostUsd: 101, averageCostUsd: 100 });
    expect(buildScreenshotSyncPlan(input(), [position({ quantity: 0 })]).changes[0].kind).toBe('reconcile');
  });
  it('closes only explicit zero balances and no-ops absent zero rows', () => {
    const zero = input({ rows: [{ ...input().rows[0], quantity: 0, averageCostUsd: null }] });
    expect(buildScreenshotSyncPlan(zero, [position()]).changes[0]).toMatchObject({ kind: 'close', quantity: 0, averageCostUsd: 0 });
    expect(buildScreenshotSyncPlan(zero, []).canApply).toBe(false);
  });
  it('blocks old observations when any consolidated ledger has a newer event', () => {
    const later = position({ lots: [{ type: 'BUY', quantity: 2, price: 100, executedAt: '2026-01-02', hasCommission: false, commissionAmount: 0 }] });
    expect(buildScreenshotSyncPlan(input(), [later]).blocked[0].reason).toBe('observation_precedes_recorded_events');
  });
  it('rejects a screenshot before a legacy opening without lots', () => {
    expect(buildScreenshotSyncPlan(input(), [position({ entryDate: '2026-02-01' })]).blocked[0].reason).toBe('observation_precedes_recorded_events');
  });
  it('does not reuse an unknown cost when changing an existing quantity', () => {
    const missing = input({ rows: [{ ...input().rows[0], quantity: 5, averageCostUsd: null }] });
    expect(buildScreenshotSyncPlan(missing, [position()]).blocked[0].reason).toBe('missing_cost');
  });
  it('can repair an unknown original basis date without changing quantity or cost', () => {
    const existing = position({ lots: [{ type: 'RECONCILE', quantity: 1.25, price: 100, executedAt: '2025-12-01', basisAcquiredOn: null, hasCommission: false, commissionAmount: 0 }] });
    const plan = buildScreenshotSyncPlan(input(), [existing]);
    expect(plan.canApply).toBe(true);
    expect(plan.changes[0]).toMatchObject({ kind: 'reconcile', acquiredOn: '2025-01-01' });
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
