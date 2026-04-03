"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"

type TabsValueChange = (value: string) => void

interface TabsContextValue {
  value: string | undefined
  setValue: TabsValueChange
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(componentName: string) {
  const context = React.useContext(TabsContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Tabs`)
  }

  return context
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  defaultValue?: string
  onValueChange?: TabsValueChange
  children: React.ReactNode
}

function Tabs({ children, className, value, defaultValue, onValueChange, ...props }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const isControlled = value !== undefined
  const resolvedValue = isControlled ? value : internalValue

  const setValue = React.useCallback<TabsValueChange>(
    (nextValue) => {
      if (!isControlled) {
        setInternalValue(nextValue)
      }

      onValueChange?.(nextValue)
    },
    [isControlled, onValueChange],
  )

  const contextValue = React.useMemo<TabsContextValue>(
    () => ({ value: resolvedValue, setValue }),
    [resolvedValue, setValue],
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[color:var(--color-slate-200)]/80 bg-[rgba(255,255,255,0.8)] p-1 text-[var(--color-slate-600)] shadow-[0_16px_28px_-24px_rgba(15,23,42,0.36)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className,
    )}
    {...props}
  />
))
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, onClick, ...props }, ref) => {
    const { value: selectedValue, setValue } = useTabsContext("TabsTrigger")
    const isActive = selectedValue === value

    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? "active" : "inactive"}
        className={cn(
          "inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          isActive && "bg-[rgba(255,255,255,0.95)] text-[var(--color-primary-900)] shadow-[0_10px_22px_-18px_rgba(15,23,42,0.5)]",
          !isActive && "text-[var(--color-slate-600)]",
          className,
        )}
        onClick={(event) => {
          onClick?.(event as React.MouseEvent<HTMLButtonElement>)
          if (!event.defaultPrevented) {
            setValue(value)
          }
        }}
        {...props}
      >
        {children}
      </Button>
    )
  },
)
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const { value: selectedValue } = useTabsContext("TabsContent")

    if (selectedValue !== value) {
      return null
    }

    return (
      <div
        ref={ref}
        role="tabpanel"
        data-state="active"
        className={cn(
          "mt-3 min-w-0 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
