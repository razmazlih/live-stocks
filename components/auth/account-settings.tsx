'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { useAuth } from './auth-provider';
import { AccountLinking } from './account-linking';
import { SignInMethods } from './sign-in-methods';

type Widget = { id: string; name: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
type Connections = { mcp: { enabled: boolean; connected: boolean; revokedAt: string | null }; widgets: Widget[] };

async function accountRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/account/${path}`, {
    ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) throw new Error(`Account request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function AccountSettings({ locale, onCredentialChange }: { locale: 'he' | 'en'; onCredentialChange: (configured: boolean | null) => void }) {
  const he = locale === 'he';
  const { user, signOut } = useAuth();
  const [credentialConfigured, setCredentialConfigured] = useState<boolean | null>(null);
  const [newCredential, setNewCredential] = useState('');
  const [connections, setConnections] = useState<Connections | null>(null);
  const [widgetName, setWidgetName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const accountRequests = useRef(new AbortController());
  const request = useCallback(<T,>(path: string, options?: RequestInit) => accountRequest<T>(path, {
    ...options, signal: accountRequests.current.signal,
  }), []);

  useEffect(() => {
    const controller = new AbortController();
    accountRequests.current = controller;
    Promise.all([
      request<{ configured: boolean }>('credentials'),
      request<Connections>('connections'),
    ]).then(([credentials, connected]) => {
      if (controller.signal.aborted) return;
      setCredentialConfigured(credentials.configured);
      onCredentialChange(credentials.configured);
      setConnections(connected);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setLoadError(true);
        onCredentialChange(null);
      }
    });
    return () => controller.abort();
  }, [onCredentialChange, request]);

  async function perform(action: string, operation: () => Promise<void>) {
    setBusy(action);
    try {
      await operation();
      if (accountRequests.current.signal.aborted) return;
      toast.success(he ? 'העדכון נשמר' : 'Changes saved');
    } catch {
      if (accountRequests.current.signal.aborted) return;
      toast.error(he ? 'לא ניתן להשלים את הפעולה. נסו שוב.' : 'Unable to complete this action. Please try again.');
    } finally { setBusy(null); }
  }

  async function saveCredential(remove = false) {
    await perform('credential', async () => {
      const value = await request<{ configured: boolean }>('credentials', {
        method: remove ? 'DELETE' : 'PUT',
        ...(!remove ? { body: JSON.stringify({ token: newCredential.trim() }) } : {}),
      });
      const configured = remove ? false : value.configured;
      setCredentialConfigured(configured);
      onCredentialChange(configured);
      setNewCredential('');
    });
  }

  return <div className="space-y-6">
    <DashboardSurface>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">{he ? 'החשבון שלי' : 'My account'}</h2>
          <p className="break-all text-sm" dir="auto">{user.email || user.name || user.id}</p>
          <p className="text-xs text-slate-500">{user.emailVerified ? (he ? 'כתובת הדוא״ל אומתה' : 'Email verified') : (he ? 'יש לאמת את כתובת הדוא״ל דרך ההודעה שנשלחה אליך' : 'Verify your email using the message sent to you')}</p>
        </div>
        <Button type="button" variant="outline" onClick={signOut}>{he ? 'התנתקות' : 'Sign out'}</Button>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div><dt className="text-xs text-slate-500">{he ? 'מזהה החשבון' : 'Account ID'}</dt><dd dir="ltr" className="break-all text-start font-mono text-xs">{user.id}</dd></div>
      </dl>
      <AccountLinking locale={locale} />
      <SignInMethods locale={locale} />
    </DashboardSurface>
    {loadError && <p role="alert" className="text-sm text-rose-600">{he ? 'לא ניתן לטעון את פרטי החיבורים. יש לרענן כדי לנסות שוב.' : 'Unable to load connections. Refresh to try again.'}</p>}
    <DashboardSurface>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveCredential(); }}>
        <h2 className="text-lg font-semibold">{he ? 'מפתח Finnhub אישי' : 'Personal Finnhub key'}</h2>
        {credentialConfigured === null ? !loadError && <Skeleton data-page-loading className="h-5 w-52 max-w-full" /> : <p className="text-sm text-slate-500">{credentialConfigured ? (he ? 'מפתח שמור בחשבון: ••••••••' : 'Saved in your account: ••••••••') : (he ? 'לא הוגדר מפתח לחשבון זה' : 'No key configured for this account')}</p>}
        <Label htmlFor="personal-finnhub-key">{credentialConfigured ? (he ? 'החלפת המפתח' : 'Replace key') : (he ? 'מפתח חדש' : 'New key')}</Label>
        <Input id="personal-finnhub-key" type="password" autoComplete="new-password" value={newCredential} onChange={(event) => setNewCredential(event.target.value)} placeholder={he ? 'הדבקת מפתח Finnhub' : 'Paste your Finnhub key'} dir="ltr" />
        <p className="text-xs text-slate-500">{he ? 'המפתח נשמר בשרת ואינו מוצג מחדש. ניתן לקבל מפתח באתר ' : 'Your key is saved on the server and is never displayed again. Get a key at '}<a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="underline">Finnhub</a>.</p>
        <div className="flex flex-wrap gap-3"><Button disabled={Boolean(busy) || !newCredential.trim()} type="submit">{busy === 'credential' ? (he ? 'שומר…' : 'Saving…') : (he ? 'שמירת מפתח' : 'Save key')}</Button>{credentialConfigured && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { void saveCredential(true); }}>{he ? 'מחיקת מפתח' : 'Remove key'}</Button>}</div>
      </form>
    </DashboardSurface>
    <DashboardSurface>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{he ? 'חיבור ל־ChatGPT' : 'ChatGPT connection'}</h2>
        {!connections ? !loadError && <Skeleton className="h-5 w-64 max-w-full" /> : <p className="text-sm text-slate-500">{!connections.mcp.enabled ? (he ? 'הגישה מ־ChatGPT מנותקת' : 'ChatGPT access is disconnected') : connections.mcp.connected ? (he ? 'מחובר לחשבון האישי שלך · קריאה בלבד' : 'Connected to your account · Read only') : (he ? 'ניתן לחבר את LiveStocks מתוך ChatGPT באמצעות התחברות לחשבון זה' : 'Connect LiveStocks from ChatGPT by signing in to this account')}</p>}
        {!connections && !loadError && <Skeleton className="h-11 w-40" />}
        {connections && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { void perform('mcp', async () => {
          await request('connections/mcp', { method: 'POST', body: JSON.stringify({ action: connections.mcp.enabled ? 'disconnect' : 'reconnect' }) });
          setConnections(await request<Connections>('connections'));
        }); }}>{connections.mcp.enabled ? (he ? 'ניתוק הגישה מ־ChatGPT' : 'Disconnect ChatGPT access') : (he ? 'אפשר חיבור מחדש' : 'Allow reconnection')}</Button>}
      </div>
    </DashboardSurface>
    <DashboardSurface>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{he ? 'טוקנים אישיים לווידג׳ט' : 'Personal widget tokens'}</h2>
        <p className="text-sm text-slate-500">{he ? 'כל טוקן מאפשר קריאת נתוני התיק בלבד, תקף ל־90 יום וניתן לבטל אותו בכל עת.' : 'Each token grants read-only portfolio access, expires after 90 days, and can be revoked at any time.'}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void perform('widget', async () => {
          const created = await request<{ token: string; widget: Widget }>('widgets', { method: 'POST', body: JSON.stringify({ name: widgetName.trim() }) });
          setCreatedToken(created.token);
          setWidgetName('');
          setConnections((current) => current ? { ...current, widgets: [created.widget, ...current.widgets] } : current);
        }); }}>
          <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="widget-name">{he ? 'שם המכשיר או הווידג׳ט' : 'Device or widget name'}</Label><Input id="widget-name" maxLength={80} value={widgetName} onChange={(event) => setWidgetName(event.target.value)} placeholder={he ? 'למשל: האייפון שלי' : 'For example: My iPhone'} /></div>
          <Button type="submit" disabled={Boolean(busy) || !connections || !widgetName.trim() || Boolean(createdToken)}>{he ? 'יצירת טוקן' : 'Create token'}</Button>
        </form>
        {createdToken && <div role="status" className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">{he ? 'יש להעתיק כעת. הטוקן מוצג פעם אחת בלבד.' : 'Copy it now. This token is shown only once.'}</p>
          <Input aria-label={he ? 'טוקן חדש לווידג׳ט' : 'New widget token'} value={createdToken} readOnly dir="ltr" onFocus={(event) => event.target.select()} />
          <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(createdToken).then(() => toast.success(he ? 'הטוקן הועתק' : 'Token copied')).catch(() => toast.error(he ? 'יש לסמן ולהעתיק את הטוקן ידנית' : 'Select the token and copy it manually')); }}>{he ? 'העתקה' : 'Copy'}</Button><Button type="button" variant="ghost" onClick={() => setCreatedToken(null)}>{he ? 'סיום והסתרת הטוקן' : 'Done, hide token'}</Button></div>
        </div>}
        {connections?.widgets.length === 0 && <p className="text-sm text-slate-500">{he ? 'עדיין אין טוקנים לחשבון זה' : 'No tokens for this account yet'}</p>}
        <ul className="divide-y divide-slate-200/40">{!connections && !loadError && <li aria-hidden="true" className="flex h-[68px] items-center justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-16" /></li>}{connections?.widgets.map((widget) => <li key={widget.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 space-y-1"><p className="break-words text-sm font-medium">{widget.name}</p><p className="text-xs text-slate-500">{widget.revokedAt ? (he ? 'בוטל' : 'Revoked') : `${he ? 'תוקף עד' : 'Expires'} ${new Date(widget.expiresAt).toLocaleDateString(he ? 'he-IL' : 'en-US')}`}</p></div>
          {!widget.revokedAt && <Button size="sm" type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { void perform(`revoke:${widget.id}`, async () => {
            await request(`widgets/${encodeURIComponent(widget.id)}`, { method: 'DELETE' });
            setCreatedToken(null);
            setConnections(await request<Connections>('connections'));
          }); }}>{he ? 'ביטול טוקן' : 'Revoke token'}</Button>}
        </li>)}</ul>
      </div>
    </DashboardSurface>
  </div>;
}
