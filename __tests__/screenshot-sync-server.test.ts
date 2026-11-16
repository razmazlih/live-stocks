// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/better-auth-config', () => ({ betterAuthConfiguration: () => ({ secret: 'test-secret-that-is-at-least-thirty-two-characters', origin: 'https://example.test' }) }));
import { reviseScreenshotDates, suggestScreenshotDate, prepareScreenshotSync, openScreenshotProposal, applyScreenshotSync, reviewScreenshotSync } from '@/lib/screenshot-sync-server';
vi.mock('@/lib/purchase-date-candidates', () => ({ findPurchaseDateCandidates: vi.fn(async () => ({ status: 'matched', estimated: true, canVerifyAcquisition: false, latestCandidateDate: '2025-10-01' })) }));
import { findPurchaseDateCandidates } from '@/lib/purchase-date-candidates';
import type { Principal } from '@/lib/auth/server';
const rpc = vi.fn();
const principal = { userId: 'owner-one', kind: 'mcp', supabase: { rpc } } as unknown as Principal;
const web = { ...principal, kind: 'web' } as Principal;
const input = { location: 'bank_one', observedAt: '2026-01-01', rows: [{ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, acquiredOn: '2025-01-01' }] };
function token(url: string) { return new URL(url).hash.slice(1); }
beforeEach(() => { vi.useRealTimers(); rpc.mockReset(); rpc.mockResolvedValue({ data: { positions: [], lots: [], fingerprint: 'a'.repeat(32) }, error: null }); });
describe('owner-bound screenshot proposal', () => {
  it('only reads during preparation and hides private input in encrypted fragment', async () => {
    const proposal = await prepareScreenshotSync(principal, input);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('screenshot_sync_snapshot');
    expect(proposal.plan.canApply).toBe(true);
    expect(new URL(proposal.reviewUrl).search).toBe('');
    expect(proposal.reviewUrl).not.toContain('AAPL');
    expect(openScreenshotProposal(token(proposal.reviewUrl), 'owner-one').input).toEqual(input);
  });
  it('rejects wrong owner, tampering and expiry', async () => {
    const proposal = await prepareScreenshotSync(principal, input), value = token(proposal.reviewUrl);
    expect(() => openScreenshotProposal(value, 'owner-two')).toThrow();
    expect(() => openScreenshotProposal(`Z${value.slice(1)}`, 'owner-one')).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(() => openScreenshotProposal(value, 'owner-one')).toThrow();
    vi.useRealTimers();
  });
  it('never permits MCP apply and supplies sealed exact rows only to the website transaction', async () => {
    const value = token((await prepareScreenshotSync(principal, input)).reviewUrl);
    await expect(applyScreenshotSync(principal, value)).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { applied: true }, error: null });
    await expect(applyScreenshotSync(web, value)).resolves.toEqual({ applied: true });
    expect(rpc).toHaveBeenLastCalledWith('apply_screenshot_sync', { p_expected: 'a'.repeat(32), p_rows: [expect.objectContaining({ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, location: 'bank_one', lotId: expect.any(String) })] });
  });
  it('revises owner-bound dates without converting a price estimate into an actual acquisition', async () => {
    const value = token((await prepareScreenshotSync(principal, input)).reviewUrl);
    const changed = await reviseScreenshotDates(web, value, [{ symbol: 'AAPL', acquiredOn: null, estimatedAcquiredOn: '2025-10-01' }]);
    const sealed = openScreenshotProposal(changed.token, principal.userId);
    expect(sealed.input.rows[0]).toMatchObject({ acquiredOn: null, estimatedAcquiredOn: '2025-10-01' });
    await expect(reviseScreenshotDates(web, value, [{ symbol: 'MSFT', acquiredOn: '2025-10-01' }])).rejects.toThrow();
    await expect(reviseScreenshotDates(web, value, [{ symbol: 'AAPL', acquiredOn: '2025-10-01', estimatedAcquiredOn: '2025-09-01' }])).rejects.toThrow();
  });
  it('keeps private date lookup scoped to token symbols and observation date', async () => {
    const value = token((await prepareScreenshotSync(principal, input)).reviewUrl);
    await expect(suggestScreenshotDate(web, value, 'AAPL')).resolves.toMatchObject({ estimated: true, canVerifyAcquisition: false });
    expect(findPurchaseDateCandidates).toHaveBeenCalledWith({ symbol: 'AAPL', priceUsd: 100, lookbackDays: 1825, throughDate: '2026-01-01' });
    await expect(suggestScreenshotDate(web, value, 'MSFT')).rejects.toThrow();
    await expect(suggestScreenshotDate({ ...web, userId: 'other' }, value, 'AAPL')).rejects.toThrow();
  });
  it('blocks incomplete proposals even when called directly and marks changed snapshots stale', async () => {
    const proposal = await prepareScreenshotSync(principal, { ...input, rows: [{ ...input.rows[0], averageCostUsd: null }] });
    await expect(applyScreenshotSync(web, token(proposal.reviewUrl))).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { positions: [], lots: [], fingerprint: 'b'.repeat(32) }, error: null });
    expect((await reviewScreenshotSync(web, token(proposal.reviewUrl))).stale).toBe(true);
  });
});
