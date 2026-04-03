"use client"

import * as React from "react"
import { Calendar as HeroCalendar } from "@heroui/react"
import { CalendarDate, type DateValue, getLocalTimeZone } from "@internationalized/date"

import { cn } from "@/lib/utils"

interface CalendarProps {
  className?: string
  mode?: "single"
  selected?: Date | null
  defaultMonth?: Date | null
  onSelect?: (date: Date | undefined) => void
  toDate?: Date
  fromDate?: Date
  initialFocus?: boolean
  showOutsideDays?: boolean
  captionLayout?: "label" | "dropdown"
  buttonVariant?: string
}

function toCalendarDate(date?: Date | null) {
  if (!date || Number.isNaN(date.getTime())) {
    return undefined
  }

  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function toJsDate(value: DateValue | null | undefined) {
  if (!value) {
    return undefined
  }

  return value.toDate(getLocalTimeZone())
}

function Calendar({
  className,
  selected,
  defaultMonth,
  onSelect,
  toDate,
  fromDate,
}: CalendarProps) {
  return (
    <HeroCalendar
      aria-label="Calendar"
      value={toCalendarDate(selected)}
      defaultFocusedValue={toCalendarDate(defaultMonth ?? selected)}
      minValue={toCalendarDate(fromDate)}
      maxValue={toCalendarDate(toDate)}
      onChange={(value) => onSelect?.(toJsDate(value))}
      className={cn("rounded-2xl bg-transparent p-1", className)}
      classNames={{
        base: "rounded-2xl bg-transparent",
        content: "w-full",
        gridWrapper: "rounded-2xl",
        headerWrapper: "px-2 pb-2",
        title: "text-sm font-medium text-[var(--color-primary-900)]",
        prevButton: "min-w-8 rounded-xl border border-[color:var(--color-slate-200)] bg-white",
        nextButton: "min-w-8 rounded-xl border border-[color:var(--color-slate-200)] bg-white",
        gridHeaderCell: "text-[0.8rem] font-normal text-muted-foreground",
        cellButton: "data-[selected=true]:bg-[var(--color-primary-600)] data-[selected=true]:text-white",
      }}
    />
  )
}

function CalendarDayButton() {
  return null
}

export { Calendar, CalendarDayButton }
