import { Plus, RefreshCw } from 'lucide-react';

import type { DashboardQuickAction } from './quick-actions';
import { translations } from '@/lib/translations';
import { createAppRouteItems, type AppRouteKey } from './navigation';

type Translation = (typeof translations)['he'];

export type CommonQuickActionKey =
  | 'reload'
  | AppRouteKey;

type QuickActionFactory = () => DashboardQuickAction;

type QuickActionFactories = Record<CommonQuickActionKey, QuickActionFactory>;

const createFactories = (t: Translation): QuickActionFactories => {
  const routeActions = createAppRouteItems(t).reduce(
    (acc, route) => {
      acc[route.key] = () => ({
        key: route.key,
        icon: route.key === 'positions' ? Plus : route.icon,
        label: route.key === 'positions' ? t.positions.add : route.label,
        href: route.href,
        variant: route.key === 'settings' ? 'ghost' : 'secondary',
        labelClassName: route.key === 'settings' ? 'hidden sm:inline' : undefined,
      });
      return acc;
    },
    {} as Omit<QuickActionFactories, 'reload'>,
  );

  return {
    reload: () => ({
    key: 'reload',
    icon: RefreshCw,
    label: t.common.refresh,
    variant: 'outline',
    labelClassName: 'hidden sm:inline',
  }),
    ...routeActions,
  };
};

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
