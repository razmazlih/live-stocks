import { CircleDollarSign, Eye, Home, LineChart, Plus, RefreshCw, Settings } from 'lucide-react';

import type { DashboardQuickAction } from './quick-actions';
import { translations } from '@/lib/translations';

type Translation = (typeof translations)['he'];

export type CommonQuickActionKey =
  | 'reload'
  | 'dashboard'
  | 'portfolio'
  | 'realized'
  | 'watchlist'
  | 'positions'
  | 'settings';

type QuickActionFactory = () => DashboardQuickAction;

type QuickActionFactories = Record<CommonQuickActionKey, QuickActionFactory>;

const createFactories = (t: Translation): QuickActionFactories => ({
  reload: () => ({
    key: 'reload',
    icon: RefreshCw,
    label: t.common.refresh,
    variant: 'bordered',
    color: 'primary',
    className: 'border-white/20 bg-transparent text-white/70 hover:bg-white/10',
    labelClassName: 'hidden sm:inline',
  }),
  dashboard: () => ({
    key: 'dashboard',
    icon: Home,
    label: t.app.title,
    href: '/',
    variant: 'flat',
    color: 'secondary',
    className: 'bg-white/10 text-white backdrop-blur hover:bg-white/20',
  }),
  portfolio: () => ({
    key: 'portfolio',
    icon: LineChart,
    label: t.portfolio.quickAction,
    href: '/portfolio',
    variant: 'shadow',
    color: 'primary',
    className: 'shadow-primary-500/40 hover:-translate-y-0.5',
  }),
  realized: () => ({
    key: 'realized',
    icon: CircleDollarSign,
    label: t.realized.quickAction,
    href: '/realized',
    variant: 'shadow',
    color: 'success',
    className: 'shadow-emerald-500/40 hover:-translate-y-0.5',
  }),
  watchlist: () => ({
    key: 'watchlist',
    icon: Eye,
    label: t.watchlist.quickAction,
    href: '/watchlist',
    variant: 'flat',
    color: 'secondary',
    className: 'bg-secondary-500/20 text-white hover:bg-secondary-500/30',
  }),
  positions: () => ({
    key: 'positions',
    icon: Plus,
    label: t.positions.add,
    href: '/positions',
    variant: 'bordered',
    color: 'default',
    className: 'border-white/10 text-white/80 hover:bg-white/10',
  }),
  settings: () => ({
    key: 'settings',
    icon: Settings,
    label: t.settings.title,
    href: '/settings',
    variant: 'light',
    className: 'text-white/60 hover:text-white',
    labelClassName: 'hidden sm:inline',
  }),
});

export interface CommonQuickActionsOptions {
  include?: CommonQuickActionKey[];
  exclude?: CommonQuickActionKey[];
  overrides?: Partial<Record<CommonQuickActionKey, Partial<DashboardQuickAction>>>;
  extraActions?: DashboardQuickAction[];
}

export function createCommonQuickActions(
  t: Translation,
  { include, exclude, overrides, extraActions }: CommonQuickActionsOptions = {}
): DashboardQuickAction[] {
  const factories = createFactories(t);
  const keys = include ?? (Object.keys(factories) as CommonQuickActionKey[]);
  const filteredKeys = keys.filter((key) => !(exclude?.includes(key)));

  const actions = filteredKeys
    .map((key) => {
      const factory = factories[key];
      if (!factory) {
        return null;
      }

      const baseAction = factory();
      const override = overrides?.[key];
      const merged = override ? { ...baseAction, ...override } : baseAction;

      if (!merged.href && !merged.onClick) {
        return key === 'reload' ? null : merged;
      }

      return merged;
    })
    .filter((action): action is DashboardQuickAction => Boolean(action));

  if (extraActions?.length) {
    actions.push(...extraActions);
  }

  return actions;
}
