import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const quickActionBaseClass =
  'group relative inline-flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:-translate-y-0.5 sm:w-auto';

const quickActionIconBaseClass =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base transition-transform duration-200 group-hover:scale-110';

const quickActionThemes = {
  refresh: {
    container:
      'border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-slate-200 text-slate-700 hover:shadow-md focus-visible:ring-slate-400 disabled:hover:translate-y-0',
    icon: 'bg-white text-slate-600',
  },
  home: {
    container:
      'border-sky-500/40 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-600 text-white hover:shadow-lg focus-visible:ring-sky-400',
    icon: 'bg-white/20 text-white',
  },
  portfolio: {
    container:
      'border-indigo-500/40 bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white hover:shadow-lg focus-visible:ring-indigo-400',
    icon: 'bg-white/20 text-white',
  },
  realized: {
    container:
      'border-emerald-500/40 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white hover:shadow-lg focus-visible:ring-emerald-400',
    icon: 'bg-white/20 text-white',
  },
  positions: {
    container:
      'border-amber-500/40 bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white hover:shadow-lg focus-visible:ring-amber-400',
    icon: 'bg-white/20 text-white',
  },
  settings: {
    container:
      'border-slate-700/50 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-white hover:shadow-lg focus-visible:ring-slate-500',
    icon: 'bg-white/20 text-white',
  },
} as const;

export type QuickActionTheme = keyof typeof quickActionThemes;

type QuickActionLinkProps = {
  icon: LucideIcon;
  label: string;
  theme: Exclude<QuickActionTheme, 'refresh'>;
  className?: string;
  'aria-label'?: string;
} & Omit<ComponentPropsWithoutRef<typeof Link>, 'href' | 'children' | 'className'> & {
  href: ComponentPropsWithoutRef<typeof Link>['href'];
};

export function QuickActionLink({
  icon: Icon,
  label,
  theme,
  className,
  href,
  'aria-label': ariaLabel,
  ...rest
}: QuickActionLinkProps) {
  const themeClasses = quickActionThemes[theme];

  return (
    <Link
      href={href}
      className={cn(quickActionBaseClass, themeClasses.container, className)}
      aria-label={ariaLabel ?? label}
      {...rest}
    >
      <span className={cn(quickActionIconBaseClass, themeClasses.icon)} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-left leading-tight">{label}</span>
    </Link>
  );
}

type QuickActionButtonProps = {
  icon: LucideIcon;
  label: string;
  theme: QuickActionTheme;
  loading?: boolean;
  className?: string;
} & ComponentPropsWithoutRef<'button'>;

export function QuickActionButton({
  icon: Icon,
  label,
  theme,
  loading = false,
  className,
  disabled,
  type = 'button',
  'aria-label': ariaLabel,
  'aria-busy': ariaBusy,
  ...rest
}: QuickActionButtonProps) {
  const themeClasses = quickActionThemes[theme];
  const isDisabled = Boolean(disabled || loading);
  const normalizedAriaBusy = loading ? true : ariaBusy;

  return (
    <button
      type={type}
      className={cn(
        quickActionBaseClass,
        themeClasses.container,
        'disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-80 disabled:shadow-none',
        className
      )}
      aria-label={ariaLabel ?? label}
      aria-busy={normalizedAriaBusy}
      disabled={isDisabled}
      {...rest}
    >
      <span className={cn(quickActionIconBaseClass, themeClasses.icon)} aria-hidden="true">
        <Icon className={cn('h-5 w-5', loading && 'animate-spin')} />
      </span>
      <span className="flex-1 text-left leading-tight">{label}</span>
    </button>
  );
}

export { quickActionThemes, quickActionBaseClass, quickActionIconBaseClass };
