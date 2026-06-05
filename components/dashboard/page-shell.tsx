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
          "relative min-h-screen overflow-hidden bg-[#f6f8fb] text-slate-950",
          className,
        )}
        {...props}
      >
        <div className={cn("relative flex min-h-screen", hasNavigation ? "pb-20 lg:pb-0" : undefined)}>
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
