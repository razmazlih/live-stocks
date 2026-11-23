// A review deployment keeps its synthetic account and clock in each browser tab.
// No request made by this adapter can read or write a server-side account.
import { executeDemoOperation, localDemoDashboard, seedDemoLedger, type DemoLedger } from './ledger';
import { localDateParam } from '@/lib/list-url-state';
import { easternDate } from '@/lib/utils/trading-hours';
import type { Settings } from '@/types';
import type { DemoPreferences } from './client';
import { isFixedScenario, scenarioTime, type LocalMarketMode } from './market-scenarios';

const reviewKey = 'livestocks:preview:v1';
const localModeKey = 'livestocks:local-demo:market-mode';
export const DEMO_SCENARIO_EVENT = 'livestocks:demo-market-mode';

type ReviewState = { ledger: DemoLedger; settings: Settings; preferences: DemoPreferences };
let reviewActive = false;
let demoAccountActive = false;
const volatileModes = new Map<string, LocalMarketMode>();

export function setReviewActive(active: boolean) { reviewActive = active; }
export function isReviewActive() { return reviewActive; }
export function setDemoAccountActive(active: boolean) { demoAccountActive = active; }

export function canChooseLocalMarketMode() {
  return process.env.NODE_ENV === 'development' && demoAccountActive && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

function storedMode(key: string) {
  try { return sessionStorage.getItem(key); } catch { return volatileModes.get(key) ?? null; }
}

function storeMode(key: string, value: LocalMarketMode) {
  volatileModes.set(key, value);
  try { sessionStorage.setItem(key, value); } catch { /* Keep this tab usable when storage is disabled. */ }
}

export function readLocalMarketMode(): LocalMarketMode {
  if (!reviewActive && !canChooseLocalMarketMode()) return 'realtime';
  if (typeof window === 'undefined') return reviewActive ? 'regular' : 'realtime';
  const key = reviewActive ? reviewKey + ':scenario' : localModeKey;
  const selected = storedMode(key);
  if (reviewActive) {
    const linked = new URLSearchParams(window.location.search).get('scenario');
    if (isFixedScenario(linked)) {
      if (selected !== linked) storeMode(key, linked);
      return linked;
    }
  }
  if (isFixedScenario(selected)) return selected;
  if (selected === 'realtime' && canChooseLocalMarketMode()) return selected;
  return reviewActive ? 'regular' : 'realtime';
}

export function selectLocalMarketMode(mode: LocalMarketMode) {
  if (!canChooseLocalMarketMode() || (mode !== 'realtime' && !isFixedScenario(mode))) return;
  if (reviewActive) {
    const url = new URL(window.location.href);
    if (url.searchParams.has('scenario')) {
      if (mode === 'realtime') url.searchParams.delete('scenario');
      else url.searchParams.set('scenario', mode);
      window.history.replaceState(window.history.state, '', url);
    }
  }
  storeMode(reviewActive ? reviewKey + ':scenario' : localModeKey, mode);
  window.dispatchEvent(new Event(DEMO_SCENARIO_EVENT));
}

/** The disk-backed account follows the real clock unless a local preset was selected. */
export function demoScenarioClock() {
  return canChooseLocalMarketMode() ? scenarioTime(readLocalMarketMode()) : null;
}

export function reviewClock() {
  return scenarioTime(readLocalMarketMode()) ?? Date.now();
}

/** The preview shares one session date across charts, metrics and transaction entry. */
export function portfolioNow(): number {
  return isReviewActive() ? reviewClock() : demoScenarioClock() ?? Date.now();
}

export function portfolioToday(): string {
  const clock = isReviewActive() ? reviewClock() : demoScenarioClock();
  return clock === null ? localDateParam(new Date())! : easternDate(clock);
}

function readState(): ReviewState {
  const saved = sessionStorage.getItem(reviewKey);
  if (saved) return JSON.parse(saved);
  const ledger = seedDemoLedger();
  const groupId = 'review-tech';
  ledger.watchlist_groups = [{ id: groupId, name: 'Technology', description: '', sort_order: 0 }];
  ledger.watchlist_tickers = ledger.positions.map((row, index) => ({
    id: 'review-' + row.symbol, group_id: groupId, symbol: row.symbol, display: row.display, sort_order: index,
  }));
  return { ledger, settings: { annualGrowthRate: 0.05, currency: 'USD', refreshInterval: 1 }, preferences: {} };
}

export function reviewRequest(path: string, init?: RequestInit): unknown {
  const state = readState();
  if (path === 'reset') { sessionStorage.removeItem(reviewKey); return readState(); }
  if (path === 'state') return { exists: true, ...state };
  if (path === 'dashboard') return localDemoDashboard(state.ledger, reviewClock());
  if (path !== 'settings' && path !== 'preferences') throw new Error('Unknown preview operation');
  if (init?.body) {
    const data = JSON.parse(String(init.body));
    if (path === 'settings') state.settings = init.method === 'PATCH' ? { ...state.settings, ...data } : data;
    else state.preferences = { ...state.preferences, ...data };
    sessionStorage.setItem(reviewKey, JSON.stringify(state));
  }
  return state[path];
}

export function createReviewFetch(assertCurrentSession: () => void): typeof fetch {
  return async (input, init) => {
    try {
      assertCurrentSession();
      const request = new Request(input, init);
      const url = new URL(request.url);
      const prefix = '/api/review/rest/v1/';
      if (url.origin !== window.location.origin || !url.pathname.startsWith(prefix)) {
        throw new Error('Unknown preview resource');
      }
      const raw = ['GET', 'HEAD', 'DELETE'].includes(request.method) ? '' : await request.text();
      assertCurrentSession();
      const state = readState();
      const result = executeDemoOperation(state.ledger, url.pathname.slice(prefix.length), request.method,
        url.searchParams, raw ? JSON.parse(raw) : undefined, request.headers.get('prefer')?.includes('resolution=merge-duplicates'));
      if (result.changed) sessionStorage.setItem(reviewKey, JSON.stringify({ ...state, ledger: result.ledger }));
      const single = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(single ? result.data[0] ?? null : result.data),
        { headers: { 'Content-Type': 'application/json', 'Content-Range': '0-' + Math.max(0, result.data.length - 1) + '/' + result.data.length } });
    } catch (error) { return Response.json({ message: error instanceof Error ? error.message : 'Invalid preview request' }, { status: 400 }); }
  };
}
