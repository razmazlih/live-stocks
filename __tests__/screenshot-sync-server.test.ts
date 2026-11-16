// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/better-auth-config', () => ({ betterAuthConfiguration: () => ({ secret: 'test-secret-that-is-at-least-thirty-two-characters', origin: 'https://example.test' }) }));
import { prepareScreenshotSync, openScreenshotProposal, applyScreenshotSync, reviewScreenshotSync } from '@/lib/screenshot-sync-server';
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
  it('blocks incomplete proposals even when called directly and marks changed snapshots stale', async () => {
    const proposal = await prepareScreenshotSync(principal, { ...input, rows: [{ ...input.rows[0], acquiredOn: null }] });
    await expect(applyScreenshotSync(web, token(proposal.reviewUrl))).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { positions: [], lots: [], fingerprint: 'b'.repeat(32) }, error: null });
    expect((await reviewScreenshotSync(web, token(proposal.reviewUrl))).stale).toBe(true);
  });
});
