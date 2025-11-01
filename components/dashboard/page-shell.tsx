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
          "relative min-h-screen overflow-hidden bg-[var(--color-primary-050)]",
          className,
        )}
        {...props}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--color-primary-025)] via-[var(--color-primary-010)] to-[var(--color-primary-005)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_60%)]" />
        <div className={cn("relative", contentClassName)}>{children}</div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
