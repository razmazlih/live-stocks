import { CircleDollarSign, Eye, Home, LineChart, Plus, RefreshCw, Settings } from 'lucide-react';

import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import type { useTranslation } from '@/lib/translations';

type AppTranslations = ReturnType<typeof useTranslation>['t'];

const navigationOrder = ['portfolio', 'realized', 'watchlist', 'positions', 'settings'] as const;

export type NavigationQuickActionKey = (typeof navigationOrder)[number];

const navigationActionBuilders: Record<NavigationQuickActionKey, (t: AppTranslations) => DashboardQuickAction> = {
  portfolio: (t) => ({
    key: 'portfolio',
    icon: LineChart,
    label: t.portfolio.quickAction,
    href: '/portfolio',
    className: 'bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF]',
  }),
  realized: (t) => ({
    key: 'realized',
    icon: CircleDollarSign,
    label: t.realized.quickAction,
    href: '/realized',
    className: 'bg-[#0EA5E9] text-white shadow-sm hover:bg-[#0284C7]',
  }),
  watchlist: (t) => ({
    key: 'watchlist',
    icon: Eye,
    label: t.watchlist.quickAction,
    href: '/watchlist',
    className: 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]',
  }),
  positions: (t) => ({
    key: 'positions',
    icon: Plus,
    label: t.positions.add,
    href: '/positions',
    variant: 'secondary',
  }),
  settings: (t) => ({
    key: 'settings',
    icon: Settings,
    label: t.settings.title,
    href: '/settings',
    variant: 'ghost',
    className: 'text-slate-600 hover:text-slate-900',
    labelClassName: 'hidden sm:inline',
  }),
};

interface NavigationOptions {
  includeHome?: boolean;
  exclude?: NavigationQuickActionKey[];
}

export function getNavigationQuickActions(
  t: AppTranslations,
  { includeHome = false, exclude = [] }: NavigationOptions = {}
): DashboardQuickAction[] {
  const excluded = new Set(exclude);
  const actions: DashboardQuickAction[] = [];

  if (includeHome) {
    actions.push({
      key: 'home',
      icon: Home,
      label: t.app.title,
      href: '/',
      variant: 'secondary',
    });
  }

  for (const key of navigationOrder) {
    if (excluded.has(key)) {
      continue;
    }
    actions.push(navigationActionBuilders[key](t));
  }

  return actions;
}

interface ReloadActionOptions {
  t: AppTranslations;
  reload: () => void;
  loading?: boolean;
  refreshing?: boolean;
}

export function createReloadQuickAction({ t, reload, loading, refreshing }: ReloadActionOptions): DashboardQuickAction {
  const isBusy = Boolean(loading || refreshing);

  return {
    key: 'reload',
    icon: RefreshCw,
    label: t.common.refresh,
    onClick: reload,
    disabled: isBusy,
    variant: 'outline',
    iconClassName: isBusy ? 'animate-spin' : undefined,
    labelClassName: 'hidden sm:inline',
  };
}

