import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Settings } from "lucide-react";

import { cn } from "@/lib/utils";

import { AppSidebar } from "./app-sidebar";
import type { AppRouteItem, AppRouteKey } from "./navigation";

export interface DashboardPageShellProps
  extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "ltr" | "rtl";
  contentClassName?: string;
  navigationItems?: AppRouteItem[];
  activeKey?: AppRouteKey;
  locale?: "he" | "en";
}

export const DashboardPageShell = React.forwardRef<
  HTMLDivElement,
  DashboardPageShellProps
>(
  (
    {
      direction = "ltr",
      className,
      contentClassName,
      navigationItems,
      activeKey,
      locale = "he",
      children,
      ...props
    },
    ref,
  ) => {
    const hasNavigation = Boolean(navigationItems?.length && activeKey);

    return (
      <div
        ref={ref}
        lang={locale}
        dir={direction}
        className={cn(
          "app-canvas relative min-h-[100dvh] overflow-x-clip text-[var(--text-primary)]",
          className,
        )}
        {...props}
      >
        {hasNavigation && <a href="#dashboard-content" className="skip-content">{locale === 'he' ? 'דילוג לתוכן' : 'Skip to content'}</a>}
        <div className={cn("relative flex min-h-[100dvh]", hasNavigation ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0" : undefined)}>
          {hasNavigation ? (
            <AppSidebar
              items={navigationItems ?? []}
              activeKey={activeKey as AppRouteKey}
              locale={locale}
            />
          ) : null}

          <div id="dashboard-content" tabIndex={-1} className={cn("dashboard-content-enter flex min-w-0 flex-1 flex-col", contentClassName)}>
            {hasNavigation ? <div className="flex items-center justify-between px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
              <Link href="/" className="flex items-center gap-2 min-h-[44px] text-base font-bold tracking-tight text-[var(--text-primary)]">
                <Image src="/brand/livestocks.svg" alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
                LiveStocks
              </Link>
              <Link href="/settings" aria-label={locale === 'he' ? 'הגדרות' : 'Settings'} aria-current={activeKey === 'settings' ? 'page' : undefined} className="flex h-11 w-11 items-center justify-center glass-control rounded-full text-[var(--text-secondary)] hover:text-[var(--accent-color)]"><Settings aria-hidden="true" className="h-5 w-5" /></Link>
            </div> : null}
            {children}
          </div>
        </div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
