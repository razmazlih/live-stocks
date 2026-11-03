import * as React from "react";
import Link from "next/link";
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
        dir={direction}
        className={cn(
          "relative min-h-[100dvh] overflow-x-clip bg-[var(--color-page-bg)] text-slate-900",
          className,
        )}
        {...props}
      >
        <div className={cn("relative flex min-h-[100dvh]", hasNavigation ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0" : undefined)}>
          {hasNavigation ? (
            <AppSidebar
              items={navigationItems ?? []}
              activeKey={activeKey as AppRouteKey}
              locale={locale}
            />
          ) : null}

          <div className={cn("dashboard-content-enter flex min-w-0 flex-1 flex-col", contentClassName)}>
            {hasNavigation ? <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
              <Link href="/" className="text-base font-bold tracking-tight text-slate-950">LiveStocks</Link>
              <Link href="/settings" aria-label={locale === 'he' ? 'הגדרות' : 'Settings'} aria-current={activeKey === 'settings' ? 'page' : undefined} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-blue-700"><Settings aria-hidden="true" className="h-5 w-5" /></Link>
            </div> : null}
            {children}
          </div>
        </div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
