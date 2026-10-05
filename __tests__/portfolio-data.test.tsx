import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortfolioDataProvider, usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioFeedback } from '@/components/dashboard/portfolio-feedback';

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
});
