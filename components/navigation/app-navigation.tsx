'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BrainCircuit,
  CircleDollarSign,
  Compass,
  ChevronDown,
  Eye,
  Home,
  Languages,
  Layers3,
  Menu,
  Settings,
  Sparkles,
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

type NavTone = 'blue' | 'sky' | 'emerald' | 'amber' | 'slate';

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: NavTone;
  exact?: boolean;
};

const NAV_TONE_STYLES: Record<
  NavTone,
  {
    icon: string;
    iconActive: string;
    badge: string;
    glow: string;
    line: string;
  }
> = {
  blue: {
    icon: 'bg-[rgba(239,246,255,0.9)] text-[var(--color-blue-700)] ring-1 ring-[color:var(--color-blue-100)]/90 shadow-[0_12px_20px_-18px_rgba(37,99,235,0.8)]',
    iconActive:
      'bg-[rgba(219,234,254,0.95)] text-[var(--color-blue-700)] ring-1 ring-[color:var(--color-blue-200)]/90 shadow-[0_16px_24px_-16px_rgba(37,99,235,0.9)]',
    badge:
      'border-[color:var(--color-blue-100)]/90 bg-[rgba(239,246,255,0.94)] text-[var(--color-blue-700)]',
    glow: 'bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),transparent_72%)]',
    line: 'bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.82),rgba(14,165,233,0.62),rgba(59,130,246,0))]',
  },
  sky: {
    icon: 'bg-[rgba(240,249,255,0.9)] text-[var(--color-sky-700)] ring-1 ring-[color:var(--color-sky-100)]/90 shadow-[0_12px_20px_-18px_rgba(14,165,233,0.8)]',
    iconActive:
      'bg-[rgba(224,242,254,0.95)] text-[var(--color-sky-700)] ring-1 ring-[color:var(--color-blue-200)]/90 shadow-[0_16px_24px_-16px_rgba(14,165,233,0.9)]',
    badge:
      'border-[color:var(--color-sky-100)]/90 bg-[rgba(240,249,255,0.94)] text-[var(--color-sky-700)]',
    glow: 'bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.12),transparent_72%)]',
    line: 'bg-[linear-gradient(90deg,rgba(14,165,233,0),rgba(14,165,233,0.82),rgba(37,99,235,0.62),rgba(14,165,233,0))]',
  },
  emerald: {
    icon: 'bg-[rgba(236,253,245,0.9)] text-[var(--color-emerald-700)] ring-1 ring-[color:var(--color-emerald-100)]/90 shadow-[0_12px_20px_-18px_rgba(16,185,129,0.8)]',
    iconActive:
      'bg-[rgba(209,250,229,0.95)] text-[var(--color-emerald-700)] ring-1 ring-[color:var(--color-emerald-200)]/90 shadow-[0_16px_24px_-16px_rgba(16,185,129,0.9)]',
    badge:
      'border-[color:var(--color-emerald-100)]/90 bg-[rgba(236,253,245,0.94)] text-[var(--color-emerald-700)]',
    glow: 'bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12),transparent_72%)]',
    line: 'bg-[linear-gradient(90deg,rgba(16,185,129,0),rgba(16,185,129,0.82),rgba(52,211,153,0.62),rgba(16,185,129,0))]',
  },
  amber: {
    icon: 'bg-[rgba(255,251,235,0.92)] text-[var(--color-amber-600)] ring-1 ring-[color:var(--color-amber-200)]/90 shadow-[0_12px_20px_-18px_rgba(245,158,11,0.8)]',
    iconActive:
      'bg-[rgba(254,243,199,0.95)] text-[var(--color-amber-600)] ring-1 ring-[color:var(--color-amber-300)]/90 shadow-[0_16px_24px_-16px_rgba(245,158,11,0.9)]',
    badge:
      'border-[color:var(--color-amber-200)]/90 bg-[rgba(255,251,235,0.94)] text-[var(--color-amber-600)]',
    glow: 'bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.1),transparent_72%)]',
    line: 'bg-[linear-gradient(90deg,rgba(245,158,11,0),rgba(245,158,11,0.82),rgba(249,115,22,0.62),rgba(245,158,11,0))]',
  },
  slate: {
    icon: 'bg-[rgba(248,250,252,0.95)] text-[var(--color-slate-600)] ring-1 ring-[color:var(--color-slate-200)]/90 shadow-[0_12px_20px_-18px_rgba(15,23,42,0.5)]',
    iconActive:
      'bg-[rgba(241,245,249,0.96)] text-[var(--color-primary-800)] ring-1 ring-[color:var(--color-slate-200)]/90 shadow-[0_16px_24px_-16px_rgba(15,23,42,0.6)]',
    badge:
      'border-[color:var(--color-slate-200)]/90 bg-[rgba(248,250,252,0.94)] text-[var(--color-slate-700)]',
    glow: 'bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.1),transparent_72%)]',
    line: 'bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(100,116,139,0.82),rgba(59,130,246,0.46),rgba(148,163,184,0))]',
  },
};

