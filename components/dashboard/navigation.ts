import {
  BrainCircuit,
  CircleDollarSign,
  Eye,
  Home,
  Layers,
  LineChart,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';

import type { translations } from '@/lib/translations';

type Translation = (typeof translations)['he'];

export type AppRouteKey =
  | 'dashboard'
  | 'positions'
  | 'portfolio'
  | 'watchlist'
  | 'insights'
  | 'realized'
  | 'exceptions'
  | 'aiPrompts'
  | 'settings';

export interface AppRouteItem {
  key: AppRouteKey;
  href: string;
  label: string;
  icon: LucideIcon;
}

export function createAppRouteItems(t: Translation): AppRouteItem[] {
  return [
    { key: 'dashboard', href: '/', label: t.app.title, icon: Home },
    { key: 'positions', href: '/positions', label: t.positions.title, icon: Layers },
    { key: 'portfolio', href: '/portfolio', label: t.portfolio.quickAction, icon: LineChart },
    { key: 'watchlist', href: '/watchlist', label: t.watchlist.quickAction, icon: Eye },
    { key: 'insights', href: '/insights', label: t.dashboard.weeklyInsights, icon: BrainCircuit },
    { key: 'realized', href: '/realized', label: t.realized.quickAction, icon: CircleDollarSign },
    { key: 'exceptions', href: '/exceptions', label: t.exceptions.quickAction, icon: Target },
    { key: 'aiPrompts', href: '/ai-prompts', label: t.aiPrompts.quickAction, icon: Sparkles },
    { key: 'settings', href: '/settings', label: t.settings.title, icon: Settings },
  ];
}

export function getAppRouteItem(t: Translation, key: AppRouteKey): AppRouteItem {
  const route = createAppRouteItems(t).find((item) => item.key === key);

  if (!route) {
    throw new Error(`Unknown route key: ${key}`);
  }

  return route;
}
