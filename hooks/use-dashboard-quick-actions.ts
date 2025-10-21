'use client';

import { RefreshCw, Home, LineChart, CircleDollarSign, Eye, Plus, Settings } from 'lucide-react';

import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';

interface UseDashboardQuickActionsOptions {
  onReload?: () => void;
  isReloading?: boolean;
  includeHome?: boolean;
  includeWatchlist?: boolean;
  extraActions?: DashboardQuickAction[];
}

export function useDashboardQuickActions({
  onReload,
  isReloading = false,
  includeHome = true,
  includeWatchlist = true,
  extraActions = [],
}: UseDashboardQuickActionsOptions = {}): DashboardQuickAction[] {
  const { locale } = useApp();
  const { t } = useTranslation(locale);

  const actions: DashboardQuickAction[] = [];

  if (onReload) {
    actions.push({
      key: 'reload',
      icon: RefreshCw,
      label: t.common.refresh,
      onClick: onReload,
      disabled: isReloading,
      variant: 'outline',
      iconClassName: isReloading ? 'animate-spin' : undefined,
      labelClassName: 'hidden sm:inline',
    });
  }

  if (includeHome) {
    actions.push({
      key: 'home',
      icon: Home,
      label: t.app.title,
      href: '/',
      variant: 'secondary',
    });
  }

  actions.push(
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
    }
  );

  if (includeWatchlist) {
    actions.push({
      key: 'watchlist',
      icon: Eye,
      label: t.watchlist.quickAction,
      href: '/watchlist',
      className: 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]',
    });
  }

  actions.push(
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
    }
  );

  if (extraActions.length) {
    actions.push(...extraActions);
  }

  return actions;
}
