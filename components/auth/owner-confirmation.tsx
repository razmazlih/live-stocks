'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function OwnerConfirmation({ account, token }: { account: { id: string; email: string }; token: string }) {
  const [state, setState] = useState<'review' | 'saving' | 'saved' | 'failed'>('review');
  async function confirm() {
    setState('saving');
    try {
      const response = await fetch('/api/account/owner-confirmation', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, token }) });
      if (!response.ok || (await response.json()).confirmed !== true) throw new Error('Confirmation failed');
      setState('saved');
    } catch { setState('failed'); }
  }
  return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] p-5 text-foreground"><section className="w-full max-w-lg space-y-5 rounded-3xl border border-border bg-card p-7 text-card-foreground">
    <p className="text-xl font-semibold">LiveStocks</p><h1 className="text-2xl font-semibold">אישור החשבון להעברת התיק</h1>
    <p>בדוק שזה חשבון Google שאליו תרצה לשייך את התיק הקיים.</p>
    <dl className="space-y-2"><dt>כתובת אימייל מאומתת</dt><dd dir="ltr" className="break-all">{account.email}</dd><dt>מזהה החשבון החדש</dt><dd dir="ltr" className="break-all font-mono text-xs">{account.id}</dd></dl>
    {state === 'saved' ? <p role="status">בחירת החשבון נשמרה. הנתונים עדיין לא הועברו. אפשר לחזור לשיחה ולעדכן שאישרת.</p>
      : <><p className="text-sm leading-6 text-muted-foreground">לחיצה שומרת את בחירת החשבון בלבד. העברת הנתונים תתבצע בנפרד לאחר אימות הגיבוי, ההרשאות ושמירת ההיסטוריה.</p>
        {state === 'failed' && <p role="alert">האישור לא נשמר. יש לרענן את הדף ולנסות שוב; אם ההתחברות ישנה, יש להתחבר מחדש.</p>}
        <Button className="w-full" disabled={state === 'saving'} onClick={() => { void confirm(); }}>{state === 'saving' ? 'שומר…' : 'אשר שזה החשבון להעברת התיק הקיים'}</Button></>}
  </section></main>;
}