const dropdownContentClassName =
  'w-[min(19rem,calc(100vw-1rem))] rounded-[1.7rem] border border-[color:var(--color-slate-200)]/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(244,248,255,0.95))] p-2 shadow-[0_28px_56px_-26px_rgba(15,23,42,0.24)] backdrop-blur-2xl';

const dropdownItemClassName =
  'group flex cursor-pointer items-start gap-3 rounded-[1.35rem] border border-transparent px-3 py-3 outline-none transition-[background-color,border-color,box-shadow,transform,color] duration-200 focus:bg-[rgba(255,255,255,0.92)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-blue-300)] data-[highlighted]:bg-[rgba(255,255,255,0.92)]';

function isRouteActive(pathname: string | null, item: NavItem) {
  if (!pathname) {
    return false;
  }

  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function desktopNavItemClasses(active: boolean) {
  return cn(
    'group relative inline-flex min-h-[4.25rem] shrink-0 items-center gap-2.5 overflow-hidden rounded-[1.3rem] border px-3.5 py-2.5 text-sm font-semibold backdrop-blur-xl transition-[background-color,border-color,color,box-shadow,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)]',
    active
      ? 'translate-y-[-1px] border-[color:var(--color-blue-100)]/95 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(239,246,255,0.92))] text-[var(--color-primary-900)] shadow-[0_24px_40px_-28px_rgba(15,23,42,0.72)]'
      : 'border-[color:var(--color-neutral-white)]/28 bg-[linear-gradient(145deg,rgba(255,255,255,0.62),rgba(248,250,252,0.42))] text-[var(--color-slate-600)] hover:-translate-y-[1px] hover:border-[color:var(--color-blue-100)]/95 hover:bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(239,246,255,0.78))] hover:text-[var(--color-primary-800)] hover:shadow-[0_22px_34px_-28px_rgba(15,23,42,0.68)]'
  );
}

function desktopIconClasses(active: boolean, tone: NavTone) {
  const styles = NAV_TONE_STYLES[tone];

  return cn(
    'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.08rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-[transform,background-color,box-shadow,color] duration-300 group-hover:scale-[1.04]',
    active ? styles.iconActive : styles.icon
  );
}

function desktopMoreTriggerClasses(active: boolean) {
  return cn(desktopNavItemClasses(active), 'pr-3');
}

function mobileNavItemClasses(active: boolean) {
  return cn(
    'group relative flex min-h-[5.35rem] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[1.45rem] border px-1.5 py-2.5 text-center text-[10px] font-semibold leading-[1.08] transition-[background-color,border-color,color,transform,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)]',
    active
      ? 'translate-y-[-1px] border-[color:var(--color-blue-100)]/95 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.92))] text-[var(--color-primary-900)] shadow-[0_22px_34px_-24px_rgba(15,23,42,0.72)]'
      : 'border-[color:var(--color-neutral-white)]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] text-[var(--color-slate-600)] hover:border-[color:var(--color-blue-100)]/90 hover:bg-[rgba(255,255,255,0.82)] hover:text-[var(--color-primary-800)] hover:shadow-[0_18px_24px_-28px_rgba(15,23,42,0.6)]'
  );
}

function mobileIconClasses(active: boolean, tone: NavTone) {
  const styles = NAV_TONE_STYLES[tone];

  return cn(
    'relative inline-flex h-[2.375rem] w-[2.375rem] shrink-0 items-center justify-center rounded-[1.05rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[transform,background-color,box-shadow,color] duration-300 group-hover:scale-[1.05]',
    active ? styles.iconActive : styles.icon
  );
}

function DesktopNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const toneStyles = NAV_TONE_STYLES[item.tone];

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={`${item.label} · ${item.description}`}
      className={desktopNavItemClasses(active)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
          toneStyles.glow,
          active ? 'opacity-100' : 'group-hover:opacity-80'
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-3 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/95 to-transparent transition-opacity duration-300',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'
        )}
      />
      <span className={desktopIconClasses(active, item.tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span
        className={cn(
          'relative min-w-0 max-w-full truncate text-[13px] leading-tight transition-colors duration-300',
          active ? 'font-bold text-[var(--color-primary-900)]' : 'font-semibold text-current'
        )}
      >
        {item.label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-2 w-2 shrink-0 rounded-full bg-[currentColor] transition-all duration-300',
          active ? 'scale-100 opacity-70 shadow-[0_0_0_5px_rgba(59,130,246,0.08)]' : 'scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-35'
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-4 bottom-0.5 h-0.5 rounded-full transition-[opacity,transform] duration-300',
          toneStyles.line,
          active ? 'scale-100 opacity-100' : 'scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-40'
        )}
      />
    </Link>
  );
}

function MobileNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const toneStyles = NAV_TONE_STYLES[item.tone];

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={`${item.label} · ${item.description}`}
      className={mobileNavItemClasses(active)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
          toneStyles.glow,
          active ? 'opacity-100' : 'group-hover:opacity-70'
        )}
      />
      <span className={mobileIconClasses(active, item.tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span
        className={cn(
          'relative min-w-0 max-w-full overflow-hidden px-0.5 text-pretty break-words tracking-[0.01em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]',
          active ? 'text-[10.5px] font-bold leading-[1.1] text-[var(--color-primary-900)]' : 'text-[10px] font-semibold leading-[1.08] text-current'
        )}
      >
        {item.label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-3 bottom-0.5 h-0.5 rounded-full transition-[opacity,transform] duration-300',
          toneStyles.line,
          active ? 'scale-100 opacity-100' : 'scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-30'
        )}
      />
    </Link>
  );
}

function OverflowNavItem({
  item,
  active,
  onNavigate,
  activeLabel,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (href: string) => void;
  activeLabel: string;
}) {
  const Icon = item.icon;
  const toneStyles = NAV_TONE_STYLES[item.tone];

  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        onNavigate(item.href);
      }}
      className={cn(
        dropdownItemClassName,
        active
          ? 'border-[color:var(--color-blue-100)]/90 bg-[rgba(255,255,255,0.92)] text-[var(--color-primary-900)] shadow-[0_16px_24px_-22px_rgba(15,23,42,0.38)]'
          : 'text-[var(--color-slate-700)] hover:border-[color:var(--color-slate-200)]/90 hover:bg-[rgba(255,255,255,0.88)]'
      )}
    >
      <span className={desktopIconClasses(active, item.tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start text-start">
        <span className="min-w-0 whitespace-normal break-words text-sm font-semibold leading-snug">
          {item.label}
        </span>
        <span className="mt-1 whitespace-normal break-words text-xs leading-snug text-[var(--color-slate-500)]">
          {item.description}
        </span>
      </span>
      {active ? (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
            toneStyles.badge
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[currentColor] opacity-70" />
          {activeLabel}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

type OverflowMenuProps = {
  items: NavItem[];
  active: boolean;
  label: string;
  isRtl: boolean;
  pathname: string | null;
  onNavigate: (href: string) => void;
  activeItemLabel: string;
  switchLanguageLabel: string;
  currentLanguageLabel: string;
  nextLanguageShortLabel: string;
  onToggleLocale: () => void;
};

function OverflowMenu({
  items,
  active,
  label,
  isRtl,
  pathname,
  onNavigate,
  activeItemLabel,
  switchLanguageLabel,
  currentLanguageLabel,
  nextLanguageShortLabel,
  onToggleLocale,
}: OverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-current={active ? 'page' : undefined}
          className={desktopMoreTriggerClasses(active)}
        >
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
              NAV_TONE_STYLES.slate.glow,
              active ? 'opacity-100' : 'group-hover:opacity-75'
            )}
          />
          <span className={desktopIconClasses(active, 'slate')}>
            <Menu className="h-4 w-4" />
          </span>
          <span className="relative whitespace-nowrap text-[13px] font-semibold">{label}</span>
          <ChevronDown className="relative h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isRtl ? 'start' : 'end'}
        sideOffset={10}
        className={dropdownContentClassName}
      >
        <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-[color:var(--color-slate-200)]/90" />
        {items.map((item) => {
          const isItemActive = isRouteActive(pathname, item);

          return (
            <OverflowNavItem
              key={item.href}
              item={item}
              active={isItemActive}
              onNavigate={onNavigate}
              activeLabel={activeItemLabel}
            />
          );
        })}
        <DropdownMenuSeparator className="my-1 bg-[color:var(--color-slate-200)]/90" />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onToggleLocale();
          }}
          className={cn(
            dropdownItemClassName,
            'hover:border-[color:var(--color-slate-200)]/90 hover:bg-[rgba(255,255,255,0.88)]'
          )}
        >
          <span className={desktopIconClasses(false, 'slate')}>
            <Languages className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start text-start">
            <span className="text-sm font-semibold leading-snug text-[var(--color-primary-900)]">
              {switchLanguageLabel}
            </span>
            <span className="mt-1 text-xs leading-snug text-[var(--color-slate-500)]">
              {currentLanguageLabel}
            </span>
          </span>
          <span className="inline-flex shrink-0 rounded-full border border-[color:var(--color-slate-200)]/90 bg-[rgba(248,250,252,0.94)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-700)]">
            {nextLanguageShortLabel}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';

  const toggleLocale = () => {
    setLocale(locale === 'he' ? 'en' : 'he');
  };

  const currentLanguageLabel = locale === 'he' ? 'עברית פעילה' : 'English active';
  const nextLanguageLabel = locale === 'he' ? 'English' : 'עברית';
  const nextLanguageShortLabel = locale === 'he' ? 'EN' : 'עב';
  const switchLanguageLabel = locale === 'he' ? 'מעבר לאנגלית' : 'Switch to Hebrew';
  const activeItemLabel = isRtl ? 'כאן' : 'Now';
  const liveLabel = isRtl ? 'חי' : 'Live';
  const moreLabel = isRtl ? 'עוד' : 'More';
  const primaryNavLabel = isRtl ? 'ניווט ראשי' : 'Primary navigation';

  const homeItem: NavItem = {
    href: '/',
    label: t.app.title,
    description: isRtl ? 'מרכז הבקרה הראשי של כל התיק' : 'Main command center for the full portfolio.',
    icon: Home,
    tone: 'blue',
    exact: true,
  };
  const desktopPrimaryItems: NavItem[] = [
    {
      href: '/positions',
      label: t.positions.title,
      description: isRtl ? 'ניהול פוזיציות פתוחות והחלטות מהירות' : 'Manage open positions and make quick decisions.',
      icon: Layers3,
      tone: 'blue',
    },
    {
      href: '/portfolio',
      label: t.portfolio.title,
      description: isRtl ? 'ביצועים, הקצאה ומגמות מצטברות' : 'Performance, allocation, and portfolio trends.',
      icon: BarChart3,
      tone: 'sky',
    },
    {
      href: '/watchlist',
      label: t.watchlist.title,
      description: isRtl ? 'רשימת מעקב להזדמנויות ומעקב שוטף' : 'Track ideas and monitor potential opportunities.',
      icon: Eye,
      tone: 'emerald',
    },
    {
      href: '/realized',
      label: t.realized.title,
      description: isRtl ? 'רווחים סגורים, ביצועי מכירה ומעקב מס' : 'Closed gains, exits, and tax-sensitive results.',
      icon: CircleDollarSign,
      tone: 'amber',
    },
    {
      href: '/insights',
      label: t.dashboard.weeklyInsights,
      description: isRtl ? 'תובנות שבועיות שמזקקות את מה שחשוב' : 'Weekly insights distilled into the key takeaways.',
      icon: BrainCircuit,
      tone: 'sky',
    },
  ];
  const desktopOverflowItems: NavItem[] = [
    {
      href: '/ai-prompts',
      label: t.aiPrompts.title,
      description: isRtl ? 'ספריית פרומפטים חכמה לעבודה מהירה' : 'Prompt library for faster AI-assisted workflows.',
      icon: Sparkles,
      tone: 'amber',
    },
    {
      href: '/settings',
      label: t.settings.title,
      description: isRtl ? 'העדפות, מטבע, רענון והגדרות כלליות' : 'Preferences, currency, refresh, and global settings.',
      icon: Settings,
      tone: 'slate',
    },
  ];
  const mobilePrimaryItems: NavItem[] = [
    homeItem,
    desktopPrimaryItems[0],
    desktopPrimaryItems[1],
    desktopPrimaryItems[2],
  ];
  const mobileOverflowItems: NavItem[] = [
    desktopPrimaryItems[3],
    desktopPrimaryItems[4],
    desktopOverflowItems[0],
    desktopOverflowItems[1],
  ];
  const stockDetailItem: NavItem = {
    href: pathname ?? '/stock',
    label: t.stock.details,
    description: isRtl ? 'תמונה ממוקדת של מניה בודדת עם ביצועים והקשר' : 'Focused stock view with price, performance, and context.',
    icon: BarChart3,
    tone: 'sky',
    exact: true,
  };

  const isDesktopOverflowActive = desktopOverflowItems.some((item) => isRouteActive(pathname, item));
  const isMobileOverflowActive = mobileOverflowItems.some((item) => isRouteActive(pathname, item));
  const isHomeActive = isRouteActive(pathname, homeItem);
  const activeNavItem =
    [homeItem, ...desktopPrimaryItems, ...desktopOverflowItems].find((item) => isRouteActive(pathname, item)) ??
    (pathname?.startsWith('/stock/') ? stockDetailItem : homeItem);

  return (
    <>
      <nav aria-label={primaryNavLabel} dir={isRtl ? 'rtl' : 'ltr'} className="fixed inset-x-0 top-0 z-50 hidden md:block">
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(249,250,251,0.9))] shadow-[0_30px_58px_-38px_rgba(15,23,42,0.62)] ring-1 ring-white/65 backdrop-blur-[24px]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_7%_18%,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(245,158,11,0.08),transparent_30%),linear-gradient(122deg,rgba(255,255,255,0.96),rgba(247,250,252,0.9))]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.95),rgba(255,255,255,0))]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,rgba(167,243,208,0),rgba(167,243,208,0.72),rgba(253,230,138,0.62),rgba(167,243,208,0))]"
            />
            <div
              className={cn(
                'relative flex min-w-0 flex-row items-center gap-3 px-3 py-3 lg:px-4'
              )}
            >
              <Link
                href="/"
                aria-current={isHomeActive ? 'page' : undefined}
                className={cn(
                  'group flex min-h-[4.25rem] min-w-0 shrink-0 basis-[15rem] items-center gap-3 rounded-[1.6rem] border px-4 py-2.5 text-left shadow-[0_22px_30px_-26px_rgba(15,23,42,0.7)] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)] lg:basis-[17rem]',
                  isHomeActive
                    ? 'translate-y-[-1px] border-[color:var(--color-emerald-200)]/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(236,253,245,0.9))] shadow-[0_26px_38px_-26px_rgba(15,23,42,0.6)]'
                    : 'border-[color:var(--color-slate-200)]/88 bg-[rgba(255,255,255,0.84)] hover:-translate-y-[1px] hover:bg-[rgba(255,255,255,0.95)] hover:shadow-[0_26px_34px_-24px_rgba(15,23,42,0.72)]'
                )}
              >
                <span className={desktopIconClasses(isHomeActive, homeItem.tone)}>
                  <Compass className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-bold tracking-tight text-[var(--color-primary-900)]">
                      {t.app.title}
                    </span>
                    <span className="hidden items-center gap-1.5 rounded-full border border-[color:var(--color-amber-200)]/90 bg-[rgba(255,251,235,0.9)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-amber-600)] lg:inline-flex">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-emerald-500)] animate-pulse" />
                      {liveLabel}
                    </span>
                  </span>
                  <span className="mt-1 truncate text-[11px] text-[var(--color-slate-500)]">
                    {activeNavItem.label}
                  </span>
                </span>
              </Link>

                <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-[1.4rem] border border-[color:var(--color-slate-200)]/82 bg-[linear-gradient(145deg,rgba(255,255,255,0.7),rgba(249,250,251,0.56))] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {desktopPrimaryItems.map((item) => (
                    <DesktopNavLink key={item.href} item={item} active={isRouteActive(pathname, item)} />
                  ))}
                  <OverflowMenu
                    items={desktopOverflowItems}
                    active={isDesktopOverflowActive}
                    label={moreLabel}
                    isRtl={isRtl}
                    pathname={pathname}
                    onNavigate={router.push}
                    activeItemLabel={activeItemLabel}
                    switchLanguageLabel={switchLanguageLabel}
                    currentLanguageLabel={currentLanguageLabel}
                    nextLanguageShortLabel={nextLanguageShortLabel}
                    onToggleLocale={toggleLocale}
                  />
                </div>
                <button
                  type="button"
                  onClick={toggleLocale}
                  aria-label={switchLanguageLabel}
                  title={switchLanguageLabel}
                  className="hidden shrink-0 items-center gap-3 rounded-[1.3rem] border border-[color:var(--color-slate-200)]/88 bg-[linear-gradient(145deg,rgba(255,255,255,0.88),rgba(249,250,251,0.68))] px-3.5 py-3 text-start shadow-[0_20px_28px_-22px_rgba(15,23,42,0.56)] transition-all duration-300 hover:-translate-y-[1px] hover:bg-[rgba(255,255,255,0.96)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-emerald-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)] xl:inline-flex"
                >
                  <span className={desktopIconClasses(false, 'slate')}>
                    <Languages className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-400)]">
                      {isRtl ? 'שפה' : 'Language'}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-primary-900)]">
                      {nextLanguageLabel}
                    </span>
                  </span>
                </button>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="h-px w-full bg-[linear-gradient(90deg,rgba(167,243,208,0),rgba(167,243,208,0.74),rgba(253,230,138,0.66),rgba(167,243,208,0))]"
            />
          </div>
        </div>
      </nav>

      <nav
        aria-label={primaryNavLabel}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-2 md:hidden"
      >
        <div className="mx-auto max-w-md">
          <div className="relative overflow-hidden rounded-[1.65rem] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(249,250,251,0.93))] px-2 py-2 shadow-[0_26px_56px_-32px_rgba(15,23,42,0.6)] ring-1 ring-white/65 backdrop-blur-[24px]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(16,185,129,0.12),transparent_36%),radial-gradient(circle_at_82%_100%,rgba(245,158,11,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(249,250,251,0.96))]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-0 h-14 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_72%)] blur-2xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.94),rgba(255,255,255,0))]"
            />
            <div className="relative grid grid-cols-5 gap-1.5">
              {mobilePrimaryItems.map((item) => (
                <MobileNavLink key={item.href} item={item} active={isRouteActive(pathname, item)} />
              ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={moreLabel}
                    title={moreLabel}
                    aria-current={isMobileOverflowActive ? 'page' : undefined}
                    className={mobileNavItemClasses(isMobileOverflowActive)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300',
                        NAV_TONE_STYLES.slate.glow,
                        isMobileOverflowActive ? 'opacity-100' : 'group-hover:opacity-65'
                      )}
                    />
                    <span className={mobileIconClasses(isMobileOverflowActive, 'slate')}>
                      <Menu className="h-4 w-4" />
                    </span>
                    <span className="relative min-w-0 max-w-full overflow-hidden text-pretty break-words leading-[1.05] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {moreLabel}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isRtl ? 'start' : 'end'}
                  side="top"
                  sideOffset={10}
                  className={cn(dropdownContentClassName, 'w-[min(21.5rem,calc(100vw-1.25rem))]')}
                >
                  <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {moreLabel}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1 bg-[color:var(--color-slate-200)]/90" />
                  {mobileOverflowItems.map((item) => {
                    const active = isRouteActive(pathname, item);

                    return (
                      <OverflowNavItem
                        key={item.href}
                        item={item}
                        active={active}
                        onNavigate={router.push}
                        activeLabel={activeItemLabel}
                      />
                    );
                  })}
                  <DropdownMenuSeparator className="my-1 bg-[color:var(--color-slate-200)]/90" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      toggleLocale();
                    }}
                    className={cn(
                      dropdownItemClassName,
                      'hover:border-[color:var(--color-slate-200)]/90 hover:bg-[rgba(255,255,255,0.88)]'
                    )}
                  >
                    <span className={desktopIconClasses(false, 'slate')}>
                      <Languages className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col items-start text-start">
                      <span className="text-sm font-semibold leading-snug text-[var(--color-primary-900)]">
                        {switchLanguageLabel}
                      </span>
                      <span className="mt-1 text-xs leading-snug text-[var(--color-slate-500)]">
                        {currentLanguageLabel}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 rounded-full border border-[color:var(--color-slate-200)]/90 bg-[rgba(248,250,252,0.94)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-700)]">
                      {nextLanguageShortLabel}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
