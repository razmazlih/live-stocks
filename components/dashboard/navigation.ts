import {
  Eye,
  Home,
  Layers,
  LineChart,
  Settings,
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
  const he = t.settings.title === 'הגדרות';
  return [
    { key: 'dashboard', href: '/', label: he ? 'סקירה' : 'Overview', icon: Home },
    { key: 'positions', href: '/positions', label: he ? 'פעילות' : 'Activity', icon: Layers },
    { key: 'portfolio', href: '/portfolio', label: he ? 'ביצועים' : 'Performance', icon: LineChart },
    { key: 'watchlist', href: '/watchlist', label: he ? 'מעקב' : 'Watchlist', icon: Eye },
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
