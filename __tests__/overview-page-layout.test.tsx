import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';

const reload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/context', () => ({ useApp: () => ({locale: 'en', settings: {currency: 'USD'}}) }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({loading: false, refreshing: false, summary: null, metrics: [], positions: [{symbol: 'AAPL'}], sparklineData: {}, contextSparklineData: {}, lastUpdate: new Date('2026-11-12T10:00:00Z'), reload}) }));
vi.mock('@/hooks/use-return-context', () => ({ useReturnContext: () => {} }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({DashboardRouteShell: ({children}: {children: ReactNode}) => <div>{children}</div>}));
vi.mock('@/components/portfolio/overview-holdings', () => ({OverviewHoldings: () => <section aria-label="Test holdings">Holdings</section>}));
vi.mock('@/components/portfolio/close-pair-proposals', () => ({ClosePairProposals: () => <section aria-label="Test exit ideas">Exit ideas</section>}));
vi.mock('@/components/portfolio/research-export-button', () => ({ResearchExportButton: () => <button>Export for research</button>}));
vi.mock('@/components/charts/performance-chart', () => ({PerformanceChart: () => <section aria-label="Performance chart">Performance chart</section>}));

describe('overview layout', () => {
  it('places exit ideas above active holdings immediately after the summary and keeps the performance chart off the overview', () => {
    render(<HomePage />);
    const summary = screen.getByRole('region', {name: 'Portfolio summary'});
    const ideas = screen.getByRole('region', {name: 'Test exit ideas'});
    const holdings = screen.getByRole('region', {name: 'Test holdings'});
    expect(summary.nextElementSibling).toBe(ideas);
    expect(ideas.nextElementSibling).toBe(holdings);
    expect(screen.getAllByText('Holdings value')[0].closest('.overview-stat')).toHaveClass('overview-stat-primary');
    expect(screen.queryByRole('region', {name: 'Performance chart'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Portfolio overview', level: 1})).toBeInTheDocument();
  });

  it('keeps adding, exporting and refreshing available in the compact header', async () => {
    render(<HomePage />);
    expect(screen.getByRole('link', {name: 'Add transaction'})).toHaveAttribute('href', '/positions?action=add');
    expect(screen.getByRole('button', {name: 'Export for research'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(reload).toHaveBeenCalledOnce();
  });
});
