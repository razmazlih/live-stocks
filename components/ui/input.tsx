import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "control-shell flex min-h-10 w-full rounded-xl border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.88)] px-3.5 py-2.5 text-base leading-5 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.7)] transition-[color,background-color,border-color,box-shadow] duration-200 ease-out placeholder:text-muted-foreground/70 hover:border-[color:var(--color-blue-200)]/90 focus-visible:outline-none focus-visible:border-[color:var(--color-blue-400)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)] disabled:cursor-not-allowed disabled:border-input/60 disabled:bg-muted/50 disabled:text-muted-foreground/70 disabled:opacity-60 disabled:shadow-none touch-manipulation sm:min-h-10 sm:py-2 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
