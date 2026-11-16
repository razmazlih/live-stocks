// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { Principal } from '@/lib/auth/server';
import { prepareChatScreenshotSync, reviewChatScreenshotSync, confirmChatScreenshotSync, cancelChatScreenshotSync, SyncScopeRequiredError } from '@/lib/chat-screenshot-sync';
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
describe('ChatGPT-scoped screenshot proposals', () => {
  it('requires explicit signed sync capability before preparation or confirmation', async () => {
    await expect(prepareChatScreenshotSync({ ...principal, portfolioSync: false }, input)).rejects.toBeInstanceOf(SyncScopeRequiredError);
    await expect(confirmChatScreenshotSync({ ...principal, portfolioSync: false }, { proposalId: id, confirmationSecret: secret })).rejects.toBeInstanceOf(SyncScopeRequiredError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('returns immutable review with its capability only in host-private metadata', async () => {
    const result = await prepareChatScreenshotSync(principal, input);
    expect(result.value).toMatchObject({ status: 'pending', plan: { canApply: true, sourceName: 'בית השקעות אישי' } });
    expect(result.meta?.confirmationSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result.value)).not.toContain(result.meta!.confirmationSecret);
    expect(JSON.stringify(result.value)).not.toContain('reviewUrl');
    expect(rpc).toHaveBeenLastCalledWith('create_chat_sync_proposal', expect.objectContaining({ p_expected: 'a'.repeat(32), p_rows: [expect.objectContaining({ symbol: 'AAPL', quantity: 2, acquiredOn: null, estimatedAcquiredOn: null })], p_confirmation_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_previous_id: null }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.meta!.confirmationSecret);
  });
  it('does not persist blocked or unchanged drafts or issue a confirmation capability', async () => {
    const result = await prepareChatScreenshotSync(principal, { ...input, rows: [{ ...input.rows[0], averageCostUsd: null }] });
    expect(result.value.status).toBe('needs_details'); expect(result.meta).toBeUndefined();
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['screenshot_sync_snapshot', 'supersede_pending_chat_sync_proposals']);
    expect(rpc).toHaveBeenLastCalledWith('supersede_pending_chat_sync_proposals', { p_previous_id: null });
  });
  it('invalidates a previous pending card even if the correction is incomplete', async () => {
    await prepareChatScreenshotSync(principal, { ...input, previousProposalId: id, rows: [{ ...input.rows[0], averageCostUsd: null }] });
    expect(rpc).toHaveBeenLastCalledWith('supersede_pending_chat_sync_proposals', { p_previous_id: id });
    expect(rpc.mock.calls.some(call => call[0] === 'create_chat_sync_proposal')).toBe(false);
  });
  it('invalidates pending cards for an unchanged correction without a model-supplied previous ID', async () => {
    const result = await prepareChatScreenshotSync(principal, { ...input, rows: [{ ...input.rows[0], quantity: 0, averageCostUsd: null }] });
    expect(result.value.status).toBe('unchanged');
    expect(result.meta).toBeUndefined();
    expect(rpc).toHaveBeenLastCalledWith('supersede_pending_chat_sync_proposals', { p_previous_id: null });
    expect(rpc.mock.calls.some(call => call[0] === 'create_chat_sync_proposal')).toBe(false);
  });
  it('does not report a corrected draft successfully if invalidating older cards fails', async () => {
    rpc.mockImplementation(async name => name === 'screenshot_sync_snapshot'
      ? { data: { positions: [], lots: [], sources, fingerprint: 'a'.repeat(32) }, error: null }
      : { data: null, error: { message: 'private detail' } });
    await expect(prepareChatScreenshotSync(principal, { ...input, rows: [{ ...input.rows[0], averageCostUsd: null }] })).rejects.toThrow('ההצעה אינה זמינה');
  });
  it('passes previous proposal for atomic supersession, never appends an editable confirm payload', async () => {
    await prepareChatScreenshotSync(principal, { ...input, previousProposalId: id });
    expect(rpc).toHaveBeenLastCalledWith('create_chat_sync_proposal', expect.objectContaining({ p_previous_id: id }));
    await confirmChatScreenshotSync(principal, { proposalId: id, confirmationSecret: secret });
    expect(rpc).toHaveBeenLastCalledWith('confirm_chat_sync_proposal', { p_id: id, p_confirmation_secret: secret });
    await expect(confirmChatScreenshotSync(principal, { proposalId: id, confirmationSecret: secret, quantity: 99 })).rejects.toThrow();
    await expect(confirmChatScreenshotSync(principal, { proposalId: id, confirmationSecret: secret, confirmed: true })).rejects.toThrow();
  });
  it('reads the saved review rather than recalculating a different plan', async () => {
    const prepared = await prepareChatScreenshotSync(principal, input);
    const review = { input, plan: prepared.value.plan };
    rpc.mockClear().mockResolvedValueOnce({ data: { id, review, status: 'pending', expiresAt: '2026-11-16T12:00:00Z' }, error: null });
    expect(await reviewChatScreenshotSync(principal, { proposalId: id })).toMatchObject({ proposalId: id, plan: prepared.value.plan });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('read_chat_sync_proposal', { p_id: id });
  });
  it('requires an MCP session and treats storage errors generically', async () => {
    await expect(prepareChatScreenshotSync({ ...principal, kind: 'web' }, input)).rejects.toThrow();
    await expect(prepareChatScreenshotSync({ ...principal, authSessionId: undefined }, input)).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: null, error: { details: 'private database detail' } });
    await expect(prepareChatScreenshotSync(principal, input)).rejects.toThrow('ההצעה אינה זמינה');
  });
  it('cancels only an existing owner/session-bound proposal through its private capability', async () => {
    const prepared = await prepareChatScreenshotSync(principal, input);
    rpc.mockResolvedValueOnce({ data: { id, review: { input, plan: prepared.value.plan }, status: 'cancelled', expiresAt: '2026-11-16T12:00:00Z' }, error: null });
    expect(await cancelChatScreenshotSync(principal, { proposalId: id, confirmationSecret: secret })).toMatchObject({ proposalId: id, status: 'cancelled' });
    expect(rpc).toHaveBeenLastCalledWith('cancel_chat_sync_proposal', { p_id: id, p_confirmation_secret: secret });
  });
  it('never saves a proposal for an absent or archived source', async () => {
    await expect(prepareChatScreenshotSync(principal, { ...input, location: '10000000-0000-4000-8000-000000000003' })).rejects.toThrow('מקור השקעה פעיל');
    expect(rpc.mock.calls.some(call => call[0] === 'create_chat_sync_proposal')).toBe(false);
    rpc.mockResolvedValueOnce({ data: { positions: [], lots: [], sources: [{ ...sources[0], archived_at: '2026-01-01' }], fingerprint: 'a'.repeat(32) }, error: null });
    await expect(prepareChatScreenshotSync(principal, input)).rejects.toThrow('מקור השקעה פעיל');
  });

});
