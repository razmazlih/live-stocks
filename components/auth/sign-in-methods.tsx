'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authNavigation } from '@/lib/auth/browser-session';

type Methods = { account: { id: string; email: string }; methods: { password: boolean; google: boolean }; passwordEnabled: boolean; googleEnabled: boolean; emailDeliveryConfigured: boolean };
export function SignInMethodsReturn({ failed }: { failed: boolean }) {
  const [locale, setLocale] = useState<'he' | 'en'>('he'), he = locale === 'he';
  return <main lang={locale} dir={he ? 'rtl' : 'ltr'} className="mx-auto max-w-xl space-y-4 p-6">
    <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{he ? 'שיטות כניסה' : 'Sign-in methods'}</h1><Button variant="ghost" onClick={() => setLocale(he ? 'en' : 'he')}>{he ? 'English' : 'עברית'}</Button></div>
    {failed && <p role="alert">{he ? 'הקישור לא הושלם. אפשר לנסות שוב.' : 'Linking did not complete. Please retry.'}</p>}
    <SignInMethods locale={locale} completed />
    <Link href="/settings" className="block text-sm underline">{he ? 'חזרה להגדרות' : 'Back to settings'}</Link>
  </main>;
}
export function SignInMethods({ locale = 'he', completed = false }: { locale?: 'he' | 'en'; completed?: boolean }) {
  const he = locale === 'he', [value, setValue] = useState<Methods | null>(null), [error, setError] = useState(false);
  const [password, setPassword] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/sign-in-methods', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error(); const data = await response.json();
        if (!data.account?.id || typeof data.methods?.password !== 'boolean' || typeof data.methods?.google !== 'boolean') throw Error();
        if (!controller.signal.aborted) setValue(data);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  async function add(method: 'google' | 'password') {
    if (!consent || pending.current) return;
    pending.current = true; setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/account/sign-in-methods/${method}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, ...(method === 'google' ? { password } : {}) }) });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (method === 'google') {
        const url = new URL(data.url);
        if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth' || url.username || url.password || url.hash) throw Error();
        authNavigation.assign(url.href);
      } else if (data.sent === true) setSent(true);
      else throw Error();
    } catch { setError(true); }
    finally { pending.current = false; setBusy(false); setPassword(''); }
  }
  if (value && !value.passwordEnabled) return null;
  return <section className="mt-5 space-y-4 border-t border-border pt-5" aria-label={he ? 'שיטות כניסה' : 'Sign-in methods'}>
    <h3 className="font-semibold">{he ? 'שיטות כניסה לאותו חשבון' : 'Sign-in methods for this account'}</h3>
    <p className="text-sm leading-6 text-muted-foreground">{he ? 'Google וסיסמה יכולים לפתוח את אותו חשבון ואת אותו תיק. קישור שיטה נוספת אינו מעביר או מוחק נתונים.' : 'Google and a password can open the same account and portfolio. Adding a method does not move or delete data.'}</p>
    {error && <p role="alert" className="text-sm text-[var(--color-red-600)]">{he ? 'לא ניתן להשלים את הבקשה. יש לבדוק את פרטי הכניסה ולנסות שוב; לאחר כמה ניסיונות יש להמתין.' : 'The request could not be completed. Check your sign-in details and retry; after several attempts, wait before retrying.'}</p>}
    {!value && !error && <p role="status">{he ? 'טוען…' : 'Loading…'}</p>}
    {value && <>
      <p dir="ltr" className="break-all text-sm">{value.account.email}</p>
      <ul className="space-y-1 text-sm"><li>{he ? 'סיסמה' : 'Password'}: {value.methods.password ? (he ? 'מחוברת' : 'Connected') : (he ? 'לא הוגדרה' : 'Not set')}</li><li>Google: {value.methods.google ? (he ? 'מחובר' : 'Connected') : (he ? 'לא מחובר' : 'Not connected')}</li></ul>
      {completed && value.methods.google && <p role="status" className="text-sm">{he ? 'Google מחובר לחשבון זה. התיק נשאר באותו חשבון.' : 'Google is connected to this account. Your portfolio stays in the same account.'}</p>}
      {sent ? <p role="status" className="text-sm leading-6">{he ? 'נשלח קישור לכתובת החשבון לבחירת סיסמה. לאחר העדכון יש להתחבר מחדש; אפשר להמשיך להשתמש גם ב־Google.' : 'A password setup link was sent to your account email. Sign in again after setting it; Google will remain available.'}</p> : (!value.methods.google || !value.methods.password) && <>
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} className="mt-1" /><span>{he ? 'אני מאשר/ת הוספת שיטת כניסה לחשבון הזה. ב־Google אבחר באותה כתובת דוא״ל מאומתת.' : 'I approve adding a sign-in method to this account. For Google, I will choose the same verified email.'}</span></label>
        {!value.methods.google && value.methods.password && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void add('google'); }}>
          <Label htmlFor="method-current-password">{he ? 'הסיסמה הנוכחית לאימות החשבון' : 'Current password to verify this account'}</Label>
          <Input id="method-current-password" name="current-password" type="password" autoComplete="current-password" dir="ltr" required maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
          <Button disabled={!consent || !password || busy || !value.googleEnabled}>{he ? 'אימות וחיבור Google' : 'Verify and connect Google'}</Button>
          {!value.googleEnabled && <p className="text-xs text-muted-foreground">{he ? 'חיבור Google אינו זמין בסביבה זו.' : 'Google linking is unavailable in this environment.'}</p>}
        </form>}
        {!value.methods.password && value.methods.google && <><Button disabled={!consent || busy || !value.emailDeliveryConfigured} onClick={() => { void add('password'); }}>{he ? 'שליחת קישור להוספת סיסמה' : 'Email a password setup link'}</Button><p className="text-xs leading-5 text-muted-foreground">{value.emailDeliveryConfigured ? (he ? 'הקישור יישלח רק לדוא״ל המאומת של החשבון. לאחר שינוי הסיסמה החיבורים הקיימים יתנתקו.' : 'The link goes only to this account’s verified email. Setting the password signs out existing sessions.') : (he ? 'משלוח דוא״ל אינו זמין כרגע.' : 'Email delivery is currently unavailable.')}</p></>}
      </>}
    </>}
  </section>;
}
