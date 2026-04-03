"use client"

import * as React from "react"
import {
  Popover as HeroPopover,
  PopoverContent as HeroPopoverContent,
  PopoverTrigger as HeroPopoverTrigger,
} from "@heroui/react"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const HeroPopoverAny = HeroPopover as unknown as React.ComponentType<any>
const HeroPopoverContentAny = HeroPopoverContent as unknown as React.ComponentType<any>
const HeroPopoverTriggerAny = HeroPopoverTrigger as unknown as React.ComponentType<any>

type SelectValueChange = (value: string) => void

type SelectPlacement = "item-aligned" | "popper"

interface SelectContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  value: string | undefined
  setValue: SelectValueChange
  items: Map<string, React.ReactNode>
  placeholder?: React.ReactNode
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelectContext(componentName: string) {
  const context = React.useContext(SelectContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Select`)
  }

  return context
}

interface SelectProps {
  children: React.ReactNode
  value?: string
  defaultValue?: string
  onValueChange?: SelectValueChange
}

function parseSelectChildren(children: React.ReactNode) {
  const parsedItems = new Map<string, React.ReactNode>()
  let parsedPlaceholder: React.ReactNode | undefined

  const mappedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) {
      return child
    }

    if (child.type === SelectContent) {
      const typedChild = child as React.ReactElement<SelectContentProps & { children?: React.ReactNode }>

      const contentChildren = React.Children.map(typedChild.props.children, (contentChild) => {
        if (!React.isValidElement(contentChild)) {
          return contentChild
        }

        if (contentChild.type === SelectItem) {
          const typedContentChild = contentChild as React.ReactElement<SelectItemProps>
          parsedItems.set(typedContentChild.props.value, typedContentChild.props.children)
        }

        return contentChild
      })

      return React.cloneElement(typedChild, {}, contentChildren)
    }

    if (child.type === SelectTrigger) {
      const typedChild = child as React.ReactElement<{
        children?: React.ReactNode
      }>

      React.Children.forEach(typedChild.props.children, (triggerChild) => {
        if (React.isValidElement(triggerChild) && triggerChild.type === SelectValue) {
          const typedTriggerChild = triggerChild as React.ReactElement<{
            placeholder?: React.ReactNode
          }>
          parsedPlaceholder = typedTriggerChild.props.placeholder
        }
      })
    }

    return child
  })

  return {
    decoratedChildren: mappedChildren,
    items: parsedItems,
    placeholder: parsedPlaceholder,
  }
}

function Select({ children, value, defaultValue, onValueChange }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [open, setOpen] = React.useState(false)
  const isControlled = value !== undefined
  const resolvedValue = isControlled ? value : internalValue

  const setValue = React.useCallback<SelectValueChange>(
    (nextValue) => {
      if (!isControlled) {
        setInternalValue(nextValue)
      }

      onValueChange?.(nextValue)
      setOpen(false)
    },
    [isControlled, onValueChange],
  )

  const { decoratedChildren, items, placeholder } = parseSelectChildren(children)

  const contextValue = React.useMemo<SelectContextValue>(
    () => ({
      open,
      setOpen,
      value: resolvedValue,
      setValue,
      items,
      placeholder,
    }),
    [items, open, placeholder, resolvedValue, setValue],
  )

  return (
    <SelectContext.Provider value={contextValue}>
      <HeroPopoverAny isOpen={open} onOpenChange={setOpen} backdrop="transparent">
        {decoratedChildren}
      </HeroPopoverAny>
    </SelectContext.Provider>
  )
}

const SelectValue = ({ placeholder }: { placeholder?: React.ReactNode }) => {
  void placeholder
  return null
}
SelectValue.displayName = "SelectValue"

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, type, ...props }, ref) => {
  const { items, value, placeholder } = useSelectContext("SelectTrigger")
  const selectedLabel = value !== undefined ? items.get(value) : undefined

  return (
    <HeroPopoverTriggerAny>
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "control-shell flex min-h-10 w-full items-center justify-between whitespace-nowrap rounded-xl border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.88)] px-3.5 py-2.5 text-sm leading-5 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.7)] ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-[color:var(--color-blue-200)]/90 hover:shadow-[0_20px_30px_-24px_rgba(15,23,42,0.76)] focus-visible:outline-none focus-visible:border-[color:var(--color-blue-400)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:border-input/60 disabled:bg-muted/50 disabled:text-muted-foreground/70 disabled:opacity-60 disabled:shadow-none touch-manipulation sm:min-h-10 sm:py-2",
          className,
        )}
        {...props}
      >
        <span className={cn("line-clamp-1", value === undefined && "text-muted-foreground/70")}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
        {children}
      </button>
    </HeroPopoverTriggerAny>
  )
})
SelectTrigger.displayName = "SelectTrigger"

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: SelectPlacement
  sideOffset?: number
  collisionPadding?: number
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, sideOffset = 6, ...props }, ref) => (
    <HeroPopoverContentAny offset={sideOffset} placement="bottom-start" className="border-none bg-transparent p-0 shadow-none">
      <div
        ref={ref}
        className={cn(
          "relative z-50 max-h-[calc(100dvh-1rem)] min-w-[8rem] max-w-[calc(100vw-1rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.96)] text-popover-foreground shadow-[0_28px_54px_-34px_rgba(15,23,42,0.52)] backdrop-blur-xl sm:max-h-[70dvh]",
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <div className="p-1.5">{children}</div>
        <SelectScrollDownButton />
      </div>
    </HeroPopoverContentAny>
  ),
)
SelectContent.displayName = "SelectContent"

const SelectScrollUpButton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center justify-center py-1.5 text-muted-foreground", className)} {...props}>
    <ChevronUp className="h-4 w-4" />
  </div>
))
SelectScrollUpButton.displayName = "SelectScrollUpButton"

const SelectScrollDownButton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center justify-center py-1.5 text-muted-foreground", className)} {...props}>
    <ChevronDown className="h-4 w-4" />
  </div>
))
SelectScrollDownButton.displayName = "SelectScrollDownButton"

const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)}
    {...props}
  />
))
SelectLabel.displayName = "SelectLabel"

interface SelectItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const SelectItem = React.forwardRef<HTMLButtonElement, SelectItemProps>(
  ({ className, children, value, onClick, ...props }, ref) => {
    const { setValue, value: selectedValue } = useSelectContext("SelectItem")
    const isSelected = selectedValue === value

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "relative flex w-full cursor-default select-none items-center rounded-lg py-2.5 pl-2.5 pr-8 text-left text-sm leading-5 outline-none transition-[background-color,color,box-shadow] duration-200 ease-out hover:bg-[color:var(--color-blue-50)]/60 focus:bg-[color:var(--color-blue-50)]/85 focus:text-[var(--color-primary-900)] focus:shadow-[inset_0_0_0_1px_rgba(191,219,254,0.7)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 rtl:pl-8 rtl:pr-2",
          className,
        )}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            setValue(value)
          }
        }}
        {...props}
      >
        <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center text-current rtl:left-2 rtl:right-auto">
          {isSelected ? <Check className="h-4 w-4" /> : null}
        </span>
        <span>{children}</span>
      </button>
    )
  },
)
SelectItem.displayName = "SelectItem"

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("-mx-1 my-1.5 h-px bg-border", className)} {...props} />
))
SelectSeparator.displayName = "SelectSeparator"

function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
