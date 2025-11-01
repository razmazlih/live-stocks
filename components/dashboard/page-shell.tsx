import * as React from "react";

import { cn } from "@/lib/utils";

export interface DashboardPageShellProps
  extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "ltr" | "rtl";
  contentClassName?: string;
}

export const DashboardPageShell = React.forwardRef<
  HTMLDivElement,
  DashboardPageShellProps
>(
  (
    { direction = "ltr", className, contentClassName, children, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        dir={direction}
        className={cn(
          "relative min-h-screen overflow-hidden bg-[hsl(var(--background))]",
          className,
        )}
        {...props}
      >
        {/* משתמש בטוקני נושא במקום צבעים קשיחים לרקעים */}
        <div className="pointer-events-none absolute inset-0 surface-shell opacity-80" aria-hidden />
        <div className="pointer-events-none absolute inset-0 surface-radial opacity-70" aria-hidden />
        <div className={cn("relative", contentClassName)}>{children}</div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
