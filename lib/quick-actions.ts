import type { ComponentProps } from 'react';

import type { Button } from '@/components/ui/button';

export type QuickActionKey = 'reload' | 'home' | 'portfolio' | 'realized' | 'positions' | 'settings';

type ButtonVariant = ComponentProps<typeof Button>['variant'];

export interface QuickActionTheme {
  variant?: ButtonVariant;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  ariaLabel?: string;
}

const focusRingBase = 'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export const QUICK_ACTION_THEMES: Record<QuickActionKey, QuickActionTheme> = {
  reload: {
    variant: 'outline',
    className: `${focusRingBase} border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-300`,
    iconClassName: 'text-blue-600',
    labelClassName: 'hidden sm:inline',
  },
  home: {
    className: `${focusRingBase} bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus-visible:ring-slate-900`,
  },
  portfolio: {
    className: `${focusRingBase} bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus-visible:ring-indigo-500`,
  },
  realized: {
    className: `${focusRingBase} bg-sky-500 text-white shadow-sm hover:bg-sky-600 focus-visible:ring-sky-500`,
  },
  positions: {
    className: `${focusRingBase} bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 focus-visible:ring-emerald-500`,
  },
  settings: {
    variant: 'ghost',
    className: `${focusRingBase} text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 focus-visible:ring-slate-400`,
    labelClassName: 'hidden sm:inline',
  },
};
