'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authNavigation } from '@/lib/auth/browser-session';
import { validConsentDestination } from '@/lib/auth/oauth-continuation';
import type { ConsentReview } from '@/lib/auth/oauth-consent';

export function OAuthConsent({ review, initialLocale = 'he' }: { review: ConsentReview | null; initialLocale?: 'he' | 'en' }) {
  const [locale, setLocale] = useState(initialLocale), he = locale === 'he';
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<'changed' | 'expired' | 'request' | null>(null);
  const pending = useRef(false);
  const scopeText: Record<string, string> = {
    'portfolio:read': he ? 'קריאת התיק: החזקות, פעולות, סכומים וחישובים.' : 'Read your portfolio: holdings, transactions, amounts and calculations.',
    openid: he ? 'זיהוי החשבון שלך ב־LiveStocks.' : 'Identify your LiveStocks account.',
    email: he ? 'קבלת כתובת הדוא״ל ומצב האימות שלה.' : 'Receive your email address and verification status.',
    profile: he ? 'קבלת פרטי הפרופיל הבסיסיים שלך.' : 'Receive your basic profile information.',
    offline_access: he ? 'המשך גישה באמצעות חידוש הרשאה, גם כשהאתר אינו פתוח.' : 'Maintain access using authorization renewal while the website is closed.',
  };
  async function decide(accept: boolean) {
    if (!review || pending.current) return;
    if (review.expiresAt * 1000 <= Date.now()) { setFailure('expired'); return; }
    pending.current = true; setBusy(true); setFailure(null);
    try {
      const response = await fetch('/api/account/oauth/consent', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: review.query, receipt: review.receipt, accept }) });
      const value = await response.json();
      if (!response.ok) { setFailure(value.code === 'ACCOUNT_CHANGED' ? 'changed' : ['INVALID_REQUEST', 'SIGN_IN_REQUIRED'].includes(value.code) ? 'expired' : 'request'); return; }
      const destination = validConsentDestination(value.url, review.callback, window.location.origin);
      if (!destination) { setFailure('request'); return; }
      authNavigation.assign(destination);
    } catch { setFailure('request'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main lang={locale} dir={he ? 'rtl' : 'ltr'} className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] p-5 text-foreground">
    <section className="w-full max-w-lg space-y-6 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl sm:p-8">
      <div className="flex items-center justify-between"><span className="text-xl font-bold">LiveStocks</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => setLocale(he ? 'en' : 'he')}>{he ? 'English' : 'עברית'}</Button></div>
      <ShieldCheck className="h-10 w-10 text-[var(--accent-text)]" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{he ? 'אישור חיבור לתיק שלך' : 'Connect to your portfolio'}</h1>
      {!review ? <><p role="alert" className="text-sm leading-6">{he ? 'בקשת החיבור חסרה, פגה או אינה זמינה. יש להתחיל שוב מתוך האפליקציה שרוצים לחבר.' : 'This connection request is missing, expired or unavailable. Start again from the app you want to connect.'}</p><Link href="/" className="text-sm underline">{he ? 'חזרה ל־LiveStocks' : 'Back to LiveStocks'}</Link></> : <>
        <p className="text-sm leading-6">{he ? 'האפליקציה' : 'The app'} <strong>{review.clientName}</strong> {he ? 'מבקשת גישה לחשבון הבא:' : 'requests access to this account:'}</p>
        <div className="space-y-1 rounded-2xl bg-[var(--accent-soft)] p-4"><p className="font-medium">{review.account.name}</p><p dir="ltr" className="break-all text-sm">{review.account.email}</p><p className="text-xs text-muted-foreground">{he ? 'מזהה חשבון' : 'Account ID'}</p><p dir="ltr" className="break-all font-mono text-xs">{review.account.id}</p></div>
        <ul className="list-disc space-y-2 ps-5 text-sm leading-6">{review.scopes.map(scope => <li key={scope}>{scopeText[scope]}</li>)}</ul>
        <p className="rounded-xl border border-border p-3 text-sm leading-6">{he ? 'קריאה בלבד. החיבור אינו יכול לשנות את התיק או לבצע מסחר. אפשר לבטל אותו בהגדרות; ביטול אינו מוחק מידע שכבר נשלח לאפליקציה.' : 'Read-only access. This connection cannot change your portfolio or trade. You can revoke it in settings; revoking does not delete information already sent to the app.'}</p>
        <p className="text-xs leading-5 text-muted-foreground">{he ? 'לאחר הבחירה תוחזרו אל:' : 'After your choice, return to:'} <span dir="ltr" className="break-all">{new URL(review.callback).host}</span></p>
        {failure && <p role="alert" className="text-sm leading-6 text-[var(--color-red-600)]">{failure === 'changed' ? (he ? 'החשבון הוחלף. יש להתחיל בקשת חיבור חדשה ולבדוק שוב את החשבון.' : 'The account changed. Start a new connection request and review the account again.') : failure === 'expired' ? (he ? 'הבקשה או ההתחברות פגה. יש להתחיל את החיבור מחדש.' : 'The request or session expired. Start the connection again.') : (he ? 'הבחירה לא הושלמה. אפשר לנסות שוב.' : 'Your choice could not be completed. Please retry.')}</p>}
        <div className="grid grid-cols-2 gap-3"><Button disabled={busy || failure === 'changed' || failure === 'expired'} onClick={() => { void decide(true); }}>{busy ? (he ? 'רגע…' : 'Please wait…') : (he ? 'אישור גישה' : 'Allow access')}</Button><Button variant="outline" disabled={busy || failure === 'changed' || failure === 'expired'} onClick={() => { void decide(false); }}>{he ? 'סירוב' : 'Deny'}</Button></div>
        <p className="text-xs leading-5 text-muted-foreground">{he ? 'זה לא החשבון הרצוי? יש לסרב, להתנתק ולהתחיל מחדש עם החשבון הנכון.' : 'Not the right account? Deny, sign out, then start again with the correct account.'}</p>
      </>}
    </section>
  </main>;
}
