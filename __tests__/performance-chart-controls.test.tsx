import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { PerformanceChart } from '@/components/charts/performance-chart';
import type { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'he', settings: { currency: 'USD' } }) }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ data, children }: { data: { actual: number }[]; children: ReactNode }) => <div><output data-testid="plotted-profit">{data.at(-1)?.actual}</output><svg>{children}</svg></div>,
  Area: () => null, Line: () => null, ReferenceLine: () => null, CartesianGrid: () => null,
  XAxis: () => null, YAxis: () => null, Tooltip: () => null,
}));
const point = {
  timestamp: Date.UTC(2026, 10, 2), totalPnLUsd: 100, totalPnLIls: 350,
  netPnLUsd: 80, netPnLIls: 280, expectedNetPnLUsd: 90, expectedNetPnLIls: 315,
  commissionUsd: 10, commissionIls: 35,
} as PortfolioTimelinePoint;
const summary = { totalProjectedPnLUsd: 90 } as PortfolioSummary;

beforeEach(() => { window.history.replaceState(null, '', '/'); });
describe('performance deduction controls', () => {
  it('reserves the plot while history is in flight and distinguishes an outage from an empty range', () => {
    const view = render(<PerformanceChart data={[]} summary={summary} historyStatus="pending" />);
    const plot = screen.getByRole('status', { name: 'טוען היסטוריית ביצועים' });
    expect(plot).toHaveClass('h-[280px]', 'sm:h-[360px]');
    expect(screen.queryByText(/אין מספיק נתונים/)).not.toBeInTheDocument();
    view.rerender(<PerformanceChart data={[]} summary={summary} historyStatus="unavailable" />);
    expect(screen.getByText('לא ניתן לטעון את היסטוריית הביצועים.')).toHaveClass('h-[280px]', 'sm:h-[360px]');
    view.rerender(<PerformanceChart data={[point]} summary={summary} historyStatus="ready" />);
    expect(screen.getByText(/אין מספיק נתונים/)).toHaveClass('h-[280px]', 'sm:h-[360px]');
  });
  it('defaults to net, independently excludes fees and estimated taxes, and restores net', () => {
    render(<PerformanceChart data={[point, { ...point, timestamp: point.timestamp + 86400000 }]} summary={summary} />);
    const options = screen.getByRole('button', { name: 'אפשרויות חישוב' });
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    fireEvent.click(options);
    const fees = screen.getByRole('switch', { name: 'עמלות שהוזנו' });
    const taxes = screen.getByRole('switch', { name: 'אומדן מס' });
    expect(fees).toHaveAttribute('aria-checked', 'true');
    expect(taxes).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('plotted-profit')).toHaveTextContent('80');
    fireEvent.click(fees);
    expect(screen.getByTestId('plotted-profit')).toHaveTextContent('90');
    expect(taxes).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(taxes);
    expect(screen.getByTestId('plotted-profit')).toHaveTextContent('110');
    expect(window.location.search).toContain('includeTaxes=0');
    fireEvent.click(screen.getByRole('button', { name: 'נטו' }));
    expect(screen.getByTestId('plotted-profit')).toHaveTextContent('80');
    expect(fees).toHaveAttribute('aria-checked', 'true');
    expect(taxes).toHaveAttribute('aria-checked', 'true');
  });
  it('restores deduction choices from the URL and changes both through the gross preset', () => {
    window.history.replaceState(null, '', '/?includeTaxes=0&includeFees=1');
    render(<PerformanceChart data={[point, { ...point, timestamp: point.timestamp + 86400000 }]} summary={summary} />);
    expect(screen.getByTestId('plotted-profit')).toHaveTextContent('100');
    fireEvent.click(screen.getByRole('button', { name: 'אפשרויות חישוב' }));
    fireEvent.click(screen.getByRole('button', { name: 'ברוטו' }));
    expect(screen.getByTestId('plotted-profit')).toHaveTextContent('110');
    expect(screen.getByRole('switch', { name: 'עמלות שהוזנו' })).toHaveAttribute('aria-checked', 'false');
  });
});
