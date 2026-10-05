import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockDetailView } from '@/app/stock/[symbol]/stock-detail-view';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: { annualGrowthRate: 0.08, finnhubToken: 'test-token' } }) }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({ DashboardRouteShell: ({ children, activeKey }: { children: ReactNode; activeKey: string }) => <div data-testid="route-shell" data-active={activeKey}>{children}</div> }));
vi.mock('@/components/dashboard/page-header', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/charts/sparkline', () => ({ Sparkline: ({ points }: { points: { close: number }[] }) => <div data-testid="stock-chart">{points.map((point) => point.close).join(',')}</div> }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: 'one', symbol: 'AAPL', display: 'Apple', location: 'bank_one', quantity: 2, entry_price: 100, entry_date: '2025-01-01', position_lots: [] }], error: null }) }) }) }) }));

const candles = (price: number) => new Response(JSON.stringify({ s: 'ok', t: [1735689600, 1735776000], c: [price, price + 1], o: [price, price], h: [price, price + 1], l: [price, price], v: [1, 1] }), { status: 200 });
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};
let nextCandleRequests: ReturnType<typeof deferred>[];
let failQuotes: boolean;

beforeEach(() => {
  window.history.replaceState(null, '', '/stock/AAPL?returnTo=%2Fpositions%3Fq%3Dapple');
  nextCandleRequests = [];
  failQuotes = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input.startsWith('/api/candles')) return nextCandleRequests.shift()?.promise ?? candles(110);
    if (input.startsWith('/api/quote')) {
      if (failQuotes) throw new Error('Offline');
      return new Response(JSON.stringify({ c: 120, d: 2, dp: 1.7 }), { status: 200 });
    }
    return new Response(JSON.stringify({ usdToIls: 3.7 }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('stock detail continuity', () => {
  it('retains the last chart during range changes and ignores a late older response', async () => {
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    expect(screen.getByTestId('route-shell')).toHaveAttribute('data-active', 'positions');
    expect(screen.getByRole('link', { name: /Back to/ })).toHaveAttribute('href', '/positions?q=apple');
    const older = deferred();
    const newer = deferred();
    nextCandleRequests.push(older, newer);
    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    await waitFor(() => expect(window.location.search).toContain('range=1M'));
    expect(screen.getByTestId('stock-chart')).toHaveTextContent('110,111');
    fireEvent.click(screen.getByRole('button', { name: '1Y' }));
    await act(async () => newer.resolve(candles(140)));
    await waitFor(() => expect(screen.getByTestId('stock-chart')).toHaveTextContent('140,141'));
    await act(async () => older.resolve(candles(130)));
    expect(screen.getByTestId('stock-chart')).toHaveTextContent('140,141');
  });

  it('keeps prior chart data labelled when a new range fails', async () => {
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    const failed = deferred();
    nextCandleRequests.push(failed);
    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    await act(async () => failed.resolve(new Response('{}', { status: 503 })));
    await screen.findByText(/Chart could not be updated/);
    expect(screen.getByTestId('stock-chart')).toHaveTextContent('110,111');
    expect(screen.getByText(/Showing All data/)).toBeInTheDocument();
  });

  it('preserves the loaded page and chart when refresh fails', async () => {
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    failQuotes = true;
    fireEvent.click(screen.getByRole('button', { name: /Refresh ticker/ }));
    await screen.findByRole('alert');
    expect(screen.getByTestId('stock-chart')).toHaveTextContent('110,111');
    expect(screen.getByText(/Refresh failed/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Apple' })).toBeInTheDocument();
  });
});
