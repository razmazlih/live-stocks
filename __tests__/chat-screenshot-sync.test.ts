// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ScreenshotReconciliationRetiredError } from '@/lib/screenshot-reconciliation-retired';
import type { Principal } from '@/lib/auth/server';
import { prepareChatScreenshotSync, reviewChatScreenshotSync, confirmChatScreenshotSync, cancelChatScreenshotSync, refreshedPortfolio } from '@/lib/chat-screenshot-sync';
const rpc = vi.fn();
const principal = { userId: 'owner', rawSubject: 'subject', kind: 'mcp', authSessionId: 'session', portfolioSync: true, supabase: { rpc } } as unknown as Principal;
const sources = [{ id: '10000000-0000-4000-8000-000000000001', name: 'בית השקעות אישי', archived_at: null, created_at: '2026-01-01', legacy_location: null }];
const input = { location: '10000000-0000-4000-8000-000000000001', observedAt: '2026-01-01', rows: [{ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, acquiredOn: null }] };
const id = '00000000-0000-4000-8000-000000000001', secret = 'a'.repeat(43);
beforeEach(() => {
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'screenshot_sync_snapshot') return { data: { positions: [], lots: [], sources, fingerprint: 'a'.repeat(32) }, error: null };
    if (name === 'create_chat_sync_proposal') return { data: { id: args.p_id, review: args.p_review, status: 'pending', expiresAt: new Date(Date.now() + 900000).toISOString() }, error: null };
    return { data: { applied: true }, error: null };
  });
});
describe('retired screenshot reconciliation and retained read-only portfolio refresh', () => {
  it('rejects preparation before reading or persisting any draft, even with old sync consent', async () => {
    await expect(prepareChatScreenshotSync(principal, input)).rejects.toBeInstanceOf(ScreenshotReconciliationRetiredError);
    await expect(prepareChatScreenshotSync({ ...principal, portfolioSync: false }, input)).rejects.toBeInstanceOf(ScreenshotReconciliationRetiredError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects confirmation of an old card before any write or optional refresh', async () => {
    await expect(confirmChatScreenshotSync(principal, { proposalId: id, confirmationSecret: secret })).rejects.toBeInstanceOf(ScreenshotReconciliationRetiredError);
    expect(rpc).not.toHaveBeenCalled();
  });
  const savedReview = { input, plan: { location: input.location, sourceName: sources[0].name, observedAt: input.observedAt, changes: [], unchanged: [], blocked: [], canApply: true } };
  it('keeps owner/session-bound historical reviews readable', async () => {
    rpc.mockResolvedValueOnce({ data: { id, review: savedReview, status: 'pending', expiresAt: '2026-11-16T12:00:00Z' }, error: null });
    expect(await reviewChatScreenshotSync(principal, { proposalId: id })).toMatchObject({ proposalId: id });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('read_chat_sync_proposal', { p_id: id });
  });
  it('allows cancellation of old proposals through the original private capability', async () => {
    rpc.mockResolvedValueOnce({ data: { id, review: savedReview, status: 'cancelled', expiresAt: '2026-11-16T12:00:00Z' }, error: null });
    expect(await cancelChatScreenshotSync(principal, { proposalId: id, confirmationSecret: secret })).toMatchObject({ status: 'cancelled' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('cancel_chat_sync_proposal', { p_id: id, p_confirmation_secret: secret });
  });
  it('preserves session checks on read/cancel and hides database failures', async () => {
    await expect(reviewChatScreenshotSync({ ...principal, kind: 'web' }, { proposalId: id })).rejects.toThrow();
    await expect(cancelChatScreenshotSync({ ...principal, authSessionId: undefined }, { proposalId: id, confirmationSecret: secret })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { details: 'private database detail' } });
    await expect(reviewChatScreenshotSync(principal, { proposalId: id })).rejects.toThrow('ההצעה אינה זמינה');
  });
  it('reads the complete saved portfolio in a read-only refresh, including untouched sources and excluding closed holdings', async () => {
    const secondSource = { ...sources[0], id: '10000000-0000-4000-8000-000000000002', name: 'חשבון נוסף' };
    rpc.mockResolvedValueOnce({ data: {
      sources: [...sources, secondSource],
      positions: [
        { id: 'p1', symbol: 'AAPL', location: sources[0].id, quantity: 99, entry_price: 999 },
        { id: 'p2', symbol: 'MSFT', location: secondSource.id, quantity: 3, entry_price: 250 },
        { id: 'p3', symbol: 'CLOSED', location: sources[0].id, quantity: 4, entry_price: 20 },
        { id: 'p4', symbol: 'UNKNOWN', location: secondSource.id, quantity: 1, entry_price: null },
      ],
      lots: [
        { id: 'l1', position_id: 'p1', side: 'RECONCILE', quantity: 2, price: 100, executed_at: '2026-01-01', has_commission: false, commission_amount: 0 },
        { id: 'l2', position_id: 'p3', side: 'RECONCILE', quantity: 0, price: 0, executed_at: '2026-01-01', has_commission: false, commission_amount: 0 },
      ],
    }, error: null });
    const result = ({ portfolio: await refreshedPortfolio(principal) });
    expect(result).toMatchObject({ portfolio: { status: 'available', holdings: [
      { symbol: 'AAPL', quantity: 2, averageCostUsd: 100, sourceName: sources[0].name, location: sources[0].id },
      { symbol: 'MSFT', quantity: 3, averageCostUsd: 250, sourceName: secondSource.name, location: secondSource.id },
      { symbol: 'UNKNOWN', quantity: 1, averageCostUsd: null, sourceName: secondSource.name, location: secondSource.id },
    ] } });
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['screenshot_sync_snapshot']);
    expect(result.portfolio.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('returns unavailable when the portfolio refresh fails without leaking database details', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
    const result = ({ portfolio: await refreshedPortfolio(principal) });
    expect(result).toMatchObject({ portfolio: { status: 'unavailable', holdings: [] } });
    expect(JSON.stringify(result)).not.toContain('private database detail');
  });
  it('distinguishes an empty saved portfolio from an unavailable portfolio', async () => {
    const result = ({ portfolio: await refreshedPortfolio(principal) });
    expect(result.portfolio).toMatchObject({ status: 'available', holdings: [] });
  });

  it('marks malformed stored quantities unavailable instead of silently dropping a holding', async () => {
    rpc.mockResolvedValueOnce({ data: {
      sources, positions: [{ id: 'p1', symbol: 'AAPL', location: sources[0].id, quantity: 'unknown', entry_price: 100 }], lots: [],
    }, error: null });
    const result = ({ portfolio: await refreshedPortfolio(principal) });
    expect(result).toMatchObject({ portfolio: { status: 'unavailable', holdings: [] } });
  });

  it('bounds the optional portfolio read to five seconds', async () => {
    vi.useFakeTimers();
    try {
      rpc.mockImplementationOnce(() => new Promise(() => {}));
      const confirmation = refreshedPortfolio(principal).then(portfolio => ({ portfolio }));
      let settled = false;
      void confirmation.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(4999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(confirmation).resolves.toMatchObject({ portfolio: { status: 'unavailable', holdings: [] } });
      expect(rpc.mock.calls.map(call => call[0])).toEqual(['screenshot_sync_snapshot']);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('clears the optional refresh deadline after an immediate successful read', async () => {
    vi.useFakeTimers();
    try {
      ({ portfolio: await refreshedPortfolio(principal) });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

});
