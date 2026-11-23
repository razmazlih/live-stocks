
vi.mock('@/hooks/use-investment-sources', () => {
  const sources = [
    { id: 'bank_one', name: 'ONE ZERO', archivedAt: null, createdAt: '2026-01-01' },
    { id: 'bank_two', name: 'Pepper', archivedAt: null, createdAt: '2026-01-02' },
  ];
  return { useInvestmentSources: () => ({ sources, activeSources: sources, loading: false, error: null,
    sourceName: (id: string) => sources.find(source => source.id === id)?.name ?? 'Unavailable source',
    resolveLocation: (id: string) => id, createSource: vi.fn(),
  }) };
});
import type { ComponentProps, ReactNode } from 'react';
import type { Sparkline } from '@/components/charts/sparkline';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewClock, setReviewActive } from '@/lib/demo/review';
import { createDefaultTransactionForm } from '@/components/portfolio/transaction-composer';
import { StockDetailView } from '@/app/stock/[symbol]/stock-detail-view';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: { annualGrowthRate: 0.08, finnhubToken: 'test-token' } }) }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({ DashboardRouteShell: ({ children, activeKey }: { children: ReactNode; activeKey: string }) => <div data-testid="route-shell" data-active={activeKey}>{children}</div> }));
vi.mock('@/components/dashboard/page-header', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/charts/sparkline', () => ({ Sparkline: (props: ComponentProps<typeof Sparkline>) => {
  latestChartProps = props;
  return <div data-testid="stock-chart">{props.points.map((point) => point.close).join(',')}</div>;
} }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: mockPositionRows ?? [mockPositionRow], error: null }) }) }) }) }));

type MockLot = { id: string; side: 'BUY' | 'SELL'; quantity: number; price: number; executed_at: string; has_commission: boolean; commission_amount: number; commission_known?: boolean };
let mockPositionRow: { id: string; symbol: string; display: string; location: string; quantity: number; entry_price: number; entry_date: string; position_lots: MockLot[] };
let mockPositionRows: typeof mockPositionRow[] | undefined;
let quotePrice: number;
let missingQuote: boolean;
let latestChartProps: ComponentProps<typeof Sparkline> | undefined;

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
  missingQuote = false;
  quotePrice = 120;
  mockPositionRows = undefined;
  latestChartProps = undefined;
  mockPositionRow = { id: 'one', symbol: 'AAPL', display: 'Apple', location: 'bank_one', quantity: 2, entry_price: 100, entry_date: '2025-01-01', position_lots: [] };
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (input.startsWith('/api/candles?symbol=ILS%3DX')) return candles(3.7);
    if (input.startsWith('/api/candles')) return nextCandleRequests.shift()?.promise ?? candles(110);
    if (input.startsWith('/api/quote')) {
      if (failQuotes) throw new Error('Offline');
      if (missingQuote) return new Response(JSON.stringify({ error: 'Quote unavailable' }), { status: 200 });
      return new Response(JSON.stringify({ c: quotePrice, d: 2, dp: 1.7 }), { status: 200 });
    }
    return new Response(JSON.stringify({ usdToIls: 3.7 }), { status: 200 });
  }));
});
afterEach(() => { setReviewActive(false); vi.unstubAllGlobals(); });

