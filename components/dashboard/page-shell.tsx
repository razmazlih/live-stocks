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
          "relative min-h-screen overflow-hidden bg-[#f6f8fb] text-slate-950",
          className,
        )}
        {...props}
      >
        <div className={cn("relative", contentClassName)}>{children}</div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
