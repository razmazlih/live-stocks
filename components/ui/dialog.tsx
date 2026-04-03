"use client"

import * as React from "react"
import { Modal, ModalContent } from "@heroui/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

type DialogOpenChange = (open: boolean) => void

interface DialogContextValue {
  open: boolean
  setOpen: DialogOpenChange
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext(componentName: string) {
  const context = React.useContext(DialogContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Dialog`)
  }

  return context
}

interface DialogProps {
  children: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: DialogOpenChange
}

function Dialog({ children, open, defaultOpen = false, onOpenChange }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : internalOpen

  const setOpen = React.useCallback<DialogOpenChange>(
    (nextOpen) => {
      if (!isControlled) {
        setInternalOpen(nextOpen)
      }

      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange],
  )

  const value = React.useMemo<DialogContextValue>(
    () => ({ open: resolvedOpen, setOpen }),
    [resolvedOpen, setOpen],
  )

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
}

interface DialogTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

function DialogTrigger({ asChild = false, children }: DialogTriggerProps) {
  const { setOpen } = useDialogContext("DialogTrigger")

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: (event: React.MouseEvent<HTMLElement>) => void
    }>

    return React.cloneElement(child, {
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        const originalOnClick = child.props.onClick
        originalOnClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(true)
        }
      },
    })
  }

  return (
    <button type="button" onClick={() => setOpen(true)}>
      {children}
    </button>
  )
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay() {
  return null
}

interface DialogCloseProps {
  asChild?: boolean
  children: React.ReactNode
}

function DialogClose({ asChild = false, children }: DialogCloseProps) {
  const { setOpen } = useDialogContext("DialogClose")

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: (event: React.MouseEvent<HTMLElement>) => void
    }>

    return React.cloneElement(child, {
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        const originalOnClick = child.props.onClick
        originalOnClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(false)
        }
      },
    })
  }

  return (
    <button type="button" onClick={() => setOpen(false)}>
      {children}
    </button>
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen } = useDialogContext("DialogContent")

  return (
    <Modal
      isOpen={open}
      onOpenChange={setOpen}
      hideCloseButton
      backdrop="blur"
      classNames={{
        backdrop: "bg-[rgba(15,23,42,0.42)] backdrop-blur-[5px]",
        wrapper: "z-50 p-2 sm:p-4",
        base: "mx-0 my-0 max-w-none overflow-visible rounded-none border-none bg-transparent p-0 shadow-none",
      }}
    >
      <ModalContent className="bg-transparent shadow-none">
        {(onClose) => (
          <div
            ref={ref}
            className={cn(
              "relative grid w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] gap-4 overflow-y-auto overscroll-contain rounded-3xl border border-[color:var(--color-slate-200)]/90 bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_34px_70px_-36px_rgba(15,23,42,0.58)] backdrop-blur-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6",
              className,
            )}
            {...props}
          >
            {children}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--color-slate-200)]/80 bg-[rgba(255,255,255,0.8)] opacity-80 transition-colors hover:bg-[color:var(--color-slate-50)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2 disabled:pointer-events-none sm:right-4 sm:top-4 sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        )}
      </ModalContent>
    </Modal>
  )
})
DialogContent.displayName = "DialogContent"

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-w-0 flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  )
}

DialogHeader.displayName = "DialogHeader"

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2", className)}
      {...props}
    />
  )
}

DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("min-w-0 text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("min-w-0 text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
