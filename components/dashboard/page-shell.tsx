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
          "page-shell relative min-h-dvh w-full min-w-0 overflow-x-clip overscroll-x-none",
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-[1] bg-[radial-gradient(circle_at_6%_8%,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_90%_6%,rgba(245,158,11,0.1),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,0.08),transparent_44%)]"
        />
        <div className={cn("page-shell-content relative z-10 w-full min-w-0", contentClassName)}>
          {children}
        </div>
      </div>
    );
  },
);

DashboardPageShell.displayName = "DashboardPageShell";
