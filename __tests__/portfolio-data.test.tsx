import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortfolioDataProvider, usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioFeedback } from '@/components/dashboard/portfolio-feedback';
import type { PortfolioTimelinePoint, Position } from '@/types';

const appState = vi.hoisted(() => ({
  settingsReady: true,
  refreshTrigger: 0,
  settings: { annualGrowthRate: 0.05, refreshInterval: 0 },
}));
vi.mock('@/lib/context', () => ({ useApp: () => appState }));

function Consumer({ label }: { label: string }) {
  const data = usePortfolioData();
  return <div>
    <output data-testid={label}>{JSON.stringify({ loading: data.loading, refreshing: data.refreshing, hasData: data.hasData, error: data.error, updated: data.lastUpdate?.toISOString(), rate: data.usdToIls })}</output>
    <button onClick={() => void data.reload()}>Reload {label}</button>
  </div>;
}
function TimelineConsumer() {
  const { portfolioTimeline, summary, metrics, openSummary } = usePortfolioData();
  return <output data-testid="timeline">{JSON.stringify({ points: portfolioTimeline, summary, metrics, openSummary })}</output>;
}
const successful = (rate = 3.7) => ({ ok: true, json: async () => ({ positions: [], usdToIls: rate }) });
const read = (label = 'first') => JSON.parse(screen.getByTestId(label).textContent!);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  appState.refreshTrigger = 0;
});

