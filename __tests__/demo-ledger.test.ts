import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoFetch, DEMO_LEDGER_KEY, readDemoLedger, localDemoDashboard } from '@/lib/demo/ledger';
import { DEMO_SOURCE_ID, DEMO_USER_ID } from '@/lib/demo/data';
import { configureSupabaseUser, getSupabaseClient, resetSupabaseClient } from '@/lib/supabase';

const base = 'http://localhost:3001/api/local-demo/rest/v1/';
const purchase = (overrides: Record<string, unknown> = {}) => ({
  p_request_id: crypto.randomUUID(), p_symbol: 'AMD', p_display: 'Advanced Micro Devices', p_image_url: '',
  p_location: DEMO_SOURCE_ID, p_price: 100, p_quantity: 5, p_executed_at: '2026-11-01',
  p_has_commission: true, p_commission_amount: 1, ...overrides,
});
const request = (path: string, method = 'GET', body?: unknown, guard = () => undefined) =>
  createDemoFetch(guard)(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeEach(() => { localStorage.clear(); resetSupabaseClient(); vi.stubEnv('NODE_ENV', 'development'); });
afterEach(() => { resetSupabaseClient(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('persistent isolated demo ledger', () => {
  it('creates a position with its opening purchase, persists it, and reuses an idempotent request', async () => {
    const input = purchase();
    const response = await request('rpc/record_position_purchase', 'POST', input);
    expect(response.ok).toBe(true);
    const [receipt] = await response.json();
    expect(receipt).toEqual(expect.objectContaining({ position_id: expect.any(String), lot_id: expect.any(String), reused: false }));
    expect(readDemoLedger().positions).toHaveLength(4);
    expect(readDemoLedger().position_lots.filter(row => row.position_id === receipt.position_id)).toHaveLength(1);
    const persisted = localStorage.getItem(DEMO_LEDGER_KEY);
    expect(persisted).toContain('AMD');
    const again = await request('rpc/record_position_purchase', 'POST', input);
    expect(again.ok).toBe(true);
    expect((await again.json())[0]).toEqual(expect.objectContaining({ position_id: receipt.position_id, lot_id: receipt.lot_id }));
    expect(readDemoLedger().position_lots.filter(row => row.position_id === receipt.position_id)).toHaveLength(1);
    expect(localDemoDashboard().positions.some(row => row.symbol === 'AMD' && row.quantity === 5)).toBe(true);
    const loaded = await request(`positions?id=eq.${receipt.position_id}&select=*,position_lots(*)`);
    expect((await loaded.json())[0].position_lots).toHaveLength(1);
  });

  it('does not lose one of two purchases submitted concurrently', async () => {
    const replies = await Promise.all([
      request('rpc/record_position_purchase', 'POST', purchase({ p_symbol: 'AMD' })),
      request('rpc/record_position_purchase', 'POST', purchase({ p_symbol: 'TSLA', p_display: 'Tesla' })),
    ]);
    expect(replies.every(reply => reply.ok)).toBe(true);
    expect(readDemoLedger().positions).toHaveLength(5);
    expect(readDemoLedger().position_lots).toHaveLength(5);
  });

  it('adds purchases, records a sale, edits and deletes transactions and updates the dashboard', async () => {
    const positionId = String(readDemoLedger().positions[0].id);
    const symbol = String(readDemoLedger().positions[0].symbol);
    expect((await request('rpc/record_position_purchase', 'POST', purchase({ p_symbol: symbol, p_quantity: 3 }))).ok).toBe(true);
    const sale = { position_id: positionId, side: 'SELL', price: 220, quantity: 2, executed_at: '2026-11-05', has_commission: false, commission_amount: 0 };
    const created = await request('position_lots', 'POST', sale);
    expect(created.ok).toBe(true);
    const lot = readDemoLedger().position_lots.find(row => row.position_id === positionId && row.side === 'SELL')!;
    expect(localDemoDashboard().positions.find(row => row.id === positionId)?.quantity).toBe(13);
    expect((await request(`position_lots?id=eq.${lot.id}`, 'PATCH', { quantity: 1 })).ok).toBe(true);
    expect(localDemoDashboard().positions.find(row => row.id === positionId)?.quantity).toBe(14);
    expect((await request(`positions?id=eq.${positionId}`, 'PATCH', { display: 'Edited demo name' })).ok).toBe(true);
    expect(readDemoLedger().positions.find(row => row.id === positionId)?.display).toBe('Edited demo name');
    expect((await request(`position_lots?id=eq.${lot.id}`, 'DELETE')).ok).toBe(true);
    expect(localDemoDashboard().positions.find(row => row.id === positionId)?.quantity).toBe(15);
  });

  it('does not resurrect an opening quantity after deleting the final transaction', async () => {
    const positionId = String(readDemoLedger().positions[0].id);
    const opening = readDemoLedger().position_lots.find(row => row.position_id === positionId)!;
    expect((await request(`position_lots?id=eq.${opening.id}`, 'DELETE')).ok).toBe(true);
    expect(localDemoDashboard().positions.find(row => row.id === positionId)?.quantity).toBe(0);
    expect((await (await request(`positions?id=eq.${positionId}&select=*,position_lots(*)`)).json())[0].position_lots).toEqual([]);
    expect(localDemoDashboard().positions.find(row => row.id === positionId)?.quantity).toBe(0);
  });

  it('cascades position deletion and keeps an intentionally empty portfolio empty', async () => {
    for (const position of readDemoLedger().positions) {
      expect((await request(`positions?id=eq.${position.id}`, 'DELETE')).ok).toBe(true);
    }
    expect(readDemoLedger().positions).toEqual([]);
    expect(readDemoLedger().position_lots).toEqual([]);
    expect(localDemoDashboard().positions).toEqual([]);
    // A fresh adapter/read represents reopening the demo, not a reset to fixtures.
    expect(await (await request('positions')).json()).toEqual([]);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).not.toBeNull();
  });

  it('rejects invalid overselling atomically, including edits that invalidate later sales', async () => {
    const positionId = String(readDemoLedger().positions[0].id);
    const original = localStorage.getItem(DEMO_LEDGER_KEY);
    const response = await request('position_lots', 'POST', { position_id: positionId, side: 'SELL', price: 200, quantity: 999, executed_at: '2026-11-05', has_commission: false, commission_amount: 0 });
    expect(response.ok).toBe(false);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(original);
    expect((await request('position_lots', 'POST', { position_id: positionId, side: 'SELL', price: 200, quantity: 10, executed_at: '2026-11-05', has_commission: false, commission_amount: 0 })).ok).toBe(true);
    const beforeEdit = localStorage.getItem(DEMO_LEDGER_KEY);
    const opening = readDemoLedger().position_lots.find(row => row.position_id === positionId && row.side === 'BUY')!;
    expect((await request(`position_lots?id=eq.${opening.id}`, 'PATCH', { quantity: 1 })).ok).toBe(false);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(beforeEdit);
  });

  it('preserves unreadable saved data instead of silently replacing it with sample transactions', () => {
    localStorage.setItem(DEMO_LEDGER_KEY, '{broken');
    expect(() => readDemoLedger()).toThrow();
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe('{broken');
  });

  it('rejects purchases and positions for an unknown investment source without changing saved data', async () => {
    readDemoLedger();
    const original = localStorage.getItem(DEMO_LEDGER_KEY);
    expect((await request('rpc/record_position_purchase', 'POST', purchase({ p_location: 'unknown-source' }))).ok).toBe(false);
    expect((await request('positions', 'POST', { symbol: 'AMD', display: 'AMD', location: 'unknown-source', quantity: 0, entry_price: 100, entry_date: '2026-11-01' })).ok).toBe(false);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(original);
  });

  it('keeps position plans read-only without changing saved data', async () => {
    readDemoLedger();
    const original = localStorage.getItem(DEMO_LEDGER_KEY);
    expect((await request('position_plans', 'POST', { position_id: readDemoLedger().positions[0].id, side: 'buy', target_price: 100, target_quantity: 1, target_date: '2026-12-01', status: 'pending' })).ok).toBe(false);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(original);
  });

  it('does not claim a saved mutation when browser storage fails', async () => {
    readDemoLedger();
    const original = localStorage.getItem(DEMO_LEDGER_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const response = await request('rpc/record_position_purchase', 'POST', purchase());
    expect(response.ok).toBe(false);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(original);
  });

  it('rejects stale account clients before reading or changing demo state', async () => {
    readDemoLedger();
    const original = localStorage.getItem(DEMO_LEDGER_KEY);
    expect((await request('rpc/record_position_purchase', 'POST', purchase(), () => { throw new Error('Session changed'); })).ok).toBe(false);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(original);
  });

  it('activates the adapter only for a demo account and never writes to real data', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.example.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-placeholder');
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url === '/api/account/database-token') return Response.json({ accessToken: 'synthetic-token', userId: 'real-user', expiresAt: Math.floor(Date.now() / 1000) + 3600 });
      return Response.json([]);
    });
    configureSupabaseUser(DEMO_USER_ID);
    await getSupabaseClient().from('positions').select('*');
    expect(network).not.toHaveBeenCalled();
    const original = localStorage.getItem(DEMO_LEDGER_KEY);
    configureSupabaseUser('real-user');
    await getSupabaseClient().from('positions').select('*');
    expect(network.mock.calls.some(([input]) => String(input).startsWith('https://database.example.test/rest/v1/positions'))).toBe(true);
    expect(localStorage.getItem(DEMO_LEDGER_KEY)).toBe(original);
  });
});
