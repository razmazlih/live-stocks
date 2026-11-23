import { demoTable } from './data';
import { demoQuote } from './assets';
import { mapPositionRow, expandPositionActivations, orderPositionLots } from '@/lib/positions';
import type { HistoricalPoint } from '@/types';

export const DEMO_LEDGER_KEY = 'livestocks:demo:ledger:v1';
export type Row = Record<string, unknown>;
export type DemoLedger = { positions: Row[]; position_lots: Row[]; position_plans: Row[]; purchases: Record<string, { input: string; result: Row }>; investment_sources?: Row[]; watchlist_groups?: Row[]; watchlist_tickers?: Row[] };
const tables = ['positions', 'position_lots', 'position_plans', 'investment_sources', 'watchlist_groups', 'watchlist_tickers'] as const;
const legacyTables = ['positions', 'position_lots', 'position_plans'] as const;
type Table = typeof tables[number];
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function readDemoLedger(): DemoLedger {
  const raw = localStorage.getItem(DEMO_LEDGER_KEY);
  if (raw === null) return seedDemoLedger();
  const value = JSON.parse(raw) as DemoLedger;
  if (!value || !legacyTables.every(table => Array.isArray(value[table])) || !value.purchases || typeof value.purchases !== 'object') throw new Error('Saved demo data is invalid');
  validateLedger(value);
  return value;
}
function positive(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
export function seedDemoLedger(): DemoLedger {
  return { positions: demoTable('positions'), position_lots: demoTable('position_lots'), position_plans: [], purchases: {},
    investment_sources: demoTable('investment_sources'), watchlist_groups: [], watchlist_tickers: [] };
}
export function validateLedger(ledger: DemoLedger) {
  if (!ledger || !legacyTables.every(table => Array.isArray(ledger[table])) || !ledger.purchases || typeof ledger.purchases !== 'object' || Array.isArray(ledger.purchases)) throw new Error('Invalid saved demo ledger');
  const sources = ledger.investment_sources ?? demoTable('investment_sources');
  const groups = ledger.watchlist_groups ?? [];
  const tickers = ledger.watchlist_tickers ?? [];
  for (const rows of [sources, groups, tickers]) if (!Array.isArray(rows)) throw new Error('Invalid saved demo table');
  for (const rows of [sources, groups]) {
    const unique = new Set<unknown>();
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || unique.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120) throw new Error('Invalid source or watchlist group');
      unique.add(row.id);
    }
  }
  const sourceIds = new Set(sources.map(row => row.id));
  const groupIds = new Set(groups.map(row => row.id));
  const tickerIds = new Set<unknown>();
  const groupSymbols = new Set<string>();
  for (const ticker of tickers) {
    const identity = `${ticker.group_id}:${ticker.symbol}`;
    if (!ticker || typeof ticker.id !== 'string' || tickerIds.has(ticker.id) || !groupIds.has(ticker.group_id) || typeof ticker.symbol !== 'string' || !/^[A-Z0-9.^:=/-]{1,30}$/.test(ticker.symbol) || groupSymbols.has(identity)) throw new Error('Invalid watchlist ticker');
    tickerIds.add(ticker.id); groupSymbols.add(identity);
  }

  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const position of ledger.positions) {
    const identity = `${position.symbol}:${position.location}`;
    if (typeof position.id !== 'string' || ids.has(position.id) || typeof position.symbol !== 'string' || !/^[A-Z0-9.^=-]{1,20}$/.test(position.symbol)
      || typeof position.display !== 'string' || !position.display.trim() || !sourceIds.has(position.location)) throw new Error('Invalid position');
    if (identities.has(identity)) throw new Error('A position already exists for this symbol and source');
    identities.add(identity); ids.add(position.id);
  }
  const lotIds = new Set<string>();
  for (const lot of ledger.position_lots) {
    if (typeof lot.id !== 'string' || lotIds.has(lot.id) || !ids.has(String(lot.position_id)) || !['BUY', 'SELL', 'RECONCILE'].includes(String(lot.side))
      || !positive(lot.price) || !(positive(lot.quantity) || (lot.side === 'RECONCILE' && lot.quantity === 0))
      || !Number.isFinite(Date.parse(String(lot.executed_at))) || typeof lot.has_commission !== 'boolean'
      || typeof lot.commission_amount !== 'number' || !Number.isFinite(lot.commission_amount) || lot.commission_amount < 0) throw new Error('Invalid transaction');
    lotIds.add(lot.id);
  }
  const planIds = new Set<string>();
  for (const plan of ledger.position_plans) {
    if (!plan || typeof plan.id !== 'string' || planIds.has(plan.id)
      || (plan.position_id != null && !ids.has(String(plan.position_id)))
      || typeof plan.symbol !== 'string' || !/^[A-Z0-9.^:=/-]{1,30}$/.test(plan.symbol)
      || !['buy', 'sell'].includes(String(plan.side)) || !positive(plan.target_price) || !positive(plan.target_quantity)
      || !Number.isFinite(Date.parse(String(plan.target_date)))
      || !['pending', 'triggered', 'expired', 'cancelled'].includes(String(plan.status))
      || (plan.location != null && !sourceIds.has(plan.location))
      || (plan.commission_amount != null && (typeof plan.commission_amount !== 'number' || !Number.isFinite(plan.commission_amount) || plan.commission_amount < 0))) {
      throw new Error('Invalid planned transaction');
    }
    planIds.add(plan.id);
  }
  for (const position of ledger.positions) {
    let quantity = 0;
    const normalized = mapPositionRow({ ...position, quantity: 0, position_lots: ledger.position_lots.filter(lot => lot.position_id === position.id) } as unknown as Parameters<typeof mapPositionRow>[0]);
    for (const lot of orderPositionLots(normalized.lots ?? [])) {
      quantity = lot.type === 'RECONCILE' ? lot.quantity : quantity + (lot.type === 'SELL' ? -1 : 1) * lot.quantity;
      if (quantity < -1e-8) throw new Error('Not enough shares at the transaction date');
    }
  }
}
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, expression] of params) {
    if (expression.startsWith('eq.') && String(row[key]) !== expression.slice(3)) return false;
    if (expression.startsWith('in.(') && !expression.slice(4, -1).split(',').includes(String(row[key]))) return false;
    if (expression === 'is.null' && row[key] != null) return false;
  }
  return true;
}
export function rowsFor(ledger: DemoLedger, table: string, params: URLSearchParams): Row[] {
  let rows = (tables.includes(table as Table) ? (ledger[table as Table] ?? (table === 'investment_sources' ? demoTable(table) : [])) : demoTable(table)).filter(row => matches(row, params)).map(row => copy(row));
  if (table === 'positions') rows = rows.map(row => ({ ...row,
    // An explicitly empty ledger has no fallback opening quantity.
    quantity: 0,
    position_lots: ledger.position_lots.filter(lot => lot.position_id === row.id),
    position_plans: ledger.position_plans.filter(plan => plan.position_id === row.id),
  }));
  if (table === 'watchlist_groups') rows = rows.map(row => ({ ...row, watchlist_tickers: (ledger.watchlist_tickers ?? []).filter(ticker => ticker.group_id === row.id) }));
  const order = params.get('order');
  if (order) rows.sort((a, b) => { for (const field of order.split(',')) { const [key, direction] = field.split('.'); const compared = String(a[key] ?? '').localeCompare(String(b[key] ?? '')); if (compared) return direction === 'desc' ? -compared : compared; } return 0; });
  const offset = Number(params.get('offset') ?? 0), limit = Number(params.get('limit') ?? rows.length);
  return rows.slice(offset, offset + limit);
}
function rowDefaults(row: Row): Row { const now = new Date().toISOString(); return { id: crypto.randomUUID(), created_at: now, updated_at: now, ...row }; }
function purchase(ledger: DemoLedger, args: Row): Row[] {
  const requestId = String(args.p_request_id ?? '');
  if (!requestId) throw new Error('Purchase request ID required');
  const input = JSON.stringify(args);
  if (ledger.purchases[requestId]) {
    if (ledger.purchases[requestId].input !== input) throw new Error('Purchase request ID already used');
    return [ledger.purchases[requestId].result];
  }
  const symbol = String(args.p_symbol ?? '').trim().toUpperCase();
  let position = ledger.positions.find(row => row.symbol === symbol && row.location === args.p_location);
  const reused = Boolean(position);
  if (!position) {
    position = rowDefaults({ symbol, display: args.p_display, image_url: args.p_image_url ?? '', location: args.p_location, entry_price: args.p_price, quantity: 0, entry_date: args.p_executed_at });
    ledger.positions.push(position);
  }
  const lot = rowDefaults({ position_id: position.id, side: 'BUY', price: args.p_price, quantity: args.p_quantity,
    executed_at: args.p_executed_at, has_commission: args.p_has_commission, commission_amount: args.p_has_commission ? args.p_commission_amount : 0, commission_known: true });
  ledger.position_lots.push(lot);
  const result = { position_id: position.id, lot_id: lot.id, reused };
  ledger.purchases[requestId] = { input, result };
  return [result];
}