describe('shared portfolio data', () => {
  it('shares one request across consumers and retains data when consumers change', async () => {
    const fetch = vi.fn().mockResolvedValue(successful());
    vi.stubGlobal('fetch', fetch);
    const view = render(<PortfolioDataProvider><Consumer label="first" /><Consumer label="second" /></PortfolioDataProvider>);
    await waitFor(() => expect(read().hasData).toBe(true));
    expect(read('second').updated).toBe(read().updated);
    expect(fetch).toHaveBeenCalledTimes(1);
    view.rerender(<PortfolioDataProvider><Consumer label="third" /></PortfolioDataProvider>);
    expect(read('third').hasData).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates refresh and retains successful values and timestamp on failure', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn().mockResolvedValueOnce(successful(4)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PortfolioDataProvider><Consumer label="first" /><Consumer label="second" /></PortfolioDataProvider>);
    await waitFor(() => expect(read().hasData).toBe(true));
    const updated = read().updated;
    fireEvent.click(screen.getByText('Reload first'));
    fireEvent.click(screen.getByText('Reload second'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(read()).toMatchObject({ loading: false, refreshing: true, rate: 4, hasData: true });
    await act(async () => finish({ ok: false, status: 503 }));
    expect(read()).toMatchObject({ loading: false, refreshing: false, rate: 4, hasData: true, error: 'portfolio_load_failed', updated });
  });

  it('distinguishes an initial failure from an empty successful portfolio and retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }).mockResolvedValueOnce(successful()));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PortfolioDataProvider><Consumer label="first" /></PortfolioDataProvider>);
    await waitFor(() => expect(read().error).toBe('portfolio_load_failed'));
    expect(read().hasData).toBe(false);
    fireEvent.click(screen.getByText('Reload first'));
    await waitFor(() => expect(read().hasData).toBe(true));
    expect(read().error).toBeNull();
  });

  it('aborts invalidated requests and ignores their late results', async () => {
    let finishOld!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(successful(4));
    vi.stubGlobal('fetch', fetch);
    const view = render(<PortfolioDataProvider><Consumer label="first" /></PortfolioDataProvider>);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    appState.refreshTrigger++;
    view.rerender(<PortfolioDataProvider><Consumer label="first" /></PortfolioDataProvider>);
    await waitFor(() => expect(read().rate).toBe(4));
    expect(signal.aborted).toBe(true);
    await act(async () => finishOld(successful(2)));
    expect(read()).toMatchObject({ rate: 4, refreshing: false, hasData: true });
  });

  it('shows retry instead of a misleading empty state when initial loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(successful()));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PortfolioDataProvider><PortfolioFeedback locale="he"><p>Empty portfolio</p></PortfolioFeedback></PortfolioDataProvider>);
    await screen.findByRole('alert');
    expect(screen.queryByText('Empty portfolio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון חוזר' }));
    await screen.findByText('Empty portfolio');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps pre-entry chart context separate from valuation candles and portfolio history', async () => {
    const timestamp = Date.UTC(2026, 10, 10, 12);
    const position: Position = { id: 'context-test', symbol: 'TEST', display: 'Test', imageUrl: '', quantity: 1, entryPrice: 100, entryDate: new Date(timestamp).toISOString(), location: 'bank_one', lots: [{ type: 'BUY', price: 100, quantity: 1, executedAt: new Date(timestamp).toISOString(), hasCommission: false, commissionAmount: 0 }] };
    const normal = [{ timestamp: timestamp + 86400000, close: 110 }];
    const context = [{ timestamp: timestamp - 7 * 86400000, close: 999999 }, ...normal];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ positions: [position], activationPositions: [position], usdToIls: 3.7, quotes: { TEST: { c: 120 } }, fxHistoryPoints: [{ timestamp, close: 3.7 }], candlesByKey: { 'context-test': normal }, contextCandlesByKey: { 'context-test': context } }) }));
    function ContextConsumer() {
      const data = usePortfolioData();
      return <output data-testid="context-data">{JSON.stringify({ normal: data.sparklineData, context: data.contextSparklineData, points: data.portfolioTimeline })}</output>;
    }
    render(<PortfolioDataProvider><Consumer label="first" /><ContextConsumer /></PortfolioDataProvider>);
    await waitFor(() => expect(read().hasData).toBe(true));
    const data = JSON.parse(screen.getByTestId('context-data').textContent!);
    expect(data.normal['context-test']).toEqual(normal);
    expect(data.context['context-test']).toEqual(context);
    expect(data.points.every((point: PortfolioTimelinePoint) => point.timestamp >= timestamp)).toBe(true);
  });

  it('keeps realized and unrealized historical profits before tax in both currencies', async () => {
    const date = (day: number) => `2024-01-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    const position: Position = {
      id: 'history', symbol: 'TEST', display: 'Test stock', imageUrl: '',
      entryPrice: 100, quantity: 0, entryDate: date(1), location: 'bank_one',
      lots: [
        { type: 'BUY', price: 100, quantity: 10, executedAt: date(1), hasCommission: false, commissionAmount: 0 },
        { type: 'SELL', price: 120, quantity: 4, executedAt: date(10), hasCommission: false, commissionAmount: 0 },
        { type: 'SELL', price: 130, quantity: 6, executedAt: date(20), hasCommission: false, commissionAmount: 0 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      positions: [position], activationPositions: [position], usdToIls: 3,
      fxHistoryPoints: [{ timestamp: Date.parse(date(1)), close: 3 }],
      quotes: { TEST: { c: 135 } },
      candlesByKey: { history: [
        { timestamp: new Date(date(2)).getTime(), close: 100 },
        { timestamp: new Date(date(11)).getTime(), close: 110 },
        { timestamp: new Date(date(21)).getTime(), close: 135 },
      ] },
    }) }));
    render(<PortfolioDataProvider><Consumer label="first" /><TimelineConsumer /></PortfolioDataProvider>);
    await waitFor(() => expect(read().hasData).toBe(true));
    const { points, summary } = JSON.parse(screen.getByTestId('timeline').textContent!);
    const partial = points.find((point: PortfolioTimelinePoint) => point.timestamp === Date.parse('2024-01-11T23:59:59.999Z'));
    // Four sold shares earned $80; six remaining shares earned $60. Tax is $20.
    expect(partial).toMatchObject({ totalPnLUsd: 140, totalPnLIls: 420, netPnLUsd: 120, netPnLIls: 360 });
    const closed = points.find((point: PortfolioTimelinePoint) => point.timestamp === Date.parse('2024-01-21T23:59:59.999Z'));
    // After the remaining sale, all $260 stays in actual P/L; estimated tax is $65.
    expect(closed).toMatchObject({ totalPnLUsd: 260, totalPnLIls: 780, netPnLUsd: 195, netPnLIls: 585 });
    expect(points.at(-1)).toMatchObject({
      totalPnLUsd: summary.totalCurrentPnLUsd, totalPnLIls: summary.totalCurrentPnLIls,
      netPnLUsd: summary.totalNetPnLUsd, netPnLIls: summary.totalNetPnLIls,
    });
  });


  it.each([undefined, {}, { c: 0 }, { c: -1 }, { c: Number.NaN }])('does not replace a missing or invalid open market quote (%j) with its entry price', async (missingQuote) => {
    const open: Position = {
      id: 'missing', symbol: 'MISSING', display: 'Missing quote', imageUrl: '',
      entryPrice: 100, quantity: 2, entryDate: '2024-01-01', location: 'bank_one',
      lots: [{ type: 'BUY', price: 100, quantity: 2, executedAt: '2024-01-01', hasCommission: false, commissionAmount: 0 }],
    };
    const priced: Position = {
      ...open, id: 'priced', symbol: 'PRICED', entryPrice: 10, quantity: 1,
      lots: [{ type: 'BUY', price: 10, quantity: 1, executedAt: '2024-01-01', hasCommission: false, commissionAmount: 0 }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      positions: [open, priced], activationPositions: [open, priced], usdToIls: 3,
      quotes: { MISSING: missingQuote, PRICED: { c: 20, d: 1 } },
    }) }));
    render(<PortfolioDataProvider><Consumer label="first" /><TimelineConsumer /></PortfolioDataProvider>);
    await waitFor(() => expect(read().hasData).toBe(true));
    const { metrics, summary, openSummary, points } = JSON.parse(screen.getByTestId('timeline').textContent!);
    // JSON represents the hook's non-finite unknown values as null, never invented zeros.
    expect(metrics[0]).toMatchObject({ currentPrice: null, currentValue: null, positionPnLUsd: null, combined: null });
    expect(metrics[1]).toMatchObject({ currentPrice: 20, currentValue: 20, positionPnLUsd: 10 });
    expect(summary).toMatchObject({ totalValue: null, totalCurrentPnLUsd: null, totalCurrentPnLIls: null });
    expect(openSummary.totalCurrentPnLUsd).toBeNull();
    expect(Number.isFinite(summary.totalProjectedPnLUsd)).toBe(true);
    expect(points.at(-1)).toMatchObject({ totalPnLUsd: null, totalPnLIls: null });
    expect(read()).toMatchObject({ hasData: true, error: null });
  });

  it('preserves fully realized profit when closed holdings have no current quote', async () => {
    const closed: Position = {
      id: 'closed', symbol: 'SOLD', display: 'Sold stock', imageUrl: '',
      entryPrice: 50, quantity: 0, entryDate: '2024-01-01', location: 'bank_one',
      lots: [
        { type: 'BUY', price: 50, quantity: 1, executedAt: '2024-01-01', hasCommission: false, commissionAmount: 0 },
        { type: 'SELL', price: 80, quantity: 1, executedAt: '2024-01-02', hasCommission: false, commissionAmount: 0 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      positions: [closed], activationPositions: [closed], usdToIls: 3, quotes: {},
      fxHistoryPoints: [{ timestamp: Date.parse('2024-01-01'), close: 3 }],
    }) }));
    render(<PortfolioDataProvider><Consumer label="first" /><TimelineConsumer /></PortfolioDataProvider>);
    await waitFor(() => expect(read().hasData).toBe(true));
    const { metrics, summary } = JSON.parse(screen.getByTestId('timeline').textContent!);
    expect(metrics[0]).toMatchObject({ currentPrice: null, currentValue: 0, positionPnLUsd: 0 });
    expect(summary).toMatchObject({ totalValue: 0, totalCurrentPnLUsd: 30, totalCurrentPnLIls: 90, totalNetPnLUsd: 22.5 });
  });

});
