'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent, type ReactElement } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { Locale, PortfolioSummary, Settings } from '@/types';
import { getPerformanceTotals, type PerformanceOptions } from '@/lib/performance-display';

export interface TargetControls {
  rate: number;
  project: (rate: number) => PortfolioSummary | null;
  save: (rate: number) => Promise<void>;
}

interface Props extends TargetControls {
  actual: number;
  locale: Locale;
  currency: Settings['currency'];
  options: PerformanceOptions;
  href: string;
  children: ReactElement;
}

export function AnnualTargetEditor({ rate, project, save, actual, locale, currency, options, href, children }: Props) {
  const he = locale === 'he';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const percent = draft.trim() ? Number(draft) : NaN;
  const valid = Number.isFinite(percent) && percent >= 0 && percent <= 100;
  const projected = open && valid ? project(percent / 100) : null;
  const target = projected && getPerformanceTotals(projected, currency, options).target;

  function changeOpen(next: boolean) {
    if (pending.current) return;
    if (next) { setDraft(String(Number((rate * 100).toFixed(6)))); setError(false); }
    setOpen(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !valid) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      await save(percent / 100);
      setOpen(false);
      toast.success(he ? 'היעד השנתי נשמר' : 'Annual target saved');
    } catch { setError(true); }
    finally { pending.current = false; setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>{children}</DialogTrigger>
    <DialogContent lang={locale} dir={he ? 'rtl' : 'ltr'} closeLabel={he ? 'סגירה' : 'Close'} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{he ? 'היעד השנתי שלי' : 'My annual target'}</DialogTitle>
        <DialogDescription>{he ? 'אפשר לנסות שיעור תשואה ולראות איך הוא משפיע על הפער מהיעד.' : 'Try a return rate to see how it changes the gap to your target.'}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="grid gap-5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="annual-target-value" className="font-medium">{he ? 'תשואה שנתית' : 'Annual return'}</label>
          <div dir="ltr" className="flex items-center gap-1.5">
            <Input id="annual-target-value" type="number" inputMode="decimal" step="any" min="0" max="100" required disabled={saving}
              value={draft} onChange={event => setDraft(event.target.value)} className="w-24 text-center tabular-nums" />
            <span>%</span>
          </div>
        </div>
        <input type="range" min={0} max={100} step={0.25} value={valid ? percent : 0} dir="ltr" disabled={saving}
          className="w-full cursor-pointer accent-[var(--accent-text)]" aria-label={he ? 'התאמת אחוז התשואה' : 'Adjust return percentage'}
          onChange={event => setDraft(event.target.value)} />
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--accent-soft)] p-4">
          <div><dt className="text-sm">{he ? 'יעד מצטבר' : 'Cumulative target'}</dt>
            <dd><AnimatedNumber className="text-xl font-semibold" value={target} currency={currency} locale={locale} /></dd></div>
          <div><dt className="text-sm">{he ? 'פער מהיעד' : 'Gap to target'}</dt>
            <dd><AnimatedNumber className="text-xl font-semibold" value={typeof target === 'number' ? actual - target : null} currency={currency} locale={locale} signed /></dd></div>
        </dl>
        {error && <p role="alert">{he ? 'שמירת היעד נכשלה. אפשר לנסות שוב.' : 'Could not save your target. Please try again.'}</p>}
        <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={saving || !valid}>{saving ? (he ? 'שומר…' : 'Saving…') : (he ? 'שמירת היעד' : 'Save target')}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>{he ? 'ביטול' : 'Cancel'}</Button></div>
        <Link href={href} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-[var(--accent-text)]">{he ? 'לכל היעדים' : 'View all targets'}<ArrowUpRight size={15} /></Link>
      </form>
    </DialogContent>
  </Dialog>;
}
