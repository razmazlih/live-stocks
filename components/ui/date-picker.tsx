'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { enUS, he as hebrew } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface DatePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  locale: 'he' | 'en';
  disabled?: boolean;
  required?: boolean;
}

function calendarDate(year: number, month: number, day: number): Date | undefined {
  if (year < 1900 || year > 2100) return undefined;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function parseValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  return match ? calendarDate(Number(match[1]), Number(match[2]), Number(match[3])) : undefined;
}

function serialize(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function display(date: Date | undefined): string {
  return date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : '';
}

function parseTyped(value: string): Date | undefined {
  const digits = value.replace(/\s/g, '');
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(digits) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(digits);
  return match ? calendarDate(Number(match[3]), Number(match[2]), Number(match[1])) : undefined;
}

/** Controlled calendar dates stay local to the selected day, without UTC conversion. */
export function DatePicker({ id, value, onChange, locale, disabled = false, required = true }: DatePickerProps) {
  const he = locale === 'he';
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected ?? new Date());
  const [typed, setTyped] = useState(display(selected));
  const [invalid, setInvalid] = useState(false);
  const manualId = `${id}-manual`;
  const errorId = `${id}-error`;

  function select(date: Date) {
    onChange(serialize(date));
    setOpen(false);
  }

  function applyTyped() {
    const date = parseTyped(typed);
    if (!date) { setInvalid(true); return; }
    select(date);
  }

  return <div className="min-w-0 w-full max-w-full">
    <input type="hidden" name={id} value={selected ? serialize(selected) : ''} />
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) { setMonth(selected ?? new Date()); setTyped(display(selected)); setInvalid(false); }
    }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled}
          className="min-h-[44px] w-full min-w-0 max-w-full justify-between rounded-2xl border-input bg-[var(--surface-muted)] px-3 text-base font-normal md:text-sm">
          <span dir="ltr" className="min-w-0 truncate">{display(selected) || (he ? 'בחירת תאריך' : 'Choose a date')}</span>
          <CalendarDays aria-hidden className="shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8} dir={he ? 'rtl' : 'ltr'}
        className="!bg-[var(--surface)] z-[60] w-[328px] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-2 [max-height:min(560px,var(--radix-popover-content-available-height))]"
        aria-label={he ? 'בחירת תאריך' : 'Choose a date'}>
        <DayPicker mode="single" required={required} selected={selected} onSelect={(date: Date | undefined) => { if (date) select(date); }}
          month={month} onMonthChange={setMonth} locale={he ? hebrew : enUS} dir={he ? 'rtl' : 'ltr'}
          captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date(2100, 11)} showOutsideDays autoFocus
          labels={{
            labelPrevious: () => he ? 'החודש הקודם' : 'Previous month',
            labelNext: () => he ? 'החודש הבא' : 'Next month',
            labelMonthDropdown: () => he ? 'חודש' : 'Month',
            labelYearDropdown: () => he ? 'שנה' : 'Year',
            labelDayButton: (date, modifiers) => `${new Intl.DateTimeFormat(he ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(date)}${modifiers.selected ? (he ? ', נבחר' : ', selected') : ''}`,
          }}
          classNames={{
            root: 'w-full min-w-0', months: 'relative w-full', month: 'w-full',
            month_caption: 'mx-10 flex h-11 items-center justify-center',
            nav: 'absolute inset-x-0 top-0 flex h-11 items-center justify-between pointer-events-none',
            button_previous: 'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            button_next: 'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dropdowns: 'flex min-w-0 items-center justify-center gap-1',
            dropdown_root: 'relative min-w-0 rounded-lg border border-input px-1.5 py-2 text-sm',
            dropdown: 'absolute inset-0 h-full w-full cursor-pointer text-base opacity-0',
            caption_label: 'flex items-center justify-center gap-1 whitespace-nowrap font-medium',
            month_grid: 'w-full table-fixed border-collapse', weekdays: '',
            weekday: 'h-8 text-center text-xs font-normal text-muted-foreground',
            week: '', day: 'p-0 text-center',
            day_button: 'flex h-10 w-full min-w-0 items-center justify-center rounded-xl text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold',
            today: '[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary',
            outside: 'text-muted-foreground opacity-50', disabled: 'opacity-40', hidden: 'invisible',
          }}
          components={{ Chevron: ({ orientation }) => orientation === 'down' ? <span aria-hidden>▾</span> : orientation === 'left' ? <ChevronLeft aria-hidden className="h-4 w-4 rtl:rotate-180" /> : <ChevronRight aria-hidden className="h-4 w-4 rtl:rotate-180" /> }}
        />
        <div className="mt-2 space-y-2 border-t border-border px-1 pt-3">
          <Label htmlFor={manualId} className="text-sm">{he ? 'הקלדת תאריך' : 'Enter a date'}</Label>
          <div className="flex min-w-0 gap-2">
            <Input id={manualId} type="text" inputMode="numeric" dir="ltr" placeholder="DD/MM/YYYY" autoComplete="off" maxLength={10}
              value={typed} onChange={(event) => { setTyped(event.target.value); setInvalid(false); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); applyTyped(); } }}
              aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} className="min-w-0 flex-1" />
            <Button type="button" onClick={applyTyped} className="shrink-0 px-3">{he ? 'החל תאריך' : 'Apply date'}</Button>
          </div>
          {invalid && <p id={errorId} role="alert" className="text-xs text-destructive">{he ? 'יש להזין תאריך תקין בפורמט יום/חודש/שנה.' : 'Enter a valid date in day/month/year format.'}</p>}
          <Button type="button" variant="ghost" className="w-full" onClick={() => select(new Date())}>{he ? 'היום' : 'Today'}</Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>;
}
