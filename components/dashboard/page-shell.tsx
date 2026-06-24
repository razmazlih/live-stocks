import * as React from "react";

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
          "dashboard-shell-enter relative min-h-[100dvh] overflow-hidden bg-[var(--color-page-bg)] text-slate-900",
          className,
        )}
        {...props}
      >
        <div className={cn("relative flex min-h-[100dvh]", hasNavigation ? "pb-24 lg:pb-0" : undefined)}>
          {hasNavigation ? (
            <AppSidebar
              items={navigationItems ?? []}
              activeKey={activeKey as AppRouteKey}
              locale={locale}
            />
          ) : null}

          <div className={cn("flex min-w-0 flex-1 flex-col", contentClassName)}>
            {children}
          </div>
        </div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
