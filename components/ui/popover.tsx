"use client"

import * as React from "react"
import {
  Popover as HeroPopover,
  PopoverContent as HeroPopoverContent,
  PopoverTrigger as HeroPopoverTrigger,
} from "@heroui/react"

import { cn } from "@/lib/utils"

const HeroPopoverAny = HeroPopover as unknown as React.ComponentType<any>
const HeroPopoverContentAny = HeroPopoverContent as unknown as React.ComponentType<any>
const HeroPopoverTriggerAny = HeroPopoverTrigger as unknown as React.ComponentType<any>

type PopoverOpenChange = (open: boolean) => void

type PopoverSide = "top" | "right" | "bottom" | "left"
type PopoverAlign = "start" | "center" | "end"

function toPlacement(side: PopoverSide = "bottom", align: PopoverAlign = "center") {
  if (side === "top") {
    if (align === "start") return "top-start"
    if (align === "end") return "top-end"
    return "top"
  }

  if (side === "right") {
    if (align === "start") return "right-start"
    if (align === "end") return "right-end"
    return "right"
  }

  if (side === "left") {
    if (align === "start") return "left-start"
    if (align === "end") return "left-end"
    return "left"
  }

  if (align === "start") return "bottom-start"
  if (align === "end") return "bottom-end"
  return "bottom"
}

interface PopoverProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: PopoverOpenChange
}

function Popover({ children, open, defaultOpen = false, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : internalOpen

  const setOpen = React.useCallback<PopoverOpenChange>(
    (nextOpen) => {
      if (!isControlled) {
        setInternalOpen(nextOpen)
      }

      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange],
  )

  return (
    <HeroPopoverAny isOpen={resolvedOpen} onOpenChange={setOpen} backdrop="transparent">
      {children}
    </HeroPopoverAny>
  )
}

interface PopoverTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

function PopoverTrigger({ asChild = false, children }: PopoverTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return <HeroPopoverTriggerAny>{children}</HeroPopoverTriggerAny>
  }

  return <HeroPopoverTriggerAny><button type="button">{children}</button></HeroPopoverTriggerAny>
}

function PopoverAnchor({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: PopoverAlign
  side?: PopoverSide
  sideOffset?: number
  collisionPadding?: number
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", side = "bottom", sideOffset = 6, children, ...props }, ref) => (
    <HeroPopoverContentAny
      placement={toPlacement(side, align)}
      offset={sideOffset}
      className="border-none bg-transparent p-0 shadow-none"
    >
      <div
        ref={ref}
        className={cn(
          "z-50 w-[min(22rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border bg-popover p-3 text-popover-foreground shadow-md outline-none sm:max-h-[var(--popover-content-available-height)] sm:p-4",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </HeroPopoverContentAny>
  ),
)
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
