import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PositionCard } from '@/components/portfolio/position-card';
import { PositionsOverview } from '@/components/dashboard/positions/positions-overview';
import { formatCurrency } from '@/lib/calculations';
import type { PositionMetrics } from '@/types';

vi.mock('@/lib/context', () => ({
  useApp: () => ({ locale: 'en', settings: { currency: 'USD', annualGrowthRate: 10 } }),
}));
vi.mock('@/hooks/use-url-state', () => ({ useUrlState: () => [null, null, '/'] }));
vi.mock('@/components/ui/stock-avatar-image', () => ({ StockAvatarImage: () => null }));
vi.mock('@/components/charts/sparkline', () => ({ Sparkline: () => null }));

function metrics(closed = false): PositionMetrics {
  return {
    position: {
      id: closed ? 'closed' : 'active', symbol: closed ? 'OLD' : 'LIVE',
      display: closed ? 'Closed holding' : 'Active holding', imageUrl: '',
      entryPrice: 100, entryDate: '2025-01-01', location: 'bank_one',
      quantity: closed ? 0 : 10,
      lots: closed ? [
        { id: 'buy', type: 'BUY', quantity: 10, price: 100, hasCommission: false, commissionAmount: 0, executedAt: '2025-01-01' },
        { id: 'sell', type: 'SELL', quantity: 10, price: 125, hasCommission: false, commissionAmount: 0, executedAt: '2025-06-01' },
      ] : [],
    },
    currentPrice: 170, positionPnLUsd: 700, positionPnLIls: 2500,
    projectedPrice: 120, projectedPnLUsd: 200, projectedPnLIls: 700,
    combined: 500, combinedIls: 1800, yearsHeld: 1,
    currentValue: 1700, currentValueIls: 6000, roiPercent: 70,
    dailyChange: 2, dailyChangePercent: 1.2,
  };
}

afterEach(cleanup);

describe('collapsed position cards', () => {
  it('defaults to the desktop table and allows switching to cards', async () => {
    const user = userEvent.setup();
    render(<PositionsOverview openTitle="Active positions" closedTitle="Closed positions" openMetrics={[metrics()]} closedMetrics={[]} sparklineData={{}} />);
    const table = screen.getByRole('button', { name: 'Table' });
    const cards = screen.getByRole('button', { name: 'Cards' });
    expect(table).toHaveAttribute('aria-pressed', 'true');
    expect(cards).toHaveAttribute('aria-pressed', 'false');
    await user.click(cards);
    expect(table).toHaveAttribute('aria-pressed', 'false');
    expect(cards).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Active holding/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts active and closed holdings collapsed with distinct status and realized closed results', () => {
    render(<><PositionCard metrics={metrics()} /><PositionCard metrics={metrics(true)} /></>);
    const active = screen.getByRole('button', { name: /Active holding/ });
    const closed = screen.getByRole('button', { name: /Closed holding/ });
    for (const toggle of [active, closed]) {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const details = document.getElementById(toggle.getAttribute('aria-controls')!);
      expect(details).toHaveAttribute('aria-hidden', 'true');
      expect(details).toHaveAttribute('inert');
      expect(within(details!).getByRole('link', { hidden: true })).toHaveAttribute('tabindex', '-1');
    }
    expect(within(active).getByText('Active')).toBeInTheDocument();
    expect(within(active).getByText('Forecast gap')).toBeInTheDocument();
    expect(within(active).queryByText('Daily change')).not.toBeInTheDocument();
    expect(within(closed).getByText('Closed · Archive')).toBeInTheDocument();
    expect(within(closed).getByText('Realized profit / loss')).toBeInTheDocument();
    expect(within(closed).getByText(formatCurrency(250, 'USD', 'en'))).toBeInTheDocument();
    expect(within(closed).queryByText(formatCurrency(700, 'USD', 'en'))).not.toBeInTheDocument();
    expect(within(closed).queryByText('Daily change')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View details' })).not.toBeInTheDocument();
  });

  it('opens cards independently using the keyboard and can collapse one while the other stays open', async () => {
    const user = userEvent.setup();
    render(<><PositionCard metrics={metrics()} /><PositionCard metrics={metrics(true)} /></>);
    const active = screen.getByRole('button', { name: /Active holding/ });
    const closed = screen.getByRole('button', { name: /Closed holding/ });
    act(() => active.focus());
    await user.keyboard('{Enter}');
    expect(active).toHaveAttribute('aria-expanded', 'true');
    expect(closed).toHaveAttribute('aria-expanded', 'false');
    const activeDetails = document.getElementById(active.getAttribute('aria-controls')!)!;
    expect(activeDetails).toHaveAttribute('aria-hidden', 'false');
    expect(activeDetails).not.toHaveAttribute('inert');
    expect(within(activeDetails).getByRole('link', { name: 'View details' })).not.toHaveAttribute('tabindex', '-1');
    await user.click(closed);
    expect(active).toHaveAttribute('aria-expanded', 'true');
    expect(closed).toHaveAttribute('aria-expanded', 'true');
    const closedDetails = document.getElementById(closed.getAttribute('aria-controls')!)!;
    expect(within(closedDetails).queryByText('Daily change')).not.toBeInTheDocument();
    await user.click(active);
    expect(active).toHaveAttribute('aria-expanded', 'false');
    expect(closed).toHaveAttribute('aria-expanded', 'true');
    expect(activeDetails).toHaveAttribute('aria-hidden', 'true');
    expect(activeDetails).toHaveAttribute('inert');
    expect(closedDetails).toHaveAttribute('aria-hidden', 'false');
    expect(closedDetails).not.toHaveAttribute('inert');
  });
});
