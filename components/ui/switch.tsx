"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer group inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
    ref={ref}
  >
    <span
      aria-hidden="true"
      className="pointer-events-none inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-input shadow-sm transition-colors group-data-[state=checked]:bg-primary"
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none block h-5 w-5 shrink-0 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=unchecked]:translate-x-0 ltr:data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5 motion-reduce:transition-none"
      />
    </span>
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
