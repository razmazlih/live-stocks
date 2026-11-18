import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewHoldings } from '@/components/portfolio/overview-holdings';
import type { Position, PositionMetrics } from '@/types';
import { calculatePositionMetrics, calculateRequiredExitPrice, formatCurrency } from '@/lib/calculations';
import { validateReturnTo } from '@/lib/navigation-context';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: { currency: 'USD', annualGrowthRate: 0.1 } }) }));
const metric = (symbol: string, gap: number, quantity = 1): PositionMetrics => ({
  position: { id: symbol, symbol, display: symbol === 'AAPL' ? 'Apple' : 'Microsoft', quantity },
  currentPrice: 100, currentValue: 100 * quantity, currentValueIls: 320 * quantity,
  positionPnLUsd: 20, positionPnLIls: 64, combined: gap, combinedIls: gap * 3.2,
  requiredExitPrice: 100 - gap,
  dailyChangePercent: symbol === 'AAPL' ? -2.5 : undefined, roiPercent: 25,
} as PositionMetrics);
const metrics = [metric('AAPL', -10), metric('MSFT', 20), metric('CLOSED', -30, 0)];

describe('overview holdings continuity', () => {
  beforeEach(() => window.history.replaceState(null, '', '/?chartRange=1Y'));
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('labels daily percentage separately from return since entry and leaves missing daily quotes unavailable', () => {
    render(<OverviewHoldings metrics={metrics} />);
    const table = within(screen.getByRole('table'));
    const apple = within(table.getByRole('row', { name: /AAPL/ }));
    expect(apple.getByText('-2.50%')).toBeInTheDocument();
    expect(apple.getByText('+25.00%')).toBeInTheDocument();
    expect(apple.getByText('today')).toBeInTheDocument();
    expect(apple.getByText('since entry')).toBeInTheDocument();
    expect(within(table.getByRole('row', { name: /MSFT/ })).getByText('—')).toBeInTheDocument();
  });
  it('shows real pre-entry price context for a fresh holding without calling it historical profit', async () => {
    const entry = Date.UTC(2026, 10, 12, 12);
    const position: Position = { id: 'fresh', activationId: 'fresh::activation-1', activationStart: new Date(entry).toISOString(), symbol: 'FRESH', display: 'Fresh', imageUrl: '', quantity: 2, entryPrice: 100, entryDate: new Date(entry).toISOString(), location: 'bank_one', lots: [
      { type: 'BUY', price: 100, quantity: 2, executedAt: new Date(entry).toISOString(), hasCommission: false, commissionAmount: 0 },
    ] };
    const holding = { ...calculatePositionMetrics(position, 110, 3.2, .1), requiredExitPrice: 110 };
    const context = [5, 6, 9, 10, 11].map((day, index) => ({timestamp: Date.UTC(2026, 10, day, 14), close: 90 + index}));
    const latest = {timestamp: entry + 3_600_000, close: 110};
    render(<OverviewHoldings metrics={[holding]} positions={[position]} sparklineData={{'fresh::activation-1': [latest]}} contextSparklineData={{'fresh::activation-1': [...context, latest]}} />);
    await userEvent.click(screen.getByRole('button', {name: 'Expand FRESH details'}));
    expect(screen.getByRole('img', {name: /FRESH price chart/})).toBeInTheDocument();
    expect(screen.getByText('Share price · USD')).toBeVisible();
    expect(screen.getByText(/One week before entry in gray/)).toBeVisible();
    expect(screen.queryByText('Not enough price data to show a trend')).not.toBeInTheDocument();
    const stroke = document.querySelector('[data-price-stroke="true"]');
    expect(stroke?.querySelector('stop')).toHaveAttribute('stop-color', '#64748b');
    expect(document.querySelector('[data-price-line="true"]')).toBeInTheDocument();
  });

  it('shows a sale target recovering earlier partial losses in the collapsed card', () => {
    const asOf = new Date('2025-01-01T00:00:00Z');
    const position: Position = {
      id: 'TEST', symbol: 'TEST', display: 'Test Corp', imageUrl: '',
      entryPrice: 100, quantity: 6, entryDate: '2024-01-01T00:00:00Z', location: 'bank_one',
      lots: [
        { type: 'BUY', price: 100, quantity: 10, executedAt: '2024-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
        { type: 'SELL', price: 90, quantity: 4, executedAt: '2025-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
      ],
    };
    const requiredExitPrice = calculateRequiredExitPrice([position], 0.1, asOf);
    const holding = { ...calculatePositionMetrics(position, 100, 3.2, 0), requiredExitPrice, projectedPrice: 110 };
    render(<OverviewHoldings metrics={[holding]} />);
    const button = screen.getByRole('button', { name: 'Expand TEST details' });
    const summary = within(document.getElementById(button.getAttribute('aria-describedby')!)!);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(summary.getByText(formatCurrency(123.37, 'USD', 'en'))).toBeInTheDocument();
    expect(summary.getByText(/23\.37%/)).toBeInTheDocument();
    expect(summary.queryByText(formatCurrency(110, 'USD', 'en'))).not.toBeInTheDocument();
  });
  it('rounds the target upward to a tradable cent before comparing it with today’s price', () => {
    render(<OverviewHoldings metrics={[{ ...metric('AAPL', 0), requiredExitPrice: 100.001 }]} />);
    const button = screen.getByRole('button', { name: 'Expand AAPL details' });
    const summary = within(document.getElementById(button.getAttribute('aria-describedby')!)!);
    expect(summary.getByText(formatCurrency(100.01, 'USD', 'en'))).toBeInTheDocument();
    expect(summary.getByText(/0\.01%/)).toBeInTheDocument();
  });
  it('measures an already exceeded target relative to the target price', () => {
    render(<OverviewHoldings metrics={[{ ...metric('AAPL', 0), currentPrice: 125, requiredExitPrice: 100 }]} />);
    const button = screen.getByRole('button', { name: 'Expand AAPL details' });
    const summary = within(document.getElementById(button.getAttribute('aria-describedby')!)!);
    expect(summary.getByText(/25\.00%/)).toBeInTheDocument();
    expect(summary.queryByText(/20\.00%/)).not.toBeInTheDocument();
  });
  it('leaves an unavailable full-history sale target unknown instead of using the open-lot target', () => {
    render(<OverviewHoldings metrics={[{ ...metric('AAPL', -10), requiredExitPrice: undefined, projectedPrice: 110 }]} />);
    const button = screen.getByRole('button', { name: 'Expand AAPL details' });
    const summary = within(document.getElementById(button.getAttribute('aria-describedby')!)!);
    expect(summary.getAllByText('—').length).toBeGreaterThan(0);
    expect(summary.queryByText(formatCurrency(110, 'USD', 'en'))).not.toBeInTheDocument();
  });
  it('expands mobile details by keyboard, keeps a single card open, and restores stock return context', async () => {
    const user = userEvent.setup();
    render(<OverviewHoldings metrics={metrics} />);
    const apple = screen.getByRole('button', { name: 'Expand AAPL details' });
    const microsoft = screen.getByRole('button', { name: 'Expand MSFT details' });
    const panel = document.getElementById(apple.getAttribute('aria-controls')!)!;
    expect(apple).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('inert');
    expect(screen.queryByRole('link', { name: 'View AAPL details' })).not.toBeInTheDocument();
    apple.focus();
    await user.keyboard('{Enter}');
    expect(apple).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('inert');
    expect(apple).toHaveFocus();
    expect(window.location.search).toBe('?chartRange=1Y');
    expect(within(apple).queryByText('Close', { exact: true })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'View AAPL details' });
    expect(validateReturnTo(new URL(link.getAttribute('href')!, 'http://local.test').searchParams.get('returnTo'))).toBe('/?chartRange=1Y');
    // Prevent navigation in jsdom while exercising the return-context handler.
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
    expect(apple).toHaveAttribute('aria-expanded', 'true');
    expect(JSON.parse(sessionStorage.getItem('livestocks:return-context')!).focusId).toBe(apple.id);
    await user.click(microsoft);
    expect(apple).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
    expect(microsoft).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(microsoft).toHaveAttribute('aria-expanded', 'false');
    expect(new URLSearchParams(window.location.search).get('holding')).toBeNull();
  });
  it('collapses from the expanded details and chart space while preserving the keyboard toggle', async () => {
    const user = userEvent.setup();
    render(<OverviewHoldings metrics={metrics} />);
    const toggle = screen.getByRole('button', { name: 'Expand AAPL details' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    await user.click(toggle);
    await user.click(within(panel).getByText('Purchase cost'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(new URLSearchParams(window.location.search).get('holding')).toBeNull();
    await user.keyboard('{Enter}');
    await user.click(panel.querySelector('.holding-chart-slot')!);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('inert');
  });
  it('discards a legacy open-card URL while preserving search and chart range', () => {
    window.history.replaceState(null, '', '/?holding=MSFT&q=Microsoft&chartRange=1Y');
    render(<OverviewHoldings metrics={metrics} />);
    expect(screen.getByRole('button', { name: 'Expand MSFT details' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'View MSFT details' })).not.toBeInTheDocument();
    const query = new URLSearchParams(window.location.search);
    expect(query.get('holding')).toBeNull();
    expect(query.get('q')).toBe('Microsoft');
    expect(query.get('chartRange')).toBe('1Y');
  });
  it('starts with all cards collapsed after the overview mounts again', async () => {
    const user = userEvent.setup();
    const first = render(<OverviewHoldings metrics={metrics} />);
    await user.click(screen.getByRole('button', { name: 'Expand AAPL details' }));
    expect(screen.getByRole('button', { name: 'Collapse AAPL details' })).toHaveAttribute('aria-expanded', 'true');
    expect(window.location.search).toBe('?chartRange=1Y');
    first.unmount();
    render(<OverviewHoldings metrics={metrics} />);
    expect(screen.getByRole('button', { name: 'Expand AAPL details' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Expand MSFT details' })).toHaveAttribute('aria-expanded', 'false');
  });
  it.each([
    { reducedMotion: false, closeFrom: 'header' },
    { reducedMotion: false, closeFrom: 'footer' },
    { reducedMotion: false, closeFrom: 'details' },
    { reducedMotion: true, closeFrom: 'header' },
  ])('follows opening immediately but never scrolls on close ($closeFrom, reduced motion: $reducedMotion)', async ({ reducedMotion, closeFrom }) => {
    vi.useFakeTimers();
    let offset = 400;
    vi.stubGlobal('scrollY', offset);
    vi.stubGlobal('innerHeight', 902);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(5000);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number, y?: number) => {
      offset = typeof options === 'number' ? y ?? offset : options?.top ?? offset;
      vi.stubGlobal('scrollY', offset);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('holding-card')) {
        const top = 1000 - offset;
        const height = this.classList.contains('holding-card-open') ? 500 : 190;
        return { x: 0, y: top, top, left: 0, right: 360, bottom: top + height, width: 360, height, toJSON() {} };
      }
      return { x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 44, width: 360, height: 44, toJSON() {} };
    });
    render(<OverviewHoldings metrics={[metrics[0]]} />);
    const toggle = screen.getByRole('button', { name: 'Expand AAPL details' });
    const card = toggle.closest('article')!;
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    // No timer advance: following starts during the opening layout update.
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: reducedMotion ? 'auto' : 'instant' }));
    // Normal motion starts with a small step rather than jumping to the final offset.
    if (!reducedMotion) expect(Math.abs(offset - 400)).toBeLessThanOrEqual(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(280); });
    expect(card.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    expect(card.getBoundingClientRect().bottom).toBeLessThanOrEqual(902);
    const beforeClose = offset;
    scrollTo.mockClear();
    if (closeFrom === 'details') fireEvent.click(within(panel).getByText('Purchase cost'));
    else fireEvent.click(closeFrom === 'footer' ? screen.getByRole('button', { name: 'Close card' }) : toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(280); });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(offset).toBe(beforeClose);
    expect(toggle).toHaveFocus();
  });
  it('keeps local open state during a data refresh without scrolling or persisting it in the URL', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('scrollY', 400);
    vi.stubGlobal('innerHeight', 902);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 600, top: 600, left: 0, right: 360, bottom: 1100, width: 360, height: 500, toJSON() {} });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    window.history.replaceState(null, '', '/?holding=MSFT&chartRange=1Y');
    const { rerender } = render(<OverviewHoldings metrics={metrics} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(280); });
    expect(scrollTo).not.toHaveBeenCalled();
    const microsoft = screen.getByRole('button', { name: 'Expand MSFT details' });
    expect(microsoft).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(microsoft);
    await act(async () => { await vi.advanceTimersByTimeAsync(280); });
    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockClear();
    scrollBy.mockClear();
    rerender(<OverviewHoldings metrics={metrics.map(item => ({ ...item, currentPrice: item.currentPrice + 1 }))} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(280); });
    expect(screen.getByRole('button', { name: 'Collapse MSFT details' })).toHaveAttribute('aria-expanded', 'true');
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get('holding')).toBeNull();
  });
  it('filters active holdings, preserves the chart range and links back to the exact overview state', async () => {
    const user = userEvent.setup();
    render(<OverviewHoldings metrics={metrics} />);
    expect(screen.queryByRole('link', { name: /CLOSED/ })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search holdings' }), 'Apple');
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    const link = within(table).getByRole('link', { name: /AAPL/ });
    expect(validateReturnTo(new URL(link.getAttribute('href')!, 'http://local.test').searchParams.get('returnTo'))).toBe('/?chartRange=1Y&q=Apple');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter holdings' }), 'ahead');
    expect(screen.getByText('No active holdings match your filters.')).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '/?filter=lagging&chartRange=1Y');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(within(screen.getByRole('table')).getByRole('link', { name: /AAPL/ })).toBeInTheDocument();
  });
  it('keeps one price graph mounted while expanding and collapsing its card', async () => {
    const user = userEvent.setup();
    const history = [{ timestamp: Date.UTC(2025, 0, 1), close: 80 }, { timestamp: Date.UTC(2025, 0, 3), close: 100 }];
    const apple = { ...metrics[0], position: { ...metrics[0].position, entryDate: '2025-01-01T00:00:00Z', lots: [{ type: 'BUY' as const, executedAt: '2025-01-01T00:00:00Z', price: 80, quantity: 1, hasCommission: false, commissionAmount: 0 }] } };
    render(<OverviewHoldings metrics={[apple, metrics[1]]} sparklineData={{ AAPL: history }} />);
    const toggle = screen.getByRole('button', { name: 'Expand AAPL details' });
    const card = toggle.closest('article')!;
    const graph = card.querySelector('.holding-trend-layer svg');
    expect(graph).not.toBeNull();
    expect(card.querySelectorAll('.holding-trend-layer svg')).toHaveLength(1);
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(card.querySelector('.holding-trend-layer svg')).toBe(graph);
    expect(within(card).getByRole('img', { name: /AAPL cumulative USD profit/ })).toBeInTheDocument();
    await user.click(toggle);
    expect(card.querySelector('.holding-trend-layer svg')).toBe(graph);
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
  });

});
