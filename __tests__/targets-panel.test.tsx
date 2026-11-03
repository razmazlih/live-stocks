import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetsPanel } from '@/components/portfolio/targets-panel';
import type { Position } from '@/types';
import { formatSignedCurrency } from '@/lib/utils/portfolio-display';

const fixture = vi.hoisted(() => ({ positions: [] as Position[], prices: {} as Record<string, number>, annualGrowthRate: 0.1 }));
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: { annualGrowthRate: fixture.annualGrowthRate } }) }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({ loading: false, positions: fixture.positions, metrics: fixture.positions.filter((position) => fixture.prices[position.symbol] !== undefined).map((position) => ({ position, currentPrice: fixture.prices[position.symbol] })) }) }));

const position = (symbol = 'TEST'): Position => ({
  id: symbol, symbol, display: `${symbol} company`, imageUrl: '', entryPrice: 100, quantity: 1,
  entryDate: '2025-01-01T00:00:00.000Z', location: 'bank_one',
  lots: [{ type: 'BUY', price: 100, quantity: 1, executedAt: '2025-01-01T00:00:00.000Z', hasCommission: false, commissionAmount: 0 }],
});
const stockRow = (symbol: string) => screen.getAllByRole('table').flatMap((table) => within(table).getAllByRole('row')).find((row) => row.textContent?.includes(symbol))!;

beforeEach(() => {
  fixture.positions = [];
  fixture.prices = {};
  fixture.annualGrowthRate = 0.1;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z')); // Exactly 365.25 days since the open buy.
});
afterEach(() => vi.useRealTimers());

describe('personal target details', () => {
  it('includes ordinary open holdings even when required exit equals the weighted target', () => {
    fixture.positions = [position()];
    fixture.prices = { TEST: 80 };
    render(<TargetsPanel />);
    expect(screen.getByRole('heading', { name: 'Active holdings vs. personal target' })).toBeInTheDocument();
    const row = stockRow('TEST');
    const gap = within(row).getAllByRole('cell')[5];
    expect(gap).toHaveTextContent(formatSignedCurrency(-30, 'USD', 'en'));
    expect(gap).toHaveClass('text-rose-600');
    expect(within(row).getByRole('link', { name: 'View symbol details' })).toHaveAttribute('href', '/stock/TEST?returnTo=%2Fportfolio%3Fview%3Dtargets');
    expect(screen.queryByText('No holdings to compare with your target')).not.toBeInTheDocument();
  });

  it('uses the full symbol history for the gap while keeping the open-lot target distinct', () => {
    fixture.annualGrowthRate = 0;
    const closed = position();
    closed.id = 'closed-test';
    closed.quantity = 0;
    closed.lots!.push({ type: 'SELL', price: 80, quantity: 1, executedAt: '2025-06-01T00:00:00.000Z', hasCommission: false, commissionAmount: 0 });
    fixture.positions = [closed, position()];
    fixture.prices = { TEST: 80 };
    render(<TargetsPanel />);
    const cells = within(stockRow('TEST')).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('100'); // Open-lot personal target.
    expect(cells[4]).toHaveTextContent('120'); // Required exit also recovers the previous realized loss.
    expect(cells[5]).toHaveTextContent(formatSignedCurrency(-40, 'USD', 'en')); // Actual - target includes both -20 losses.
    expect(cells[5]).toHaveClass('text-rose-600');
  });

  it('shows positive above-target gaps with the same actual-minus-target convention', () => {
    fixture.positions = [position()];
    fixture.prices = { TEST: 150 };
    render(<TargetsPanel />);
    const gap = within(stockRow('TEST')).getAllByRole('cell')[5];
    expect(gap).toHaveTextContent(formatSignedCurrency(40, 'USD', 'en'));
    expect(gap).toHaveClass('text-emerald-600');
  });

  it('keeps missing prices and live target gaps unavailable and retains lot warnings', () => {
    const invalid = position('INVALID');
    invalid.lots = [];
    fixture.positions = [position(), invalid];
    render(<TargetsPanel />);
    const cells = within(stockRow('TEST')).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('—');
    expect(cells[5]).toHaveTextContent('—');
    expect(screen.getByRole('heading', { name: 'Data that needs attention' })).toBeInTheDocument();
    expect(screen.getAllByText('The lot history is missing or invalid.').length).toBeGreaterThan(0);
  });
});
