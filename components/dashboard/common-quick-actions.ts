import { CircleDollarSign, Eye, Home, LineChart, Plus, RefreshCw, Settings, Sparkles } from 'lucide-react';

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
  | 'aiPrompts'
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
    className: 'bg-[var(--color-primary-600)] text-[var(--color-neutral-white)] shadow-sm hover:bg-[var(--color-primary-650)]',
  }),
  realized: () => ({
    key: 'realized',
    icon: CircleDollarSign,
    label: t.realized.quickAction,
    href: '/realized',
    className: 'bg-[var(--color-primary-300)] text-[var(--color-neutral-white)] shadow-sm hover:bg-[var(--color-sky-600)]',
  }),
  watchlist: () => ({
    key: 'watchlist',
    icon: Eye,
    label: t.watchlist.quickAction,
    href: '/watchlist',
    className: 'bg-[var(--color-primary-500)] text-[var(--color-neutral-white)] shadow-sm hover:bg-[var(--color-primary-700)]',
  }),
  positions: () => ({
    key: 'positions',
    icon: Plus,
    label: t.positions.add,
    href: '/positions',
    variant: 'secondary',
  }),
  aiPrompts: () => ({
    key: 'aiPrompts',
    icon: Sparkles,
    label: t.aiPrompts.quickAction,
    href: '/ai-prompts',
    className: 'bg-[var(--color-primary-700)] text-[var(--color-neutral-white)] shadow-sm hover:bg-[var(--color-primary-800)]',
  }),
  settings: () => ({
    key: 'settings',
    icon: Settings,
    label: t.settings.title,
    href: '/settings',
    variant: 'ghost',
    className: 'text-[var(--color-slate-600)] hover:text-[var(--color-primary-900)]',
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
