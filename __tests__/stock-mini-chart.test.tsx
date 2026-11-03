import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockMiniChart } from '@/components/portfolio/stock-mini-chart';
import type { PositionMetrics, PositionLot } from '@/types';

const fixture = vi.hoisted(() => ({ locale: 'en' }));
const chart = vi.hoisted(() => vi.fn());
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: fixture.locale, settings: { currency: 'USD' } }) }));
vi.mock('@/components/charts/sparkline', () => ({ Sparkline: (props: unknown) => { chart(props); return <div data-testid="sparkline" />; } }));
const metric = { position: { symbol: 'AAPL', entryPrice: 100 }, projectedPrice: 120 } as PositionMetrics;
const points = [{ timestamp: Date.UTC(2025, 0, 1), close: 80 }, { timestamp: Date.UTC(2025, 0, 3), close: 125 }];
beforeEach(() => { fixture.locale = 'en'; chart.mockClear(); });

describe('holding mini chart', () => {
  it('renders actual date bounds and passes entry and personal target thresholds without interaction', () => {
    render(<StockMiniChart metric={metric} points={points.slice().reverse()} compact />);
    expect(screen.getByRole('img', { name: 'AAPL price chart, Jan 1, 2025 to Jan 3, 2025; 0 entries, 0 exits' })).toBeInTheDocument();
    expect(chart).toHaveBeenCalledWith(expect.objectContaining({ points, baseline: 100, projectedPrice: 120, width: 128, height: 44, interactive: false, belowEntryColor: '#dc2626', betweenProjectedColor: '#2563eb', aboveProjectedColor: '#059669' }));
  });

  it('never manufactures history when there are fewer than two valid unique dates', () => {
    render(<StockMiniChart metric={metric} points={[points[0], points[0], { timestamp: Number.NaN, close: 100 }, { timestamp: Date.UTC(2025, 0, 2), close: Number.NaN }]} />);
    expect(screen.getByText('No chart data')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(chart).not.toHaveBeenCalled();
  });

  it('maps real entry/exit dates and prices, filtering invalid and out-of-range transactions', () => {
    const lot = (type: 'BUY' | 'SELL', date: string, price = 110, quantity = 2): PositionLot => ({ type, executedAt: date, price, quantity, hasCommission: false, commissionAmount: 0 });
    const transactions = [
      lot('BUY', '2025-01-01T00:00:00Z', 99, 3),
      lot('SELL', '2025-01-02T12:00:00Z', 115, 1),
      lot('BUY', 'invalid'), lot('SELL', '2025-01-02T00:00:00Z', Number.NaN),
      lot('BUY', '2025-01-02T00:00:00Z', 110, -1),
      lot('SELL', '2025-01-04T00:00:00Z'), lot('BUY', '2024-12-31T00:00:00Z'),
    ];
    render(<StockMiniChart metric={{ ...metric, position: { ...metric.position, lots: transactions } }} points={points} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Dec 31, 2024 to Jan 4, 2025; 2 entries, 2 exits');
    expect(chart).toHaveBeenCalledWith(expect.objectContaining({ includeEventsInDomain: true, events: [
      expect.objectContaining({ type: 'BUY', timestamp: Date.UTC(2024, 11, 31), price: 110, quantity: 2 }),
      expect.objectContaining({ type: 'BUY', timestamp: Date.UTC(2025, 0, 1), price: 99, quantity: 3 }),
      expect.objectContaining({ type: 'SELL', timestamp: Date.UTC(2025, 0, 2, 12), price: 115, quantity: 1 }),
      expect.objectContaining({ type: 'SELL', timestamp: Date.UTC(2025, 0, 4), price: 110, quantity: 2 }),
    ], interactive: false }));
  });

  it('can show a legacy recorded entry but never invents a fallback for invalid lot history', () => {
    const legacyMetric = { ...metric, position: { ...metric.position, entryDate: '2025-01-02T00:00:00Z', quantity: 3 } };
    const { rerender } = render(<StockMiniChart metric={legacyMetric} points={points} />);
    expect(chart).toHaveBeenLastCalledWith(expect.objectContaining({ events: [expect.objectContaining({ type: 'BUY', timestamp: Date.UTC(2025, 0, 2), price: 100, quantity: 3 })] }));
    rerender(<StockMiniChart metric={{ ...legacyMetric, position: { ...legacyMetric.position, lots: [{ type: 'BUY', executedAt: 'invalid', price: 100, quantity: 3, hasCommission: false, commissionAmount: 0 }] } }} points={points} />);
    expect(chart).toHaveBeenLastCalledWith(expect.objectContaining({ events: [] }));
  });

  it('localizes missing data and uses the taller mobile chart geometry', () => {
    fixture.locale = 'he';
    const { rerender } = render(<StockMiniChart metric={metric} points={[]} />);
    expect(screen.getByText('אין נתוני גרף')).toBeInTheDocument();
    rerender(<StockMiniChart metric={metric} points={points} />);
    expect(chart).toHaveBeenCalledWith(expect.objectContaining({ width: 320, height: 60 }));
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('AAPL');
  });
});