describe('stock detail continuity', () => {
  it.each([['regular', '2026-11-20'], ['extended', '2026-11-20'], ['closed', '2026-11-21']])('anchors review candle requests and new trade dates to the %s scenario', async (scenario, day) => {
    window.history.replaceState(null, '', '/?scenario=' + scenario);
    setReviewActive(true);
    expect(createDefaultTransactionForm().executedAt).toBe(day);
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    const candlesUrl = vi.mocked(fetch).mock.calls.map(([url]) => String(url)).find(url => url.startsWith('/api/candles?symbol=AAPL'));
    expect(candlesUrl).toBeDefined();
    expect(Number(new URL(candlesUrl!, 'http://localhost').searchParams.get('to'))).toBe(Math.floor(reviewClock() / 1000));
  });

  it('opens the inline composer, requires a source and keeps entered values during a quote refresh', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    window.history.replaceState(null, '', '/?q=apple');
    mockPositionRows = [mockPositionRow, { ...mockPositionRow, id: 'two', location: 'bank_two' }];
    render(<StockDetailView symbol="AAPL" inspector={{ expand: vi.fn(), setSaving: vi.fn() }} />);
    await screen.findByTestId('stock-chart');
    fireEvent.click(screen.getByRole('button', { name: 'Record sale' }));
    const form = screen.getByRole('region', { name: 'Record trade' });
    const source = within(form).getByRole('combobox', { name: 'Investment source' });
    expect(source).toHaveValue('');
    const save = within(form).getByRole('button', { name: 'Save transaction' });
    expect(save).toBeDisabled();
    fireEvent.change(source, { target: { value: 'bank_two' } });
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Price' }), { target: { value: 101 } });
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Quantity' }), { target: { value: 1 } });
    quotePrice = 140;
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(within(form).getByRole('button', { name: /Use market quote/ })).toHaveTextContent('140'));
    expect(within(form).getByRole('spinbutton', { name: 'Price' })).toHaveValue(101);
    expect(within(form).getByRole('radio', { name: 'Sell' })).toBeChecked();
    expect(save).toBeEnabled();
    expect(window.location.search).toBe('?q=apple');
  });

  it('shows quotes and history for an unheld ticker and carries its symbol into a first purchase', async () => {
    mockPositionRows = [];
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    expect(screen.getByRole('heading', { name: 'Price history' })).toBeInTheDocument();
    expect(screen.queryByText('Holding value')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record trade' })).toHaveAttribute('href', '/positions?action=add&symbol=AAPL');
    expect(screen.getByRole('link', { name: 'Back to Activity' })).toHaveAttribute('href', '/positions?q=apple');
  });

  it('preserves unknown fees and the selected stock source when recording another trade', async () => {
    mockPositionRow.position_lots = [
      { id: 'one', side: 'BUY', quantity: 2, price: 100, executed_at: '2025-01-01', has_commission: false, commission_amount: 0, commission_known: false },
    ];
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    expect(screen.getByText('Commission unknown')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record trade' })).toHaveAttribute('href', '/positions?action=add&symbol=AAPL&source=bank_one');
  });

  it('starts with every holding cycle, retains the latest rebuy and always shows the overall exit target', async () => {
    mockPositionRow.position_lots = [
      { id: 'first-buy', side: 'BUY', quantity: 2, price: 100, executed_at: '2025-01-01T12:00:00Z', has_commission: false, commission_amount: 0 },
      { id: 'full-exit', side: 'SELL', quantity: 2, price: 80, executed_at: '2025-01-03T12:00:00Z', has_commission: false, commission_amount: 0 },
      { id: 'rebuy', side: 'BUY', quantity: 2, price: 110, executed_at: '2025-01-20T12:00:00Z', has_commission: false, commission_amount: 0 },
    ];
    const history = deferred();
    nextCandleRequests.push(history);
    render(<StockDetailView symbol="AAPL" />);
    await act(async () => history.resolve(new Response(JSON.stringify({ s: 'ok', t: [1, 2, 17, 19].map((day) => Date.UTC(2025, 0, day) / 1000), c: [100, 102, 108, 109], o: [100, 102, 108, 109], h: [100, 102, 108, 109], l: [100, 102, 108, 109], v: [1, 1, 1, 1] }), { status: 200 })));
    await screen.findByTestId('stock-chart');

    expect(screen.getByRole('button', { name: 'All cycles' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('stock-chart')).toHaveTextContent('100,102,108,109');
    expect(latestChartProps?.events?.map((event) => event.id)).toEqual(['first-buy', 'full-exit', 'rebuy']);
    expect(latestChartProps?.includeEventsInDomain).toBe(true);
    expect(latestChartProps?.holdingPeriods?.map((period) => period.current)).toEqual([false, true]);
    expect(latestChartProps?.requiredExitPrice).toEqual(expect.any(Number));
    expect(screen.queryByRole('button', { name: /target|exit price/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Current holding' }));
    expect(screen.getByTestId('stock-chart')).toHaveTextContent('108,109');
    expect(latestChartProps?.events?.map((event) => event.id)).toEqual(['rebuy']);
    expect(latestChartProps?.requiredExitPrice).toEqual(expect.any(Number));
    expect(screen.getByRole('button', { name: 'Current holding' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('distinguishes current unrealized profit from cumulative results after a full exit and rebuy', async () => {
    mockPositionRow.position_lots = [
      { id: 'old-buy', side: 'BUY', quantity: 2, price: 100, executed_at: '2025-01-01', has_commission: false, commission_amount: 0 },
      { id: 'old-sale', side: 'SELL', quantity: 2, price: 80, executed_at: '2025-01-03', has_commission: false, commission_amount: 0 },
      { id: 'new-buy', side: 'BUY', quantity: 2, price: 110, executed_at: '2025-01-20', has_commission: false, commission_amount: 0 },
    ];
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');

    expect(screen.getByText('Holding value').closest('div')?.querySelector('dd')).toHaveTextContent('$240.00');
    expect(screen.getByText('Unrealized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('$20.00');
    expect(screen.getByText('Cumulative P/L').closest('div')?.querySelector('dd')).toHaveTextContent('-$20.00');
    expect(screen.getByText('Previously realized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('-$40.00');
    expect(screen.getByText('Remaining cost basis').closest('div')?.querySelector('dd')).toHaveTextContent('$220.00');
  });

  it('keeps account FIFO isolated when one account sells its own later purchase', async () => {
    quotePrice = 250;
    const rowOne = { ...mockPositionRow, quantity: 1, entry_price: 300, position_lots: [
      { id: 'bank-one-buy', side: 'BUY' as const, quantity: 1, price: 300, executed_at: '2025-01-01', has_commission: false, commission_amount: 0 },
    ] };
    const rowTwo = { ...mockPositionRow, id: 'two', location: 'bank_two', quantity: 0, entry_price: 100, entry_date: '2025-01-02', position_lots: [
      { id: 'bank-two-buy', side: 'BUY' as const, quantity: 1, price: 100, executed_at: '2025-01-02', has_commission: false, commission_amount: 0 },
      { id: 'bank-two-sale', side: 'SELL' as const, quantity: 1, price: 80, executed_at: '2025-01-03', has_commission: false, commission_amount: 0 },
    ] };
    mockPositionRows = [rowOne, rowTwo];
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');

    expect(screen.getByText('Holding value').closest('div')?.querySelector('dd')).toHaveTextContent('$250.00');
    expect(screen.getByText('Unrealized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('-$50.00');
    expect(screen.getByText('Cumulative P/L').closest('div')?.querySelector('dd')).toHaveTextContent('-$70.00');
    expect(screen.getByText('Remaining cost basis').closest('div')?.querySelector('dd')).toHaveTextContent('$300.00');
    expect(screen.getByText('Previously realized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('-$20.00');
  });

  it('includes legacy shares alongside recorded lots without claiming complete historical profit', async () => {
    quotePrice = 250;
    mockPositionRows = [
      { ...mockPositionRow, quantity: 1, entry_price: 300, position_lots: [] },
      { ...mockPositionRow, id: 'two', location: 'bank_two', quantity: 1, entry_price: 100, position_lots: [
        { id: 'recorded-buy', side: 'BUY', quantity: 1, price: 100, executed_at: '2025-01-02', has_commission: false, commission_amount: 0 },
      ] },
    ];
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    expect(screen.getByText('Holding value').closest('div')?.querySelector('dd')).toHaveTextContent('$500.00');
    expect(screen.getByText('Unrealized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('$100.00');
    expect(screen.getByText('Remaining cost basis').closest('div')?.querySelector('dd')).toHaveTextContent('$400.00');
    expect(screen.getByText('Cumulative P/L').closest('div')?.querySelector('dd')).toHaveTextContent('—');
  });

  it('does not present realized-only profit as a cumulative total when the current quote is unavailable', async () => {
    missingQuote = true;
    mockPositionRow.position_lots = [
      { id: 'buy', side: 'BUY', quantity: 2, price: 100, executed_at: '2025-01-01', has_commission: false, commission_amount: 0 },
      { id: 'partial-sale', side: 'SELL', quantity: 1, price: 80, executed_at: '2025-01-03', has_commission: false, commission_amount: 0 },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');

    expect(screen.getByText('Holding value').closest('div')?.querySelector('dd')).toHaveTextContent('—');
    expect(screen.getByText('Unrealized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('—');
    expect(screen.getByText('Cumulative P/L').closest('div')?.querySelector('dd')).toHaveTextContent('—');
    expect(screen.getByText('Previously realized P/L').closest('div')?.querySelector('dd')).toHaveTextContent('-$20.00');
    warn.mockRestore();
  });

  it('retains the last chart during range changes and ignores a late older response', async () => {
    render(<StockDetailView symbol="AAPL" />);
    await screen.findByTestId('stock-chart');
    expect(screen.getByTestId('route-shell')).toHaveAttribute('data-active', 'positions');
    expect(screen.queryByRole('group', { name: 'Holding cycle view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Holding cycle timeline' })).not.toBeInTheDocument();
    const fxRequest = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).find((url) => url.startsWith('/api/candles?symbol=ILS%3DX'));
    expect(fxRequest).toBeDefined();
    expect(Number(new URL(fxRequest!, 'http://localhost').searchParams.get('from'))).toBeLessThanOrEqual(1735689600 - 10 * 86400);
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
