import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';

const data = vi.hoisted(() => ({ summary: { totalValue: 1000, totalNetPnLUsd: 80, totalCurrentPnLUsd: 100, totalProjectedPnLUsd: 150 }, positions: [{symbol: 'AAPL', lots: [] as Array<{type: string; executedAt: string}>}] }));
const reload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/context', () => ({ useApp: () => ({locale: 'en', settings: {currency: 'USD'}}) }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({loading: false, refreshing: false, ...data, metrics: [], sparklineData: {}, contextSparklineData: {}, lastUpdate: new Date('2026-11-12T10:00:00Z'), reload}) }));
vi.mock('@/hooks/use-investment-sources', () => ({ useInvestmentSources: () => ({ sourceName: (id: string) => id }) }));
vi.mock('@/hooks/use-return-context', () => ({ useReturnContext: () => {} }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({DashboardRouteShell: ({children}: {children: ReactNode}) => <div>{children}</div>}));
vi.mock('@/components/portfolio/overview-holdings', () => ({OverviewHoldings: () => <section aria-label="Test holdings">Holdings</section>}));
vi.mock('@/components/portfolio/close-pair-proposals', () => ({ClosePairProposals: () => <section aria-label="Test exit ideas">Exit ideas</section>}));
vi.mock('@/components/portfolio/research-export-button', () => ({ResearchExportButton: () => <button>Export for research</button>}));
vi.mock('@/components/charts/performance-chart', () => ({PerformanceChart: () => <section aria-label="Performance chart">Performance chart</section>}));

describe('overview layout', () => {
  it('places exit ideas immediately after the summary and before active holdings', () => {
    render(<HomePage />);
    const summary = screen.getByRole('region', {name: 'Portfolio summary'});
    const ideas = screen.getByRole('region', {name: 'Test exit ideas'});
    const holdings = screen.getByRole('region', {name: 'Test holdings'});
    expect(summary.nextElementSibling).toBe(ideas);
    expect(ideas.nextElementSibling).toBe(holdings);
    expect(screen.getByText('Latest available holdings value').parentElement).toHaveTextContent('$1,000.00');
    expect(screen.queryByRole('region', {name: 'Performance chart'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Portfolio overview', level: 1})).toBeInTheDocument();
  });

  it('opens the cumulative target using the same deduction settings', () => {
    window.history.replaceState(null, '', '/?includeTaxes=0');
    try {
      render(<HomePage />);
      const link = screen.getByRole('link', { name: /below cumulative target/i });
      expect(link).toHaveTextContent('$50.00');
      expect(screen.getByText('Cumulative profit').parentElement).toHaveTextContent('$100.00');
      const url = new URL(link.getAttribute('href')!, window.location.origin);
      expect(url.pathname).toBe('/portfolio');
      expect(url.searchParams.get('view')).toBe('targets');
      expect(url.searchParams.get('includeTaxes')).toBe('0');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('explains an incomplete trade history alongside the retained market value', () => {
    data.positions[0].lots.push({type: 'RECONCILE', executedAt: '2026-10-01'});
    try {
      render(<HomePage />);
      expect(screen.getByText('Transactions are missing')).toBeInTheDocument();
      expect(screen.getByText('$1,000.00')).toBeInTheDocument();
      expect(screen.getByRole('link', {name: 'Performance details'})).toHaveAttribute('href', '/portfolio');
    } finally {
      data.positions[0].lots = [];
    }
  });

  it('keeps adding, exporting and refreshing available in the compact header', async () => {
    render(<HomePage />);
    expect(screen.getByRole('link', {name: 'Add transaction'})).toHaveAttribute('href', '/positions?action=add');
    expect(screen.getByRole('button', {name: 'Export for research'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(reload).toHaveBeenCalledOnce();
  });
});