/** Synchronous read/validate/write within each call: failed writes never change the in-memory seed. */
export function createDemoFetch(assertCurrentSession: () => void): typeof fetch {
  return async (input, init) => {
    try {
      assertCurrentSession();
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.startsWith('/api/local-demo/rest/v1/')) throw new Error('Demo requests cannot access remote services');
      const method = request.method.toUpperCase();
      const resource = url.pathname.slice('/api/local-demo/rest/v1/'.length);
      const body: unknown = ['GET', 'HEAD', 'DELETE'].includes(method) ? null : await request.json();
      assertCurrentSession();
      const ledger = readDemoLedger();
      let data: Row[];
      if (method === 'GET' || method === 'HEAD') {
        data = rowsFor(ledger, resource, url.searchParams);
      } else {
        const next = copy(ledger);
        if (resource === 'rpc/record_position_purchase' && method === 'POST') data = purchase(next, body as Row);
        else {
          if (!['positions', 'position_lots'].includes(resource)) throw new Error('This demo operation is unavailable');
          const table = resource as Table;
          if (method === 'POST') {
            data = (Array.isArray(body) ? body : [body]).map(row => rowDefaults(row as Row));
            next[table]!.push(...data);
          } else if (method === 'PATCH' || method === 'DELETE') {
            if (!url.searchParams.has('id')) throw new Error('A transaction or position ID is required');
            const selected = next[table]!.filter(row => matches(row, url.searchParams));
            if (!selected.length) throw new Error('Demo record was not found');
            if (method === 'PATCH') {
              const patch = body as Row;
              if ('id' in patch || 'position_id' in patch) throw new Error('Record identity cannot be changed');
              data = selected.map(row => ({ ...row, ...patch, updated_at: new Date().toISOString() }));
              next[table] = next[table]!.map(row => data.find(updated => updated.id === row.id) ?? row);
            } else {
              data = selected;
              const selectedIds = new Set(selected.map(row => row.id));
              next[table] = next[table]!.filter(row => !selectedIds.has(row.id));
              if (table === 'positions') {
                next.position_lots = next.position_lots.filter(row => !selectedIds.has(row.position_id));
                next.position_plans = next.position_plans.filter(row => !selectedIds.has(row.position_id));
              }
            }
          } else throw new Error('Unsupported demo operation');
        }
        validateLedger(next);
        assertCurrentSession();
        localStorage.setItem(DEMO_LEDGER_KEY, JSON.stringify(next));
      }
      assertCurrentSession();
      const single = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
      return new Response(method === 'HEAD' ? null : JSON.stringify(single ? data[0] ?? null : data), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Range': `0-${Math.max(data.length - 1, 0)}/${data.length}` } });
    } catch (error) {
      return Response.json({ message: error instanceof Error ? error.message : 'Unable to save demo data', code: 'DEMO_LOCAL_ERROR' }, { status: 400 });
    }
  };
}

