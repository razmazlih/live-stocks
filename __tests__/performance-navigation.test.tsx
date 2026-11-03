import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioPage from '@/app/portfolio/page';
import ExceptionsRedirect from '@/app/exceptions/page';
import RealizedRedirect from '@/app/realized/page';
import InsightsRedirect from '@/app/insights/page';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="deferred-panel" /> }));
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', settings: { currency: 'USD', annualGrowthRate: 0.08 } }) }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({ loading: false, refreshing: false, positions: [], metrics: [], summary: null, portfolioTimeline: [], reload: vi.fn() }) }));
vi.mock('@/hooks/use-return-context', () => ({ useReturnContext: vi.fn() }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({ DashboardRouteShell: ({children}: {children: ReactNode}) => <>{children}</> }));
vi.mock('@/components/charts/performance-chart', () => ({ PerformanceChart: () => <div /> }));
vi.mock('@/components/portfolio/research-export-button', () => ({ ResearchExportButton: () => <button>Export for research</button> }));

beforeEach(() => {
  redirect.mockReset();
  window.history.replaceState(null, '', '/portfolio');
});

describe('consolidated performance navigation', () => {
  it('opens a directly linked tab and keeps its URL when other parameters are present', async () => {
    window.history.replaceState(null, '', '/portfolio?view=realized&range=1Y');
    const user = userEvent.setup();
    render(<PortfolioPage />);
    expect(screen.getByRole('tab', { name: 'Realized returns' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Personal target' }));
    expect(new URLSearchParams(window.location.search).get('view')).toBe('targets');
    expect(new URLSearchParams(window.location.search).get('range')).toBe('1Y');
    expect(screen.getByRole('tab', { name: 'Personal target' })).toHaveAttribute('aria-selected', 'true');
  });

  it('responds to browser navigation and defaults invalid views to history', () => {
    window.history.replaceState(null, '', '/portfolio?view=unknown');
    render(<PortfolioPage />);
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    act(() => {
      window.history.replaceState(null, '', '/portfolio?view=targets');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('tab', { name: 'Personal target' })).toHaveAttribute('aria-selected', 'true');
  });

  it.each([
    [ExceptionsRedirect, '/portfolio?view=targets'],
    [RealizedRedirect, '/portfolio?view=realized'],
    [InsightsRedirect, '/portfolio?view=history'],
  ])('preserves the destination of a legacy analysis URL', (Page, destination) => {
    Page();
    expect(redirect).toHaveBeenCalledWith(destination);
  });
});
