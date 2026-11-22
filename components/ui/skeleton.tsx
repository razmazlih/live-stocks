import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("motion-safe:animate-pulse rounded-md bg-slate-400/20 dark:bg-slate-400/25", className)}
      {...props}
    />
  )
}

export { Skeleton }
