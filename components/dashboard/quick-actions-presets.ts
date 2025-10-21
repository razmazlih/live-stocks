import { CircleDollarSign, Eye, Home, LineChart, Plus, RefreshCw, Settings } from 'lucide-react';

import type { DashboardQuickAction } from './quick-actions';
import type { useTranslation } from '@/lib/translations';

export type AppTranslation = ReturnType<typeof useTranslation>['t'];

interface CommonQuickActionsOptions {
  t: AppTranslation;
  reload?: () => void;
  loading?: boolean;
  refreshing?: boolean;
}

export function createCommonQuickActions({
  t,
  reload,
  loading = false,
  refreshing = false,
}: CommonQuickActionsOptions): DashboardQuickAction[] {
  const isReloading = loading || refreshing;

  return [
    {
      key: 'reload',
      icon: RefreshCw,
      label: t.common.refresh,
      onClick: reload,
      disabled: isReloading || !reload,
      variant: 'outline',
      iconClassName: isReloading ? 'animate-spin' : undefined,
      labelClassName: 'hidden sm:inline',
      ariaLabel: t.common.refresh,
    },
    {
      key: 'home',
      icon: Home,
      label: t.app.title,
      href: '/',
      variant: 'secondary',
    },
    {
      key: 'portfolio',
      icon: LineChart,
      label: t.portfolio.quickAction,
      href: '/portfolio',
      className: 'bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF]',
    },
    {
      key: 'realized',
      icon: CircleDollarSign,
      label: t.realized.quickAction,
      href: '/realized',
      className: 'bg-[#0EA5E9] text-white shadow-sm hover:bg-[#0284C7]',
    },
    {
      key: 'watchlist',
      icon: Eye,
      label: t.watchlist.quickAction,
      href: '/watchlist',
      className: 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]',
    },
    {
      key: 'positions',
      icon: Plus,
      label: t.positions.add,
      href: '/positions',
      variant: 'secondary',
    },
    {
      key: 'settings',
      icon: Settings,
      label: t.settings.title,
      href: '/settings',
      variant: 'ghost',
      className: 'text-slate-600 hover:text-slate-900',
      labelClassName: 'hidden sm:inline',
    },
  ];
}
