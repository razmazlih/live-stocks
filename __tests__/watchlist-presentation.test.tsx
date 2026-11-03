import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TickerCard } from '@/components/watchlist/ticker-card';
import { TickerRow } from '@/components/watchlist/ticker-row';
import { getWatchlistDisplayData } from '@/lib/watchlist-display';

const chart = vi.hoisted(() => vi.fn());
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: {children: ReactNode}) => <>{children}</>,
  AreaChart: (props: {data: unknown}) => { chart(props.data); return <div data-testid="focus-chart" />; },
  Area: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
vi.mock('@/components/charts/sparkline', () => ({ Sparkline: () => <span data-testid="mini-chart" /> }));
const ticker = { id: 'msft', symbol: 'MSFT', display: 'Microsoft', note: 'Review next report' };
const history = [{ timestamp: Date.UTC(2025, 0, 1), close: 100 }, { timestamp: Date.UTC(2025, 0, 3), close: 120 }];
const props = { ticker, historical: history, quote: { c: 120, dp: -1.5 }, range: '1M' as const, locale: 'en' as const };
beforeEach(() => chart.mockClear());

describe('watchlist price presentation', () => {
  it('keeps daily quote and selected-period changes independent and sanitizes actual price history', () => {
    const data = getWatchlistDisplayData({ historical: [history[1], { timestamp: Number.NaN, close: 1 }, history[0]], quote: {c: 120, dp: -1.5} });
    expect(data.dailyPercent).toBe(-1.5);
    expect(data.periodPercent).toBe(20);
    expect(data.periodAbsolute).toBe(20);
    expect(data.history).toEqual(history);
    expect(getWatchlistDisplayData({ historical: history, quote: {c: 0, dp: Number.NaN} }).dailyPercent).toBeNull();
    expect(getWatchlistDisplayData({}).currentPrice).toBeNull();
  });

  it('shows a flat focus panel with real history, separate change values and a contextual stock link', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<TickerCard {...props} returnTo="/watchlist?group=tech&range=1M" />);
    expect(screen.getByText('-1.50%')).toHaveClass('font-semibold');
    expect(screen.getByText('+20.00%')).toBeInTheDocument();
    expect(screen.getByText('Review next report')).toBeInTheDocument();
    expect(screen.getByText('Starting price')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Stock details'})).toHaveAttribute('href', '/stock/MSFT?returnTo=%2Fwatchlist%3Fgroup%3Dtech%26range%3D1M');
    expect(chart).toHaveBeenCalledWith(history);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('retains last available chart and makes refresh failure visible', () => {
    render(<TickerCard {...props} loading error="Quote refresh failed" />);
    expect(screen.getByRole('status')).toHaveTextContent('Updating');
    expect(screen.getByRole('alert')).toHaveTextContent('Quote refresh failed');
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last available data');
    expect(screen.getByTestId('focus-chart')).toBeInTheDocument();
  });

  it('does not manufacture an empty chart or daily percentage when no quote exists', () => {
    render(<TickerCard ticker={ticker} locale="he" range="1M" />);
    expect(screen.getByText('אין נתונים לטווח שנבחר.')).toBeInTheDocument();
    expect(screen.queryByTestId('focus-chart')).not.toBeInTheDocument();
    expect(screen.queryByText(/0.00%/)).not.toBeInTheDocument();
  });

  it('separates selection from the ticker action menu and invokes each callback', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onRefresh = vi.fn();
    const onDelete = vi.fn();
    render(<TickerRow {...props} selected onSelect={onSelect} onEdit={onEdit} onRefresh={onRefresh} onDelete={onDelete} />);
    const selection = screen.getByRole('button', { name: 'View MSFT chart' });
    expect(selection).toHaveAttribute('aria-pressed', 'true');
    expect(selection.querySelector('button')).toBeNull();
    await user.click(selection);
    expect(onSelect).toHaveBeenCalledOnce();
    const trigger = screen.getByRole('button', { name: 'MSFT actions' });
    expect(selection).not.toContainElement(trigger);
    for (const [label, callback] of [['Refresh ticker', onRefresh], ['Edit ticker', onEdit], ['Delete ticker', onDelete]] as const) {
      await user.click(trigger);
      await user.click(screen.getByRole('menuitem', { name: label }));
      expect(callback).toHaveBeenCalledWith(ticker);
    }
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
