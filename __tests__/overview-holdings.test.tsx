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
