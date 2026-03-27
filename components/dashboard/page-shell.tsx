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
          "page-shell min-h-dvh w-full min-w-0 overflow-x-clip overscroll-x-none",
          className,
        )}
        {...props}
      >
        <div className={cn("relative z-10 w-full min-w-0", contentClassName)}>
          {children}
        </div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