export function localDemoDashboard(ledger = readDemoLedger(), asOf = Date.now()) {
  const positions = rowsFor(ledger, 'positions', new URLSearchParams()).map(row => mapPositionRow(row as unknown as Parameters<typeof mapPositionRow>[0]));
  const quotes = Object.fromEntries(positions.map(position => [position.symbol, { ...demoQuote(position.symbol, position.entryPrice), t: Math.floor(asOf / 1000) }]));
  const candlesByKey: Record<string, HistoricalPoint[]> = {};
  for (const position of positions) {
    const first = Math.min(...(position.lots ?? []).map(lot => Date.parse(lot.executedAt)), asOf);
    const days = Math.min(370, Math.max(2, Math.ceil((asOf - first) / 86400000) + 1));
    candlesByKey[position.id!] = Array.from({ length: days }, (_, index) => ({ timestamp: first + index * 86400000,
      close: position.entryPrice + (quotes[position.symbol].c - position.entryPrice) * index / (days - 1) }));
  }
  const activationPositions = positions.flatMap(expandPositionActivations);
  for (const position of activationPositions) {
    const points = candlesByKey[position.originalId ?? position.id!] ?? [];
    if (position.activationId) candlesByKey[position.activationId] = points;
    if (position.id) candlesByKey[position.id] = points;
  }
  return { asOf, positions, activationPositions, quotes, candlesByKey, contextCandlesByKey: candlesByKey,
    usdToIls: 3.65, fxHistoryPoints: [{ timestamp: Date.UTC(2000, 0, 1), close: 3.65 }], spyPoints: [] as HistoricalPoint[] };
}

