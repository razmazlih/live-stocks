'use client';

import { AccountMergeRecoveryNotice } from './account-merge-recovery-notice';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/better-auth-client';
import { clearBrowserAccount, finishEmailSignIn } from '@/lib/auth/browser-session';
import { safeSignInReturnTo } from '@/lib/auth/return-to';
import { isPublicAuthPath } from '@/lib/public-routes';
import type { AuthScreenMode } from '@/types/auth';

type ScreenError = 'sign-in' | 'request' | 'delivery' | 'password-mismatch' | 'reset-link';
export type AuthScreenProps = {
  configured: boolean; demoEnabled?: boolean; passwordEnabled?: boolean; googleEnabled?: boolean; emailDeliveryConfigured?: boolean;
  mode?: AuthScreenMode; initialLocale?: 'he' | 'en'; returnTo?: string;
  error?: boolean; verificationRequired?: boolean; callbackFailed?: boolean; verificationReturned?: boolean;
  resetToken?: string; resetLinkInvalid?: boolean;
  oauthQuery?: string | null;
};

export function AuthScreen({ configured, demoEnabled = false, passwordEnabled = false, googleEnabled = false, emailDeliveryConfigured = false,
  mode: requestedMode = 'sign-in', initialLocale = 'he', returnTo = '/', error, verificationRequired, callbackFailed,
  verificationReturned, resetToken: initialResetToken, resetLinkInvalid, oauthQuery = null }: AuthScreenProps) {
  const mode = passwordEnabled ? requestedMode : 'sign-in';
  const [locale, setLocale] = useState(initialLocale);
  const he = locale === 'he';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken ?? '');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<ScreenError | null>(null);
  const [success, setSuccess] = useState<'email' | 'reset' | null>(null);
  const submitting = useRef(false);
  const controller = useRef(new AbortController());
  const candidateReturnTo = safeSignInReturnTo(returnTo);
  const safeReturnTo = isPublicAuthPath(candidateReturnTo.split(/[?#]/)[0]) ? '/' : candidateReturnTo;
  const path = (target: AuthScreenMode, extra?: Record<string, string>) => {
    const params = new URLSearchParams(oauthQuery ?? '');
    // Page controls never modify parameters signed by the provider.
    if (!oauthQuery) { params.set('lang', locale); params.set('returnTo', safeReturnTo); }
    if (oauthQuery && !params.getAll('ba_param').includes('ui_lang')) params.set('ui_lang', locale);
    for (const [key, value] of Object.entries(extra ?? {})) if (!params.getAll('ba_param').includes(key)) params.set(key, value);
    return `/${target}?${params}`;
  };
  const verificationReturn = path('sign-in', { verified: '1' });
  const needsDelivery = ['sign-up', 'forgot-password', 'verify-email'].includes(mode);
  const invalidReset = mode === 'reset-password' && (!resetToken || Boolean(resetLinkInvalid));
  const canSubmit = passwordEnabled && configured && (!needsDelivery || emailDeliveryConfigured) && !invalidReset && !busy;

  useEffect(() => {
    const lifetime = new AbortController();
    controller.current = lifetime;
    // Reset links stay in component memory only, not in browser storage or outgoing referrers.
    if (mode === 'reset-password') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('token')) {
        url.searchParams.delete('token');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
    }
    return () => lifetime.abort();
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting.current) return;
    if (!event.currentTarget.checkValidity()) { event.currentTarget.reportValidity(); return; }
    if ((mode === 'sign-up' || mode === 'reset-password') && password !== confirmation) {
      setFormError('password-mismatch'); return;
    }
    const lifetime = controller.current;
    submitting.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const options = { signal: lifetime.signal };
      const result = mode === 'sign-in' ? await authClient.signIn.email({ email: email.trim(), password, callbackURL: safeReturnTo }, options)
        : mode === 'sign-up' ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: verificationReturn }, options)
          : mode === 'forgot-password' ? await authClient.requestPasswordReset({ email: email.trim(), redirectTo: path('reset-password') }, options)
            : mode === 'verify-email' ? await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: verificationReturn }, options)
              : await authClient.resetPassword({ newPassword: password, token: resetToken }, options);
      if (lifetime.signal.aborted) return;
      const code = result.error?.code as string | undefined;
      if (result.error) {
        if (code === 'EMAIL_DELIVERY_UNAVAILABLE') { setFormError('delivery'); return; }
        // Do not disclose account existence through duplicate registration or recovery errors.
        const genericEmailResult = mode === 'sign-up' && ['USER_ALREADY_EXISTS', 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'].includes(code ?? '')
          || (mode === 'forgot-password' || mode === 'verify-email') && ['USER_NOT_FOUND', 'EMAIL_NOT_FOUND', 'EMAIL_ALREADY_VERIFIED', 'EMAIL_IS_ALREADY_VERIFIED', 'EMAIL_VERIFICATION_NOT_REQUIRED'].includes(code ?? '');
        if (!genericEmailResult) {
          setFormError(mode === 'sign-in' ? 'sign-in' : mode === 'reset-password' ? 'reset-link' : 'request');
          return;
        }
      }
      if (mode === 'sign-in') {
        // The provider client already follows a validated OAuth continuation.
        // Do not race that navigation with the normal portfolio destination.
        if (result.data && 'redirect' in result.data && result.data.redirect) clearBrowserAccount('session');
        else finishEmailSignIn(safeReturnTo);
      }
      else if (mode === 'reset-password') { setSuccess('reset'); setResetToken(''); }
      else setSuccess('email');
    } catch {
      if (!lifetime.signal.aborted) setFormError('request');
    } finally {
      submitting.current = false;
      if (!lifetime.signal.aborted) { setBusy(false); setPassword(''); setConfirmation(''); }
    }
  }

  async function googleSignIn() {
    if (!configured || !googleEnabled || submitting.current) return;
    const lifetime = controller.current;
    submitting.current = true; setBusy(true); setFormError(null);
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: safeReturnTo, errorCallbackURL: path('sign-in', { error: 'sign-in-failed' }) }, { signal: lifetime.signal });
      if (result.error && !lifetime.signal.aborted) setFormError('sign-in');
    } catch { if (!lifetime.signal.aborted) setFormError('request'); }
    finally { submitting.current = false; if (!lifetime.signal.aborted) setBusy(false); }
  }

  const title = ({ 'sign-in': he ? 'תיק ההשקעות האישי שלך' : 'Your personal investment portfolio', 'sign-up': he ? 'יצירת חשבון' : 'Create an account', 'forgot-password': he ? 'איפוס סיסמה' : 'Reset your password', 'reset-password': he ? 'בחירת סיסמה חדשה' : 'Choose a new password', 'verify-email': he ? 'אימות כתובת הדוא״ל' : 'Verify your email' })[mode];
  const description = ({ 'sign-in': he ? 'התחברות לחשבון שלך לניהול התיק והחיבורים האישיים.' : 'Sign in to manage your portfolio and personal connections.', 'sign-up': he ? 'לאחר ההרשמה יש לאמת את כתובת הדוא״ל לפני הכניסה לתיק.' : 'After signing up, verify your email before opening your portfolio.', 'forgot-password': he ? 'יש להזין את כתובת הדוא״ל לקבלת קישור לבחירת סיסמה חדשה.' : 'Enter your email to request a link for choosing a new password.', 'reset-password': he ? 'יש לבחור סיסמה חדשה לחשבון. לאחר העדכון ניתן להתחבר מחדש.' : 'Choose a new password for your account, then sign in again.', 'verify-email': he ? 'ניתן לבקש קישור אימות חדש לכתובת הדוא״ל של החשבון.' : 'Request a new verification link for your account email.' })[mode];
  const errorText = formError === 'password-mismatch' ? (he ? 'הסיסמאות אינן זהות. יש להקליד שוב את אותה סיסמה.' : 'The passwords do not match. Enter the same password again.')
    : formError === 'delivery' ? (he ? 'שליחת דוא״ל אינה זמינה כרגע. יש לנסות שוב מאוחר יותר.' : 'Email delivery is currently unavailable. Please try again later.')
      : formError === 'reset-link' ? (he ? 'לא ניתן להשתמש בקישור זה. ייתכן שפג תוקפו; יש לבקש קישור איפוס חדש.' : 'This link cannot be used. It may have expired; request a new reset link.')
        : formError === 'sign-in' && !passwordEnabled ? (he ? 'לא ניתן להתחבר עם Google כרגע. אפשר לנסות שוב.' : 'Unable to sign in with Google right now. Please retry.')
        : formError === 'sign-in' ? (he ? 'לא ניתן להתחבר עם הפרטים האלה. יש לבדוק את הדוא״ל והסיסמה ולוודא שהכתובת אומתה.' : 'Unable to sign in with these details. Check your email and password and ensure your email is verified.')
          : (he ? 'לא ניתן להשלים את הבקשה כרגע. יש לנסות שוב.' : 'Unable to complete the request right now. Please try again.');

  return <main lang={locale} dir={he ? 'rtl' : 'ltr'} className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] p-5 text-foreground">
    <section className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl sm:p-7">
      <div className="flex items-center justify-between"><span className="text-xl font-bold tracking-tight">LiveStocks</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => setLocale(he ? 'en' : 'he')}>{he ? 'English' : 'עברית'}</Button></div>
      <div className="space-y-3"><div className="inline-flex rounded-2xl bg-[var(--accent-soft)] p-3 text-[var(--accent-text)]"><LockKeyhole aria-hidden="true" /></div><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm leading-6 text-muted-foreground">{description}</p></div>
      {mode === 'sign-in' && <AccountMergeRecoveryNotice locale={locale} />}
      {(error || callbackFailed) && <p role="alert" className="text-sm leading-6 text-[var(--color-red-600)]">{!passwordEnabled ? (he ? 'לא הצלחנו להשלים את ההתחברות עם Google. אפשר לנסות שוב.' : 'We could not complete Google sign-in. Please try again.') : he ? 'לא הצלחנו להשלים את ההתחברות. אפשר לנסות שוב או לבקש קישור אימות חדש. אם כבר יש לך חשבון, יש להיכנס בשיטה שבה השתמשת בעבר ולהוסיף שיטת כניסה נוספת בהגדרות.' : 'We could not complete sign-in. Try again or request a new verification link. If you already have an account, sign in with your previous method and add another sign-in method in settings.'}</p>}
      {passwordEnabled && verificationRequired && <p role="alert" className="rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">{he ? 'לפני פתיחת התיק יש לאמת את כתובת הדוא״ל דרך ההודעה שנשלחה אליך.' : 'Verify your email using the message sent to you before opening your portfolio.'}</p>}
      {passwordEnabled && verificationReturned && !success && <p role="status" className="text-sm leading-6 text-muted-foreground">{he ? 'לאחר אימות כתובת הדוא״ל אפשר להתחבר לחשבון.' : 'Once your email is verified, you can sign in to your account.'}</p>}
      {formError && <p role="alert" className="text-sm leading-6 text-[var(--color-red-600)]">{errorText}</p>}
      {mode === 'sign-in' && demoEnabled && <div className="space-y-2"><Button type="button" variant="outline" className="w-full" disabled={busy} onClick={async () => { setBusy(true); try { const response = await fetch('/api/local-demo', { method: 'POST', credentials: 'same-origin' }); if (!response.ok) throw new Error('Demo unavailable'); clearBrowserAccount('session'); window.location.assign('/'); } catch { setFormError('request'); setBusy(false); } }}>{he ? 'כניסה לחשבון דמו' : 'Explore demo account'}</Button><p className="text-xs leading-5 text-muted-foreground">{he ? 'נתוני הדגמה בלבד, ללא חיבור לתיק האישי. הדמו זמין בהרצה מקומית.' : 'Sample data only, separate from your personal portfolio. Available locally.'}</p></div>}
      {!configured && <p role="status" className="rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">{he ? 'ההתחברות עדיין אינה מוגדרת בסביבה זו. אפשר לחזור לאחר השלמת ההגדרה.' : 'Sign-in is not configured in this environment yet. Please return after setup is complete.'}</p>}
      {configured && !passwordEnabled && !googleEnabled && <p role="status" className="text-sm leading-6 text-muted-foreground">{he ? 'כניסה עם Google אינה זמינה כרגע. אפשר לנסות שוב מאוחר יותר.' : 'Google sign-in is currently unavailable. Please try again later.'}</p>}
      {configured && needsDelivery && !emailDeliveryConfigured && <p role="status" className="rounded-xl bg-[var(--warning-soft)] p-4 text-sm leading-6 text-[var(--warning-text)]">{he ? 'שליחת דוא״ל עדיין אינה זמינה. הרשמה ואימות באמצעות דוא״ל יתאפשרו לאחר הפעלתה.' : 'Email delivery is not available yet. Email registration and verification will be available once it is enabled.'}</p>}
      {success ? <div className="space-y-4">
        <p role="status" className="rounded-xl bg-[var(--accent-soft)] p-4 text-sm leading-6">{success === 'reset' ? (he ? 'הסיסמה עודכנה. אפשר להתחבר עם הסיסמה החדשה.' : 'Your password has been updated. You can sign in with the new password.') : (he ? 'אם ניתן להשלים את הבקשה לכתובת זו, יישלחו אליה הוראות. יש לבדוק גם את תיקיית הספאם.' : 'If this request can be completed for that address, instructions will be sent. Check your spam folder too.')}</p>
        <Button asChild className="w-full"><Link href={path('sign-in')}>{he ? 'חזרה להתחברות' : 'Back to sign-in'}</Link></Button>
        {mode === 'sign-up' && <Link href={path('verify-email')} className="block text-center text-sm underline underline-offset-4">{he ? 'בקשת קישור אימות נוסף' : 'Request another verification link'}</Link>}
      </div> : <>
        {passwordEnabled && (invalidReset ? <div className="space-y-3"><p role="alert" className="text-sm leading-6 text-[var(--color-red-600)]">{he ? 'קישור האיפוס חסר או אינו תקף. יש לבקש קישור חדש.' : 'The reset link is missing or invalid. Request a new link.'}</p><Button asChild variant="outline" className="w-full"><Link href={path('forgot-password')}>{he ? 'בקשת קישור חדש' : 'Request a new link'}</Link></Button></div> : <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
          {mode === 'sign-up' && <div className="space-y-2"><Label htmlFor="auth-name">{he ? 'שם לתצוגה' : 'Display name'}</Label><Input id="auth-name" name="name" autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={busy || !configured} /></div>}
          {mode !== 'reset-password' && <div className="space-y-2"><Label htmlFor="auth-email">{he ? 'כתובת דוא״ל' : 'Email address'}</Label><Input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy || !configured} dir="ltr" /></div>}
          {(mode === 'sign-in' || mode === 'sign-up' || mode === 'reset-password') && <div className="space-y-2"><Label htmlFor="auth-password">{mode === 'reset-password' ? (he ? 'סיסמה חדשה' : 'New password') : (he ? 'סיסמה' : 'Password')}</Label><Input id="auth-password" name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={mode === 'sign-in' ? undefined : 8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || !configured} dir="ltr" />{mode !== 'sign-in' && <p className="text-xs text-muted-foreground">{he ? '8–128 תווים. אפשר להשתמש במנהל סיסמאות.' : '8–128 characters. Password managers are supported.'}</p>}</div>}
          {(mode === 'sign-up' || mode === 'reset-password') && <div className="space-y-2"><Label htmlFor="auth-password-confirm">{he ? 'אישור הסיסמה' : 'Confirm password'}</Label><Input id="auth-password-confirm" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy || !configured} aria-invalid={formError === 'password-mismatch'} dir="ltr" /></div>}
          <Button type="submit" disabled={!canSubmit} className="w-full">{busy ? (he ? 'רגע…' : 'Please wait…') : mode === 'sign-in' ? (he ? 'התחברות' : 'Sign in') : mode === 'sign-up' ? (he ? 'יצירת חשבון' : 'Create account') : mode === 'reset-password' ? (he ? 'עדכון הסיסמה' : 'Update password') : (he ? 'שליחת קישור' : 'Send link')}</Button>
        </form>)}
        {(mode === 'sign-in' || mode === 'sign-up') && configured && googleEnabled && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => { void googleSignIn(); }}>{he ? 'המשך עם Google' : 'Continue with Google'}</Button>}
        {passwordEnabled && <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm underline underline-offset-4">
          {mode === 'sign-in' ? <><Link href={path('sign-up')}>{he ? 'יצירת חשבון' : 'Create account'}</Link><Link href={path('forgot-password')}>{he ? 'שכחת את הסיסמה?' : 'Forgot password?'}</Link><Link href={path('verify-email')}>{he ? 'שליחת קישור אימות' : 'Resend verification'}</Link></> : <Link href={path('sign-in')}>{he ? 'חזרה להתחברות' : 'Back to sign-in'}</Link>}
          {formError === 'reset-link' && <Link href={path('forgot-password')}>{he ? 'בקשת קישור איפוס חדש' : 'Request a new reset link'}</Link>}
        </div>}
      </>}
      <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />{he ? 'חשבון אישי לניהול התיק והחיבורים שלך.' : 'A personal account for your portfolio and connections.'}</p>
      <nav aria-label={he ? 'מידע על השירות' : 'Service information'} className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground"><Link href={`/about?lang=${locale}`} className="underline underline-offset-4">{he ? 'אודות' : 'About'}</Link><Link href={`/privacy?lang=${locale}`} className="underline underline-offset-4">{he ? 'פרטיות' : 'Privacy'}</Link><Link href={`/terms?lang=${locale}`} className="underline underline-offset-4">{he ? 'תנאי שימוש' : 'Terms'}</Link></nav>
    </section>
  </main>;
}
