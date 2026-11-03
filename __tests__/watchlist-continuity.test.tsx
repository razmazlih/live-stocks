import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { HistoricalPoint, TimeRange } from '@/types';

const fixture = vi.hoisted(() => {
  const group = { id: 'g1', name: 'Tech', tickers: [{ id: 't1', groupId: 'g1', symbol: 'AAPL', sortOrder: 0 }] };
  return { group, groups: [group] };
});
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: {} }) }));
vi.mock('@/hooks/use-watchlist', () => ({ useWatchlist: () => ({
  groups: fixture.groups, selectedGroup: fixture.group, selectedGroupId: 'g1', loading: false,
  refreshing: false, error: null, selectGroup: vi.fn(), refresh: vi.fn(), createGroup: vi.fn(),
  updateGroup: vi.fn(), deleteGroup: vi.fn(), createTicker: vi.fn(), updateTicker: vi.fn(), deleteTicker: vi.fn(), reorderTickers: vi.fn(),
}) }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({ DashboardRouteShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/dashboard/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/watchlist/time-range-tabs', () => ({ TimeRangeTabs: ({ onChange }: { onChange: (range: TimeRange) => void }) => <><button onClick={() => onChange('1W')}>Week</button><button onClick={() => onChange('1Y')}>Year</button></> }));
vi.mock('@/components/watchlist/ticker-card', () => ({ TickerCard: ({ range, historical, loading, error, onRefresh, ticker }: { range: string; historical: HistoricalPoint[]; loading: boolean; error: string; onRefresh: (ticker: unknown) => void; ticker: unknown }) => <div><output data-testid="series">{range}:{historical.map((point) => point.close).join(',')}</output><output data-testid="loading">{String(loading)}</output><output data-testid="error">{error}</output><button onClick={() => onRefresh(ticker)}>Refresh ticker</button></div> }));

import WatchlistPage from '@/app/watchlist/page';

type Pending = { url: string; resolve: (response: Response) => void };
let pending: Pending[];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function completeBatch(batch: Pending[], prices: number[]) {
  await act(async () => {
    batch.forEach(({ url, resolve }) => resolve(json(url.includes('/quote') ? { c: prices.at(-1) } : { s: 'ok', t: [1700000000, 1700086400], c: prices, o: prices, h: prices, l: prices, v: [1, 1] })));
  });
}

describe('watchlist request continuity', () => {
  beforeEach(() => {
    pending = [];
    window.history.replaceState(null, '', '/watchlist');
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>((resolve) => pending.push({ url, resolve }))));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('retains the labeled old chart and discards out-of-order range responses', async () => {
    render(<WatchlistPage />);
    await waitFor(() => expect(pending).toHaveLength(2));
    await completeBatch(pending.splice(0), [100, 110]);
    expect(screen.getByTestId('series')).toHaveTextContent('1M:100,110');
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    const week = pending.splice(0);
    expect(screen.getByTestId('series')).toHaveTextContent('1M:100,110');
    fireEvent.click(screen.getByRole('button', { name: 'Year' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await completeBatch(pending.splice(0), [200, 220]);
    await completeBatch(week, [10, 11]);
    expect(screen.getByTestId('series')).toHaveTextContent('1Y:200,220');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('keeps the last chart on refresh failure with an error', async () => {
    render(<WatchlistPage />);
    await waitFor(() => expect(pending).toHaveLength(2));
    await completeBatch(pending.splice(0), [100, 110]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ticker' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending.splice(0).forEach(({ resolve }) => resolve(json({ error: 'Unavailable' }, 503))); });
    expect(screen.getByTestId('series')).toHaveTextContent('1M:100,110');
    expect(screen.getByTestId('error').textContent).not.toBe('');
  });

  it('restores URL search and clears no-match filtering without losing range or group', async () => {
    window.history.replaceState(null, '', '/watchlist?group=g1&range=1W&q=msft');
    render(<WatchlistPage />);
    expect(screen.getByRole('searchbox', { name: 'Search stocks in group' })).toHaveValue('msft');
    expect(await screen.findByText('No stocks match your search.')).toBeInTheDocument();
    expect(screen.queryByTestId('series')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByTestId('series')).toBeInTheDocument();
    expect(window.location.search).not.toContain('q=');
    expect(window.location.search).toContain('group=g1');
    expect(window.location.search).toContain('range=1W');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'aapl' } });
    expect(screen.getByTestId('series')).toBeInTheDocument();
    expect(window.location.search).toContain('q=aapl');
    expect(screen.getByText(/Reordering paused during search/)).toBeInTheDocument();
    expect(screen.getByTestId('series').closest('[aria-roledescription="sortable"]')).toHaveAttribute('aria-disabled', 'true');
  });

});
