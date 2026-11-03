import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home, Layers, LineChart, Eye, Settings, RefreshCw } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { PageHeader } from '@/components/dashboard/page-header';
import type { AppRouteItem } from '@/components/dashboard/navigation';

const items: AppRouteItem[] = [
  { key: 'dashboard', href: '/', label: 'Dashboard', icon: Home },
  { key: 'positions', href: '/positions', label: 'Positions', icon: Layers },
  { key: 'portfolio', href: '/portfolio', label: 'Portfolio', icon: LineChart },
  { key: 'watchlist', href: '/watchlist', label: 'Watchlist', icon: Eye },
  { key: 'settings', href: '/settings', label: 'Settings', icon: Settings },
];

describe('dashboard navigation', () => {
  it('keeps exactly four direct mobile destinations without More', () => {
    render(<AppSidebar items={items} activeKey="portfolio" locale="en" />);
    const mobile = screen.getAllByRole('navigation', { name: 'Primary navigation' })[1];
    expect(within(mobile).getAllByRole('link')).toHaveLength(4);
    expect(within(mobile).getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(within(mobile).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('keeps settings as a separate desktop utility', () => {
    render(<AppSidebar items={items} activeKey="settings" locale="he" />);
    const navigations = screen.getAllByRole('navigation', { name: 'ניווט ראשי' });
    navigations.forEach((nav) => expect(within(nav).getAllByRole('link')).toHaveLength(4));
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('compact page header', () => {
  it('shows a single refresh action beside metadata without a separate action section', async () => {
    const refresh = vi.fn();
    const user = userEvent.setup();
    render(<PageHeader title="Portfolio" icon={LineChart} metaBadges={[{ key: 'updated', label: 'Updated 10:30' }]} quickActionsTitle="Quick actions" quickActions={[{ key: 'reload', label: 'Refresh', icon: RefreshCw, onClick: refresh }]} />);
    expect(screen.queryByText('Quick actions')).not.toBeInTheDocument();
    expect(screen.getByText('Updated 10:30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders back navigation as one link without a nested button', () => {
    render(<PageHeader title="Stock" icon={LineChart} backHref="/portfolio" backLabel="Back to portfolio" />);
    const back = screen.getByRole('link', { name: 'Back to portfolio' });
    expect(back).toHaveAttribute('href', '/portfolio');
    expect(within(back).queryByRole('button')).not.toBeInTheDocument();
  });
});
