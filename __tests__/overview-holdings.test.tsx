import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewHoldings } from '@/components/portfolio/overview-holdings';
import type { PositionMetrics } from '@/types';
import { validateReturnTo } from '@/lib/navigation-context';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: { currency: 'USD' } }) }));
const metric = (symbol: string, gap: number, quantity = 1): PositionMetrics => ({
  position: { id: symbol, symbol, display: symbol === 'AAPL' ? 'Apple' : 'Microsoft', quantity },
  currentPrice: 100, currentValue: 100 * quantity, currentValueIls: 320 * quantity,
  positionPnLUsd: 20, positionPnLIls: 64, combined: gap, combinedIls: gap * 3.2,
  dailyChangePercent: symbol === 'AAPL' ? -2.5 : undefined, roiPercent: 25,
} as PositionMetrics);
const metrics = [metric('AAPL', -10), metric('MSFT', 20), metric('CLOSED', -30, 0)];

describe('overview holdings continuity', () => {
  beforeEach(() => window.history.replaceState(null, '', '/?chartRange=1Y'));
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
    expect(new URLSearchParams(window.location.search).get('holding')).toBe('AAPL');
    const link = screen.getByRole('link', { name: 'View AAPL details' });
    expect(validateReturnTo(new URL(link.getAttribute('href')!, 'http://local.test').searchParams.get('returnTo'))).toBe('/?chartRange=1Y&holding=AAPL');
    // Prevent navigation in jsdom while exercising the return-context handler.
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
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
  it('reopens the selected mobile holding from its return URL', () => {
    window.history.replaceState(null, '', '/?holding=MSFT&q=Microsoft&chartRange=1Y');
    render(<OverviewHoldings metrics={metrics} />);
    expect(screen.getByRole('button', { name: 'Collapse MSFT details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'View MSFT details' })).toBeInTheDocument();
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
});
