// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
vi.mock('server-only', () => ({}));
import { GET, POST, PUT, PATCH, DELETE } from '@/app/api/local-demo/[...path]/route';
import { readDemoState } from '@/lib/demo/store';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'livestocks-demo-api-'));
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LIVESTOCKS_DEMO_DATA_DIR', folder);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
function call(path: string, method = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}, origin = 'http://localhost:3001') {
  const request = new NextRequest(`${origin}/api/local-demo/${path}`, { method, headers: {
    cookie: 'livestocks-local-demo=1', origin, 'Content-Type': 'application/json', ...extraHeaders,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const context = { params: Promise.resolve({ path: path.split('?')[0].split('/') }) };
  return method === 'GET' ? GET(request, context) : method === 'PUT' ? PUT(request, context) : method === 'PATCH' ? PATCH(request, context) : method === 'DELETE' ? DELETE(request, context) : POST(request, context);
}

describe('disk demo API boundaries', () => {
  it('accepts only named snapshot clocks inside the local account boundary', async () => {
    const preset = await (await call('dashboard?scenario=extended')).json();
    expect(preset.asOf).toBe(Date.parse('2026-11-20T22:00:00Z'));
    expect(preset.quotes.AAPL.t).toBe(preset.asOf / 1000);
    const real = await (await call('dashboard?scenario=2035-01-01')).json();
    expect(Math.abs(real.asOf - Date.now())).toBeLessThan(2000);
    expect((await call('dashboard?scenario=regular', 'GET', undefined, { cookie: '' })).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await call('dashboard?scenario=regular')).status).toBe(404);
  });

  it('requires a loopback development demo session before reading state', async () => {
    expect((await call('state', 'GET', undefined, { cookie: '' })).status).toBeGreaterThanOrEqual(400);
    expect((await call('state', 'GET', undefined, {}, 'https://foreign.example')).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await call('state')).status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    expect(await readDemoState()).toBeNull();
  });

  it('rejects cross-origin writes and same-origin writes carrying cross-site metadata', async () => {
    expect((await call('migrate', 'POST', {}, { origin: 'http://localhost:3002' })).status).toBe(403);
    expect((await call('migrate', 'POST', {}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(await readDemoState()).toBeNull();
  });

  it('shares saved settings across ports and returns private uncached responses', async () => {
    expect((await call('migrate', 'POST', {})).ok).toBe(true);
    expect((await call('settings', 'PUT', { annualGrowthRate: 0.09, currency: 'ILS', refreshInterval: 60 })).ok).toBe(true);
    const response = await call('settings', 'GET', undefined, {}, 'http://localhost:4321');
    expect(response.ok, await response.clone().text()).toBe(true);
    expect(await response.json()).toEqual(expect.objectContaining({ annualGrowthRate: 0.09, currency: 'ILS' }));
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('changes only the annual target and rejects out-of-range or unrelated edits', async () => {
    await call('settings', 'PUT', { annualGrowthRate: 0.05, currency: 'ILS', refreshInterval: 15 });
    expect((await call('settings', 'PATCH', { annualGrowthRate: 1.2 })).ok).toBe(false);
    expect((await call('settings', 'PATCH', { annualGrowthRate: 0.2, currency: 'USD' })).ok).toBe(false);
    const saved = await call('settings', 'PATCH', { annualGrowthRate: 0.125 });
    expect(await saved.json()).toEqual({ annualGrowthRate: 0.125, currency: 'ILS', refreshInterval: 15 });
  });

  it('persists sources, watchlists, plans and transactions in the shared local file', async () => {
    await call('import', 'POST', {});
    const sourceResponse = await call('rest/v1/investment_sources', 'POST', { name: 'Second local source' });
    expect(sourceResponse.ok, await sourceResponse.clone().text()).toBe(true);
    const [source] = await sourceResponse.json();
    const purchase = await call('rest/v1/rpc/record_position_purchase', 'POST', {
      p_request_id: crypto.randomUUID(), p_symbol: 'TSLA', p_display: 'Tesla', p_image_url: '', p_location: source.id,
      p_price: 250, p_quantity: 4, p_executed_at: '2026-11-01', p_has_commission: false, p_commission_amount: 0,
    });
    expect(purchase.ok, await purchase.clone().text()).toBe(true);
    const [receipt] = await purchase.json();
    const groupResponse = await call('rest/v1/watchlist_groups', 'POST', { name: 'Local watchlist' });
    const [group] = await groupResponse.json();
    expect((await call('rest/v1/watchlist_tickers', 'POST', { group_id: group.id, symbol: 'TSLA', display: 'Tesla', sort_order: 0 })).ok).toBe(true);
    expect((await call('rest/v1/position_plans', 'POST', { position_id: receipt.position_id, symbol: 'TSLA', side: 'sell', target_price: 300, target_quantity: 1, target_date: '2026-12-01', status: 'pending', location: source.id })).ok).toBe(true);
    const dashboard = await (await call('dashboard', 'GET', undefined, {}, 'http://localhost:4555')).json();
    expect(dashboard.positions).toContainEqual(expect.objectContaining({ symbol: 'TSLA', quantity: 4, location: source.id }));
    expect((await readDemoState())!.ledger.watchlist_tickers).toHaveLength(1);
    expect((await readDemoState())!.ledger.position_plans).toHaveLength(1);
    expect((await call(`rest/v1/watchlist_groups?id=eq.${group.id}`, 'DELETE')).ok).toBe(true);
    expect((await readDemoState())!.ledger.watchlist_tickers).toHaveLength(0);
    expect((await call(`rest/v1/positions?id=eq.${receipt.position_id}`, 'DELETE')).ok).toBe(true);
    const state = (await readDemoState())!;
    expect(state.ledger.positions.some(row => row.id === receipt.position_id)).toBe(false);
    expect(state.ledger.position_lots.some(row => row.position_id === receipt.position_id)).toBe(false);
    expect(state.ledger.position_plans).toHaveLength(0);
  });

  it('validates planned transactions and keeps optimistic claims atomic', async () => {
    await call('import', 'POST', {});
    const state = (await readDemoState())!;
    const position = state.ledger.positions[0];
    const input = { position_id: null, symbol: position.symbol, side: 'buy', target_price: 200, target_quantity: 1,
      target_date: '2026-12-01', status: 'pending', location: position.location };
    expect((await call('rest/v1/position_plans', 'POST', { ...input, target_quantity: -1 })).status).toBe(400);
    expect((await readDemoState())!.ledger.position_plans).toHaveLength(0);
    const [plan] = await (await call('rest/v1/position_plans', 'POST', input)).json();
    const claimed = await call(`rest/v1/position_plans?id=eq.${plan.id}&status=eq.pending`, 'PATCH', { status: 'triggered', position_id: position.id });
    expect(claimed.ok).toBe(true);
    const duplicate = await call(`rest/v1/position_plans?id=eq.${plan.id}&status=eq.pending`, 'PATCH', { status: 'triggered' });
    expect(duplicate.ok).toBe(true);
    expect(await duplicate.json()).toEqual([]);
    expect((await readDemoState())!.ledger.position_plans[0].position_id).toBe(position.id);
  });

  it('requires explicit reset confirmation and does not reimport stale browser state after reset', async () => {
    await call('migrate', 'POST', { settings: { annualGrowthRate: 0.09, currency: 'ILS', refreshInterval: 60 } });
    expect((await call('reset', 'POST', {})).status).toBeGreaterThanOrEqual(400);
    expect((await readDemoState())!.settings.currency).toBe('ILS');
    expect((await call('reset', 'POST', { confirm: true })).ok).toBe(true);
    expect((await readDemoState())!.settings.currency).toBe('USD');
    await call('migrate', 'POST', { settings: { annualGrowthRate: 0.09, currency: 'ILS', refreshInterval: 60 } });
    expect((await readDemoState())!.settings.currency).toBe('USD');
  });
});
