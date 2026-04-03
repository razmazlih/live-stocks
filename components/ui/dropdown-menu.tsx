"use client"

import * as React from "react"
import {
  Popover as HeroPopover,
  PopoverContent as HeroPopoverContent,
  PopoverTrigger as HeroPopoverTrigger,
} from "@heroui/react"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const HeroPopoverAny = HeroPopover as unknown as React.ComponentType<any>
const HeroPopoverContentAny = HeroPopoverContent as unknown as React.ComponentType<any>
const HeroPopoverTriggerAny = HeroPopoverTrigger as unknown as React.ComponentType<any>

type DropdownSelectEvent = {
  defaultPrevented: boolean
  preventDefault: () => void
}

type DropdownOpenChange = (open: boolean) => void

type DropdownSide = "top" | "right" | "bottom" | "left"
type DropdownAlign = "start" | "center" | "end"

interface DropdownMenuContextValue {
  open: boolean
  setOpen: DropdownOpenChange
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenuContext(componentName: string) {
  const context = React.useContext(DropdownMenuContext)

  if (!context) {
    throw new Error(`${componentName} must be used within DropdownMenu`)
  }

  return context
}

function toPlacement(side: DropdownSide = "bottom", align: DropdownAlign = "center") {
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

interface DropdownMenuProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: DropdownOpenChange
}

function DropdownMenu({ children, open, defaultOpen = false, onOpenChange }: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : internalOpen

  const setOpen = React.useCallback<DropdownOpenChange>(
    (nextOpen) => {
      if (!isControlled) {
        setInternalOpen(nextOpen)
      }

      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange],
  )

  const value = React.useMemo<DropdownMenuContextValue>(
    () => ({ open: resolvedOpen, setOpen }),
    [resolvedOpen, setOpen],
  )

  return (
    <DropdownMenuContext.Provider value={value}>
      <HeroPopoverAny isOpen={resolvedOpen} onOpenChange={setOpen} backdrop="transparent">
        {children}
      </HeroPopoverAny>
    </DropdownMenuContext.Provider>
  )
}

interface DropdownMenuTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

function DropdownMenuTrigger({ asChild = false, children }: DropdownMenuTriggerProps) {
  if (asChild && React.isValidElement(children)) {
    return <HeroPopoverTriggerAny>{children}</HeroPopoverTriggerAny>
  }

  return <HeroPopoverTriggerAny><button type="button">{children}</button></HeroPopoverTriggerAny>
}

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: DropdownAlign
  side?: DropdownSide
  sideOffset?: number
  collisionPadding?: number
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = "center", side = "bottom", sideOffset = 6, children, ...props }, ref) => (
    <HeroPopoverContentAny
      placement={toPlacement(side, align)}
      offset={sideOffset}
      className="border-none bg-transparent p-0 shadow-none"
    >
      <div
        ref={ref}
        className={cn(
          "z-50 max-h-[calc(100dvh-1rem)] min-w-[8rem] max-w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </HeroPopoverContentAny>
  ),
)
DropdownMenuContent.displayName = "DropdownMenuContent"

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean
  onSelect?: (event: DropdownSelectEvent) => void
}

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, inset, disabled, onClick, onSelect, children, ...props }, ref) => {
    const { setOpen } = useDropdownMenuContext("DropdownMenuItem")

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
          inset && "pl-8",
          className,
        )}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented) {
            return
          }

          const selectEvent: DropdownSelectEvent = {
            defaultPrevented: false,
            preventDefault() {
              this.defaultPrevented = true
            },
          }

          onSelect?.(selectEvent)

          if (!selectEvent.defaultPrevented) {
            setOpen(false)
          }
        }}
        {...props}
      >
        {children}
      </button>
    )
  },
)
DropdownMenuItem.displayName = "DropdownMenuItem"

interface DropdownMenuCheckboxItemProps extends DropdownMenuItemProps {
  checked?: boolean
}

const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuCheckboxItemProps
>(({ children, checked, className, ...props }, ref) => (
  <DropdownMenuItem ref={ref} className={cn("pl-8", className)} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {checked ? <Check className="h-4 w-4" /> : null}
    </span>
    {children}
  </DropdownMenuItem>
))
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem"

const DropdownMenuRadioItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuCheckboxItemProps
>(({ children, checked, className, ...props }, ref) => (
  <DropdownMenuItem ref={ref} className={cn("pl-8", className)} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      {checked ? <Circle className="h-2 w-2 fill-current" /> : null}
    </span>
    {children}
  </DropdownMenuItem>
))
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem"

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
    {...props}
  />
))
DropdownMenuLabel.displayName = "DropdownMenuLabel"

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"

function DropdownMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

function DropdownMenuGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => (
  <div ref={ref} {...props}>
    {children}
  </div>
))
DropdownMenuSubContent.displayName = "DropdownMenuSubContent"

const DropdownMenuSubTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(({ children, className, inset, ...props }, ref) => (
  <DropdownMenuItem ref={ref} className={cn(inset && "pl-8", className)} {...props}>
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownMenuItem>
))
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger"

function DropdownMenuRadioGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
