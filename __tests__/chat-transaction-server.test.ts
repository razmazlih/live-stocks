// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { Principal } from '@/lib/auth/server';
import { prepareChatTransaction, confirmChatTransaction, cancelChatTransaction, reviewChatTransaction, TransactionScopeRequiredError } from '@/lib/chat-transaction-server';
const rpc = vi.fn();
const principal = { userId: 'owner', rawSubject: 'subject', kind: 'mcp', authSessionId: 'session', portfolioSync: false, scopes: ['portfolio:read', 'portfolio:transactions'], supabase: { rpc } } as unknown as Principal;
const source = { id: '10000000-0000-4000-8000-000000000001', name: 'החשבון שלי', archived_at: null, created_at: '2026-01-01', legacy_location: null };
const input = { location: source.id, side: 'BUY', symbol: 'AAPL', quantity: 2, priceUsd: 100, executedOn: '2026-01-02', commissionUsd: null };
const id = '00000000-0000-4000-8000-000000000001', secret = 'a'.repeat(43);
beforeEach(() => {
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'screenshot_sync_snapshot') return { data: { positions: [], lots: [], sources: [source], fingerprint: 'a'.repeat(32) }, error: null };
    if (name === 'create_chat_transaction_proposal') return { data: { id: args.p_id, review: args.p_review, status: 'pending', expiresAt: new Date(Date.now() + 900000).toISOString() }, error: null };
    return { data: { applied: true }, error: null };
  });
});
describe('ChatGPT actual transaction proposal server', () => {
  it('requires separate transaction consent even when screenshot sync is granted', async () => {
    for (const scopes of [['portfolio:read'], ['portfolio:read', 'portfolio:sync']]) {
      await expect(prepareChatTransaction({ ...principal, portfolioSync: true, scopes }, input)).rejects.toBeInstanceOf(TransactionScopeRequiredError);
      await expect(confirmChatTransaction({ ...principal, scopes }, { proposalId: id, confirmationSecret: secret })).rejects.toBeInstanceOf(TransactionScopeRequiredError);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('prepares an exact immutable transaction without a financial write, with the capability only in hidden metadata', async () => {
    const result = await prepareChatTransaction(principal, input);
    expect(result.value).toMatchObject({ kind: 'transaction', status: 'pending', input, plan: { commissionKnown: false, sourceName: source.name, changes: [{ previousQuantity: 0, quantity: 2 }] } });
    expect(result.meta.confirmationSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result.value)).not.toContain(result.meta.confirmationSecret);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.meta.confirmationSecret);
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['screenshot_sync_snapshot', 'create_chat_transaction_proposal']);
    expect(rpc).toHaveBeenLastCalledWith('create_chat_transaction_proposal', expect.objectContaining({ p_expected: 'a'.repeat(32), p_input: input, p_confirmation_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
  it('uses only proposal identity and hidden capability to confirm, and reads the actually saved portfolio', async () => {
    expect(await confirmChatTransaction(principal, { proposalId: id, confirmationSecret: secret })).toMatchObject({ proposalId: id, kind: 'transaction', status: 'applied', portfolio: { status: 'available', holdings: [] } });
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['confirm_chat_transaction_proposal', 'screenshot_sync_snapshot']);
    expect(rpc).toHaveBeenCalledWith('confirm_chat_transaction_proposal', { p_id: id, p_confirmation_secret: secret });
    await expect(confirmChatTransaction(principal, { proposalId: id, confirmationSecret: secret, quantity: 99 })).rejects.toThrow();
    await expect(confirmChatTransaction(principal, { proposalId: id, confirmationSecret: secret, confirmed: true })).rejects.toThrow();
  });
  it('does not claim success or refresh after a failed confirmation', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private error' } });
    await expect(confirmChatTransaction(principal, { proposalId: id, confirmationSecret: secret })).rejects.toThrow('לא הצלחנו לפתוח');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps a confirmed write final when the optional saved-portfolio read fails', async () => {
    rpc.mockResolvedValueOnce({ data: { applied: true }, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'private' } });
    const result = await confirmChatTransaction(principal, { proposalId: id, confirmationSecret: secret });
    expect(result).toMatchObject({ status: 'applied', portfolio: { status: 'unavailable', holdings: [] } });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('reads and cancels the exact stored review, with no caller-editable transaction fields', async () => {
    const prepared = await prepareChatTransaction(principal, input);
    const saved = { id, review: { input, plan: prepared.value.plan }, status: 'cancelled', expiresAt: '2026-11-16T23:00:00Z' };
    rpc.mockResolvedValueOnce({ data: saved, error: null });
    expect(await cancelChatTransaction(principal, { proposalId: id, confirmationSecret: secret })).toMatchObject({ kind: 'transaction', status: 'cancelled', input });
    rpc.mockResolvedValueOnce({ data: saved, error: null });
    expect(await reviewChatTransaction(principal, { proposalId: id })).toMatchObject({ kind: 'transaction', plan: prepared.value.plan });
  });
  it('rejects web sessions, absent sources and archived sources before any proposal is created', async () => {
    await expect(prepareChatTransaction({ ...principal, kind: 'web' }, input)).rejects.toThrow();
    await expect(prepareChatTransaction(principal, { ...input, location: '10000000-0000-4000-8000-000000000002' })).rejects.toThrow('מקור השקעה פעיל');
    rpc.mockResolvedValueOnce({ data: { positions: [], lots: [], sources: [{ ...source, archived_at: '2026-01-01' }], fingerprint: 'a'.repeat(32) }, error: null });
    await expect(prepareChatTransaction(principal, input)).rejects.toThrow('מקור השקעה פעיל');
    expect(rpc.mock.calls.some(call => call[0] === 'create_chat_transaction_proposal')).toBe(false);
  });
});
