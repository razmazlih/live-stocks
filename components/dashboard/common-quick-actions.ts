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
    variant: 'outline',
    labelClassName: 'hidden sm:inline',
  }),
  dashboard: () => ({
    key: 'dashboard',
    icon: Home,
    label: t.app.title,
    href: '/',
    variant: 'secondary',
  }),
  portfolio: () => ({
    key: 'portfolio',
    icon: LineChart,
    label: t.portfolio.quickAction,
    href: '/portfolio',
    className: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/80', // tokenized action chip
  }),
  realized: () => ({
    key: 'realized',
    icon: CircleDollarSign,
    label: t.realized.quickAction,
    href: '/realized',
    className: 'bg-primary/80 text-primary-foreground shadow-sm hover:bg-primary', // tokenized action chip
  }),
  watchlist: () => ({
    key: 'watchlist',
    icon: Eye,
    label: t.watchlist.quickAction,
    href: '/watchlist',
    className: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/80', // tokenized action chip
  }),
  positions: () => ({
    key: 'positions',
    icon: Plus,
    label: t.positions.add,
    href: '/positions',
    variant: 'secondary',
  }),
  settings: () => ({
    key: 'settings',
    icon: Settings,
    label: t.settings.title,
    href: '/settings',
    variant: 'ghost',
    className: 'text-muted-foreground hover:text-foreground', // theme-aware neutral text
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