/** Pure local-account operation; persistence belongs to the computer's file store. */
export function executeDemoOperation(ledger: DemoLedger, resource: string, method: string, params: URLSearchParams, body: unknown, upsert = false): { ledger: DemoLedger; data: Row[]; changed: boolean } {
  if (method === 'GET' || method === 'HEAD') return { ledger, data: rowsFor(ledger, resource, params), changed: false };
  const next = copy(ledger);
  next.investment_sources ??= demoTable('investment_sources');
  next.watchlist_groups ??= [];
  next.watchlist_tickers ??= [];
  let data: Row[];
  if (resource === 'rpc/record_position_purchase' && method === 'POST') data = purchase(next, body as Row);
  else {
    if (!tables.includes(resource as Table)) throw new Error('This local account operation is unavailable');
    const table = resource as Table;
    const rows = next[table]!;
    if (method === 'POST') {
      const values: unknown[] = Array.isArray(body) ? body : [body];
      if (!values.length || values.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid row data');
      data = values.map(value => {
        const row = value as Row;
        const previous = upsert && typeof row.id === 'string' ? rows.find(item => item.id === row.id) : undefined;
        return previous ? { ...previous, ...row, updated_at: new Date().toISOString() } : rowDefaults({
          ...(table === 'investment_sources' ? { archived_at: null, legacy_location: null } : {}), ...row,
        });
      });
      next[table] = [...rows.filter(row => !upsert || !data.some(value => value.id === row.id)), ...data];
    } else if (method === 'PATCH' || method === 'DELETE') {
      if (!params.has('id')) throw new Error('A record ID is required');
      const selected = rows.filter(row => matches(row, params));
      if (!selected.length) return { ledger, data: [], changed: false };
      if (method === 'PATCH') {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid row data');
        const patch = body as Row;
        if ('id' in patch || ('position_id' in patch && table !== 'position_plans')) throw new Error('Record identity cannot be changed');
        data = selected.map(row => ({ ...row, ...patch, updated_at: new Date().toISOString() }));
        next[table] = rows.map(row => data.find(updated => updated.id === row.id) ?? row);
      } else {
        data = selected;
        const deleted = new Set(selected.map(row => row.id));
        next[table] = rows.filter(row => !deleted.has(row.id));
        if (table === 'positions') {
          next.position_lots = next.position_lots.filter(row => !deleted.has(row.position_id));
          next.position_plans = next.position_plans.filter(row => !deleted.has(row.position_id));
        }
        if (table === 'watchlist_groups') next.watchlist_tickers = next.watchlist_tickers.filter(row => !deleted.has(row.group_id));
      }
    } else throw new Error('Unsupported local account operation');
  }
  validateLedger(next);
  return { ledger: next, data, changed: true };
}
