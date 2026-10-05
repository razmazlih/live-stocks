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
  it('keeps four mobile destinations and marks More active for secondary pages', async () => {
    const user = userEvent.setup();
    render(<AppSidebar items={items} activeKey="settings" locale="en" />);
    const navigations = screen.getAllByRole('navigation', { name: 'Primary navigation' });
    const mobile = navigations[1];
    expect(within(mobile).getAllByRole('link')).toHaveLength(4);
    const more = within(mobile).getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-current', 'page');
    await user.click(more);
    const dialog = screen.getByRole('dialog', { name: 'More tools' });
    expect(within(dialog).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('provides localized sheet labels and a close button', async () => {
    const user = userEvent.setup();
    render(<AppSidebar items={items} activeKey="dashboard" locale="he" />);
    await user.click(screen.getByRole('button', { name: 'עוד' }));
    const dialog = screen.getByRole('dialog', { name: 'כלים נוספים' });
    expect(dialog).toHaveAttribute('dir', 'rtl');
    await user.click(within(dialog).getByRole('button', { name: 'סגירה' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
