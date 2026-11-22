// A review deployment keeps its synthetic account and clock in each browser tab.
// No request made by this adapter can read or write a server-side account.
import { executeDemoOperation, localDemoDashboard, seedDemoLedger, type DemoLedger } from './ledger';
import type { Settings } from '@/types';
import type { DemoPreferences } from './client';

const reviewKey = 'livestocks:preview:v1';
const clocks = {
  regular: Date.parse('2026-11-20T20:00:00Z'),
  extended: Date.parse('2026-11-20T22:00:00Z'),
  closed: Date.parse('2026-11-21T17:00:00Z'),
};

type ReviewState = { ledger: DemoLedger; settings: Settings; preferences: DemoPreferences };
let reviewActive = false;

export function setReviewActive(active: boolean) { reviewActive = active; }
export function isReviewActive() { return reviewActive; }

export function reviewClock() {
  const scenario = new URLSearchParams(window.location.search).get('scenario');
  if (scenario && Object.hasOwn(clocks, scenario)) sessionStorage.setItem(reviewKey + ':scenario', scenario);
  const selected = sessionStorage.getItem(reviewKey + ':scenario') as keyof typeof clocks;
  return clocks[selected] ?? clocks.regular;
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
    if (path === 'settings') state.settings = data;
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
