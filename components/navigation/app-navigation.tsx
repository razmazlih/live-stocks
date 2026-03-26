'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BrainCircuit,
  CircleDollarSign,
  Eye,
  Home,
  LayoutGrid,
  Menu,
  Settings,
  Sparkles,
  Layers3,
} from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

function isRouteActive(pathname: string | null, item: NavItem) {
  if (!pathname) {
    return false;
  }

  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function navItemClasses(active: boolean, compact: boolean) {
  return cn(
    'app-nav-item group inline-flex min-w-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-primary-050)]',
    active
      ? 'app-chip app-chip-active text-[var(--color-primary-800)]'
      : 'app-chip app-chip-muted text-[var(--color-slate-600)] hover:border-[color:var(--color-blue-200)] hover:bg-[color:var(--color-paper-050)] hover:text-[var(--color-primary-800)]',
    compact && 'min-h-14 flex-col justify-center gap-1 px-2 py-2 text-center text-[11px] leading-tight'
  );
}

function navIconClasses(active: boolean) {
  return cn(
    'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
    active
      ? 'bg-[color:var(--color-primary-100)] text-[var(--color-primary-700)]'
      : 'bg-[color:var(--color-slate-100)] text-[var(--color-slate-500)] group-hover:bg-[color:var(--color-primary-100)] group-hover:text-[var(--color-primary-700)]'
  );
}

function NavLink({
  item,
  active,
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={navItemClasses(active, compact)}>
      <span className={navIconClasses(active)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className={cn('min-w-0', compact ? 'text-balance whitespace-normal break-words leading-tight' : 'whitespace-nowrap')}>
        {item.label}
      </span>
    </Link>
  );
}

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';

  const homeItem: NavItem = { href: '/', label: t.app.title, icon: Home, exact: true };
  const desktopPrimaryItems: NavItem[] = [
    { href: '/positions', label: t.positions.title, icon: Layers3 },
    { href: '/portfolio', label: t.portfolio.title, icon: BarChart3 },
    { href: '/watchlist', label: t.watchlist.title, icon: Eye },
    { href: '/realized', label: t.realized.title, icon: CircleDollarSign },
    { href: '/insights', label: t.dashboard.weeklyInsights, icon: BrainCircuit },
  ];
  const desktopOverflowItems: NavItem[] = [
    { href: '/ai-prompts', label: t.aiPrompts.title, icon: Sparkles },
    { href: '/settings', label: t.settings.title, icon: Settings },
  ];
  const mobilePrimaryItems: NavItem[] = [
    homeItem,
    { href: '/positions', label: t.positions.title, icon: Layers3 },
    { href: '/portfolio', label: t.portfolio.title, icon: BarChart3 },
    { href: '/watchlist', label: t.watchlist.title, icon: Eye },
  ];
  const mobileOverflowItems: NavItem[] = [
    { href: '/realized', label: t.realized.title, icon: CircleDollarSign },
    { href: '/insights', label: t.dashboard.weeklyInsights, icon: BrainCircuit },
    { href: '/ai-prompts', label: t.aiPrompts.title, icon: Sparkles },
    { href: '/settings', label: t.settings.title, icon: Settings },
  ];

  const primaryNavLabel = isRtl ? 'ניווט ראשי' : 'Primary navigation';
  const moreLabel = isRtl ? 'עוד' : 'More';
  const isDesktopOverflowActive = desktopOverflowItems.some((item) => isRouteActive(pathname, item));
  const isMobileOverflowActive = mobileOverflowItems.some((item) => isRouteActive(pathname, item));

  return (
    <>
      <nav aria-label={primaryNavLabel} dir={isRtl ? 'rtl' : 'ltr'} className="sticky top-0 z-50 hidden md:block">
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
          <div className="app-nav-shell overflow-hidden rounded-[2rem]">
            <div className={cn('flex items-center gap-4 px-4 py-3 lg:px-5', isRtl ? 'flex-row-reverse' : 'flex-row')}>
              <Link
                href="/"
                aria-current={isRouteActive(pathname, homeItem) ? 'page' : undefined}
                className="group flex min-w-[16rem] items-center gap-3 rounded-[1.25rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/95 px-4 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--color-blue-200)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-primary-050)]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)] ring-1 ring-[color:var(--color-blue-100)]/80">
                  <LayoutGrid className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold tracking-tight text-[var(--color-primary-900)]">{t.app.title}</span>
                  <span className="truncate text-xs text-[var(--color-slate-500)]">{t.app.subtitle}</span>
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-emerald-100)]/80 bg-[color:var(--color-emerald-50)]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-emerald-700)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-emerald-500)]" />
                  Live
                </span>
              </Link>

              <div className="flex flex-1 items-center justify-end overflow-x-auto pr-1">
                <div className="flex items-center gap-2">
                  {desktopPrimaryItems.map((item) => (
                    <NavLink key={item.href} item={item} active={isRouteActive(pathname, item)} />
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={moreLabel}
                        aria-current={isDesktopOverflowActive ? 'page' : undefined}
                        className={navItemClasses(isDesktopOverflowActive, false)}
                      >
                        <span className={navIconClasses(isDesktopOverflowActive)}>
                          <Menu className="h-4 w-4" />
                        </span>
                        <span className="whitespace-nowrap">{moreLabel}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align={isRtl ? 'start' : 'end'}
                      sideOffset={10}
                      className="w-64 rounded-[1.25rem] border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/98 p-2 shadow-lg"
                    >
                      <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                        {moreLabel}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="my-1 bg-[color:var(--color-slate-200)]/80" />
                      {desktopOverflowItems.map((item) => {
                        const Icon = item.icon;
                        const active = isRouteActive(pathname, item);

                        return (
                          <DropdownMenuItem
                            key={item.href}
                            onSelect={(event) => {
                              event.preventDefault();
                              router.push(item.href);
                            }}
                            className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-sm outline-none transition-colors focus:bg-[color:var(--color-primary-050)]',
                            active
                              ? 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-800)]'
                              : 'text-[var(--color-slate-700)]'
                            )}
                          >
                            <span
                              className={cn(
                                'inline-flex h-9 w-9 items-center justify-center rounded-full',
                                active
                                  ? 'bg-[color:var(--color-primary-100)] text-[var(--color-primary-700)]'
                                  : 'bg-[color:var(--color-slate-100)] text-[var(--color-slate-500)]'
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 whitespace-normal break-words leading-tight font-semibold">
                              {item.label}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            <div className="app-nav-accent h-px w-full opacity-80" />
          </div>
        </div>
      </nav>

      <nav
        aria-label={primaryNavLabel}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:hidden"
      >
        <div className="mx-auto max-w-3xl">
          <div className="app-nav-shell overflow-hidden rounded-[1.5rem] px-2 py-2">
            <div className="grid grid-cols-5 gap-2">
              {mobilePrimaryItems.map((item) => (
                <NavLink key={item.href} item={item} active={isRouteActive(pathname, item)} compact />
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={moreLabel}
                    aria-current={isMobileOverflowActive ? 'page' : undefined}
                    className={navItemClasses(isMobileOverflowActive, true)}
                  >
                    <span className={navIconClasses(isMobileOverflowActive)}>
                      <Menu className="h-4 w-4" />
                    </span>
                    <span className="whitespace-nowrap">{moreLabel}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isRtl ? 'start' : 'end'}
                  side="top"
                  sideOffset={10}
                  className="w-[min(20rem,calc(100vw-1.5rem))] rounded-[1.25rem] border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/98 p-2 shadow-lg"
                >
                  <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {moreLabel}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1 bg-[color:var(--color-slate-200)]/80" />
                  {mobileOverflowItems.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(pathname, item);

                    return (
                      <DropdownMenuItem
                        key={item.href}
                        onSelect={(event) => {
                          event.preventDefault();
                          router.push(item.href);
                        }}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-sm outline-none transition-colors focus:bg-[color:var(--color-primary-050)]',
                          active
                            ? 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-800)]'
                            : 'text-[var(--color-slate-700)]'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-9 w-9 items-center justify-center rounded-full',
                            active
                              ? 'bg-[color:var(--color-primary-100)] text-[var(--color-primary-700)]'
                              : 'bg-[color:var(--color-slate-100)] text-[var(--color-slate-500)]'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 whitespace-normal break-words leading-tight font-semibold">
                          {item.label}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
