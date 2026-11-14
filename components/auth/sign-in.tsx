'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeSignInReturnTo } from '@/lib/auth/return-to';

export function SignIn({ configured, error, verificationRequired, callbackFailed, returnTo = '/' }: { configured: boolean; error?: boolean; verificationRequired?: boolean; callbackFailed?: boolean; returnTo?: string }) {
  const [locale, setLocale] = useState<'he' | 'en'>('he');
  const he = locale === 'he';
  const safeReturnTo = safeSignInReturnTo(returnTo);
  const loginUrl = `/auth/login?returnTo=${encodeURIComponent(safeReturnTo)}&ui_locales=${locale}`;
  return (
    <main lang={locale} dir={he ? 'rtl' : 'ltr'} className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] p-5 text-foreground">
      <section className="w-full max-w-md space-y-7 rounded-3xl border border-border bg-card p-7 text-card-foreground shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">LiveStocks</span>
          <Button variant="ghost" size="sm" onClick={() => setLocale(he ? 'en' : 'he')}>{he ? 'English' : 'עברית'}</Button>
        </div>
        <div className="space-y-3">
          <div className="inline-flex rounded-2xl bg-[var(--accent-soft)] p-3 text-[var(--accent-text)]"><LockKeyhole aria-hidden="true" /></div>
          <h1 className="text-2xl font-semibold">{he ? 'תיק ההשקעות האישי שלך' : 'Your personal investment portfolio'}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{he ? 'התחברות לחשבון שלך לניהול התיק, ההגדרות והחיבורים האישיים.' : 'Sign in to manage your portfolio, settings, and personal connections.'}</p>
        </div>
        {error && <p role="alert" className="text-sm text-[var(--color-red-600)]">{he ? 'לא ניתן לאמת את ההתחברות כרגע. אפשר לנסות לרענן או להתחבר מחדש.' : 'Unable to verify your session. Refresh or sign in again.'}</p>}
        {callbackFailed && <p role="alert" className="rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">{he ? 'לא הצלחנו להשלים את ההתחברות. אם יצרת חשבון חדש, יש לבדוק את הדוא״ל ולאמת את הכתובת. לאחר מכן אפשר לנסות להתחבר שוב.' : 'We could not complete sign-in. If you just created an account, check your email and verify your address, then try signing in again.'}</p>}
        {verificationRequired && <p role="alert" className="rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">{he ? 'לפני פתיחת התיק יש לאמת את כתובת הדוא״ל דרך ההודעה שנשלחה אליך, ולאחר מכן להתחבר מחדש.' : 'Before opening your portfolio, verify your email using the message sent to you, then sign in again.'}</p>}
        {configured ? <div className="space-y-3">
          <Button asChild className="w-full"><a href={loginUrl}>{he ? 'התחברות' : 'Sign in'}</a></Button>
          <Button asChild variant="outline" className="w-full"><a href={`${loginUrl}&screen_hint=signup`}><UserRound className="me-2 h-4 w-4" />{he ? 'יצירת חשבון' : 'Create account'}</a></Button>
          <p className="text-xs leading-5 text-muted-foreground">{he ? 'שכחת את הסיסמה? במסך ההתחברות ניתן לבחור באיפוס סיסמה.' : 'Forgot your password? Choose password reset on the sign-in screen.'}</p>
        </div> : <p role="status" className="rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">{he ? 'ההתחברות עדיין אינה מוגדרת בסביבה זו. יש להשלים את הגדרת Auth0 לפני שניתן לפתוח חשבון.' : 'Sign-in is not configured in this environment. Complete the Auth0 setup before creating an account.'}</p>}
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />{he ? 'ההתחברות ואיפוס הסיסמה מנוהלים באמצעות Auth0.' : 'Sign-in and password reset are managed by Auth0.'}</p>
        <nav aria-label={he ? 'מידע על השירות' : 'Service information'} className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
          <Link href={`/about?lang=${locale}`} className="underline underline-offset-4">{he ? 'אודות' : 'About'}</Link>
          <Link href={`/privacy?lang=${locale}`} className="underline underline-offset-4">{he ? 'פרטיות' : 'Privacy'}</Link>
          <Link href={`/terms?lang=${locale}`} className="underline underline-offset-4">{he ? 'תנאי שימוש' : 'Terms'}</Link>
        </nav>
      </section>
    </main>
  );
}
