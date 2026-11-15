'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AccountLinkRequestError, navigateAccountLink, requestAccountLinkReauthentication, requestAccountLinkStatus } from '@/lib/account-linking-client';
import type { AccountLinkConfirmation, AccountLinkOperation, AccountLinkReview, AccountLinkStatus, LinkedSignInMethod } from '@/types/account-linking';
import { ACCOUNT_MERGE_RECOVERY_PATH } from './account-merge-recovery-notice';

function methodName(method: LinkedSignInMethod, he: boolean) {
  return method === 'google' ? 'Google' : method === 'password' ? (he ? 'דוא״ל וסיסמה' : 'Email and password') : (he ? 'שיטת כניסה נוספת' : 'Another sign-in method');
}

export function AccountLinking({ locale }: { locale: 'he' | 'en' }) {
  const he = locale === 'he';
  const [status, setStatus] = useState<AccountLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountLinkRequestError['code'] | null>(null);
  const [choices, setChoices] = useState({ reviewKey: '', settings: '', credential: '', confirmed: false });
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const requestVersion = useRef(0);
  const completionAttempt = useRef<string | null>(null);
  const operation = status?.available ? status.operation : null;

  const refresh = useCallback(async (preserveError = false) => {
    if (!controller.current || controller.current.signal.aborted || busyRef.current) return;
    const lifetime = controller.current;
    busyRef.current = true;
    setBusy(true);
    const version = ++requestVersion.current;
    if (!preserveError) setError(null);
    try {
      const next = await requestAccountLinkStatus('status', lifetime.signal);
      if (!lifetime.signal.aborted && version === requestVersion.current) setStatus(next);
    } catch {
      if (!lifetime.signal.aborted && version === requestVersion.current) setError('UNAVAILABLE');
    } finally {
      if (version === requestVersion.current) {
        busyRef.current = false;
        if (!lifetime.signal.aborted) setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    const lifetime = new AbortController();
    controller.current = lifetime;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { lifetime.abort(); busyRef.current = false; window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const reviewKey = operation?.phase === 'review_ready' ? `${operation.id}:${operation.review.version}:${operation.review.hash}` : '';
  const activeChoices = choices.reviewKey === reviewKey ? choices : { settings: '', credential: '', confirmed: false };

  useEffect(() => {
    if (!operation || busy || !['frozen', 'db_prepared', 'revocation_pending', 'ready_to_activate'].includes(operation.phase)) return;
    const timer = window.setTimeout(() => { void refresh(true); }, 4000);
    return () => window.clearTimeout(timer);
  }, [operation, busy, refresh]);

  useEffect(() => {
    if (operation?.phase !== 'completed') return;
    const key = `${operation.id}:${operation.signInUrl}`;
    if (completionAttempt.current === key) return;
    completionAttempt.current = key;
    try { navigateAccountLink(operation.signInUrl, true); }
    catch { setError('INVALID_NAVIGATION'); }
  }, [operation]);

  async function perform(action: () => Promise<AccountLinkStatus | void>) {
    if (busyRef.current || !controller.current || controller.current.signal.aborted) return;
    busyRef.current = true;
    requestVersion.current++;
    setBusy(true);
    setError(null);
    let reload = false;
    try {
      const next = await action();
      if (!controller.current.signal.aborted && next) setStatus(next);
    } catch (failure) {
      if (controller.current.signal.aborted) return;
      const code = failure instanceof AccountLinkRequestError ? failure.code : 'UNAVAILABLE';
      setError(code);
      if (code === 'PROOF_EXPIRED' || code === 'REVIEW_CHANGED' || code === 'CONFLICT') {
        setStatus(null);
        setChoices({ reviewKey: '', settings: '', credential: '', confirmed: false });
        reload = true;
      }
    } finally {
      busyRef.current = false;
      if (!controller.current.signal.aborted) {
        setBusy(false);
        if (reload) void refresh(true);
      }
    }
  }

  const mutate = (path: string, body: unknown = {}) => perform(() => requestAccountLinkStatus(path, controller.current!.signal, body));
  const candidate = status?.available ? status.candidates[0] : undefined;
  const review = operation?.phase === 'review_ready' ? operation.review : null;
  const actionBlocked = busy || Boolean(error && !['PROOF_EXPIRED', 'REVIEW_CHANGED', 'CONFLICT'].includes(error));
  const errorText = error === 'PROOF_EXPIRED' ? (he ? 'תוקף האימות פג. יש לאמת שוב את החשבונות לפני האיחוד.' : 'Verification expired. Verify the accounts again before merging.')
    : error === 'REVIEW_CHANGED' || error === 'CONFLICT' ? (he ? 'הנתונים השתנו. יש לעיין בסקירה מעודכנת ולאשר מחדש.' : 'The data changed. Review the updated summary and confirm again.')
      : error === 'INVALID_NAVIGATION' ? (he ? 'כתובת האימות אינה תקינה. לא בוצע מעבר לעמוד אחר.' : 'The verification address is invalid. No navigation occurred.')
        : error === 'NOT_READY' ? (he ? 'איחוד החשבונות עדיין אינו זמין. ניתן לנסות שוב מאוחר יותר.' : 'Account merging is not ready yet. Try again later.')
          : (he ? 'לא ניתן לבדוק את מצב האיחוד כרגע. יש לרענן לפני שממשיכים.' : 'Unable to check merge status. Refresh before continuing.');

  function confirmReview(current: AccountLinkReview) {
    if (operation?.phase !== 'review_ready') return;
    const body: AccountLinkConfirmation = {
      reviewVersion: current.version, reviewHash: current.hash,
      accountIds: [current.accounts[0].id, current.accounts[1].id], canonicalAccountId: current.canonicalAccountId,
      ...(current.settings.conflict ? { settingsAccountId: activeChoices.settings } : {}),
      ...(current.credential.conflict ? { credentialAccountId: activeChoices.credential } : {}), confirmed: true,
    };
    void mutate(`${encodeURIComponent(operation.id)}/confirm`, body);
  }

  return <section className="mt-5 space-y-4 border-t border-slate-200/60 pt-5" aria-labelledby="account-linking-heading" aria-busy={busy}>
    <h3 id="account-linking-heading" className="font-semibold">{he ? 'שיטות כניסה ואיחוד חשבונות' : 'Sign-in methods and account merging'}</h3>
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-rose-600">{errorText}</p><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void refresh(); }}>{he ? 'רענון מצב' : 'Refresh status'}</Button></div>}
    {!status && !error && <p role="status" className="text-sm text-slate-500">{he ? 'בודק את החשבון…' : 'Checking your account…'}</p>}
    {status && !status.available && <div className="space-y-2"><p className="text-sm text-slate-500">{he ? 'איחוד חשבונות עדיין אינו זמין בסביבה זו. אותה כתובת דוא״ל לבדה אינה מאחדת חשבונות.' : 'Account merging is not available in this environment yet. Sharing an email address alone does not merge accounts.'}</p><Button variant="ghost" size="sm" disabled={busy} onClick={() => { void refresh(); }}>{he ? 'בדיקה מחדש' : 'Check again'}</Button></div>}
    {status?.available && <>
      {status.linkedMethods.length > 0 && <p className="text-sm"><span className="text-slate-500">{he ? 'שיטות הכניסה לחשבון זה: ' : 'Sign-in methods for this account: '}</span>{status.linkedMethods.map((method) => methodName(method, he)).join(' · ')}</p>}
      {!operation && <>
        <p className="text-sm leading-6 text-slate-500">{candidate ? (he ? 'ייתכן שקיים חשבון נוסף שלך. כדי לאחד את התיקים יש לאמת את שני החשבונות ולסקור את הנתונים לפני אישור.' : 'You may have another account. Verify both accounts and review the data before approving a portfolio merge.') : (he ? 'לא נמצאה כרגע הצעה לאיחוד חשבון נוסף.' : 'No other account is currently suggested for merging.')}</p>
        {candidate && <Button type="button" disabled={actionBlocked} onClick={() => { void mutate('start', { candidateId: candidate.id }); }}>{he ? 'בדיקת חשבון נוסף' : 'Check another account'}</Button>}
      </>}
      {operation?.phase === 'proofs_pending' && <>
        <p className="text-sm leading-6">{he ? `אימות חשבון ${operation.proofsCompleted + 1} מתוך 2. הנתונים של החשבון הנוסף יוצגו רק לאחר שני האימותים.` : `Verify account ${operation.proofsCompleted + 1} of 2. The other account’s data appears only after both verifications.`}</p>
        <Button type="button" disabled={actionBlocked} onClick={() => { void perform(async () => {
          const destination = await requestAccountLinkReauthentication(operation.id, operation.nextStep, controller.current!.signal);
          if (!controller.current!.signal.aborted) navigateAccountLink(destination);
        }); }}>{he ? (operation.nextStep === 'current' ? 'אימות החשבון הנוכחי' : 'אימות החשבון הנוסף') : (operation.nextStep === 'current' ? 'Verify current account' : 'Verify other account')}</Button>
      </>}
      {review && <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">{he ? 'האישור ינתק את שני החשבונות. אם התהליך נעצר, קישור ההתאוששות זמין גם ממסך הכניסה באותו דפדפן.' : 'Confirming signs both accounts out. If the operation is interrupted, recovery is also available from sign-in in this browser.'} <a href={ACCOUNT_MERGE_RECOVERY_PATH} className="underline underline-offset-4">{he ? 'פתיחת התאוששות האיחוד' : 'Open merge recovery'}</a></p>
        <p className="text-sm leading-6">{he ? 'שני החשבונות אומתו. יש לסקור את הרישומים ולבחור הגדרות פעילות לפני האישור. הרכישות והיסטוריית המכירות של שני החשבונות נשמרות.' : 'Both accounts are verified. Review the records and choose active settings before confirming. Purchases and sale history from both accounts are preserved.'}</p>
        <div className="grid gap-3 sm:grid-cols-2">{review.accounts.map((account, index) => <div key={account.id} className="min-w-0 space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
          <h4 className="font-medium">{he ? `חשבון ${index + 1}` : `Account ${index + 1}`} · {methodName(account.method, he)}</h4>
          <p dir="ltr" className="break-all font-mono text-xs text-slate-500">{account.id}</p>
          {account.id === review.canonicalAccountId && <p className="text-xs text-blue-600">{he ? 'החשבון שיישאר לאחר האיחוד' : 'Account retained after merging'}</p>}
          <dl className="space-y-1">{(Object.keys(account.counts) as (keyof typeof account.counts)[]).map((key) => <div key={key} className="flex justify-between gap-3"><dt>{countLabel(key, he)}</dt><dd className="tabular-nums">{account.counts[key]}</dd></div>)}</dl>
        </div>)}</div>
        {review.settings.conflict && <fieldset className="space-y-3"><legend className="text-sm font-medium">{he ? 'אילו הגדרות יהיו פעילות?' : 'Which settings should be active?'}</legend>{review.settings.choices.map((choice) => <label key={choice.accountId} className="flex items-start gap-2 text-sm leading-6"><input type="radio" name="link-settings" value={choice.accountId} checked={activeChoices.settings === choice.accountId} disabled={busy} onChange={() => setChoices({ ...activeChoices, reviewKey, settings: choice.accountId })} className="mt-1.5" /><span>{accountLabel(review, choice.accountId, he)} · {choice.currency} · {he ? 'יעד שנתי' : 'Annual target'} {(choice.annualGrowthRate * 100).toLocaleString(he ? 'he-IL' : 'en-US')}% · {he ? 'רענון שמור' : 'Saved refresh'}: {choice.refreshInterval} {he ? 'דקות' : 'min'}</span></label>)}</fieldset>}
        {review.credential.conflict && <fieldset className="space-y-3"><legend className="text-sm font-medium">{he ? 'איזה מפתח Finnhub יהיה פעיל?' : 'Which Finnhub key should be active?'}</legend>{review.credential.choices.map((choice) => <label key={choice.accountId} className="flex items-center gap-2 text-sm"><input type="radio" name="link-credential" value={choice.accountId} checked={activeChoices.credential === choice.accountId} disabled={busy} onChange={() => setChoices({ ...activeChoices, reviewKey, credential: choice.accountId })} /><span>{accountLabel(review, choice.accountId, he)} · {choice.configured ? (he ? 'מפתח שמור ••••••••' : 'Saved key ••••••••') : (he ? 'ללא מפתח' : 'No key')}</span></label>)}</fieldset>}
        <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={activeChoices.confirmed} disabled={busy} onChange={(event) => setChoices({ ...activeChoices, reviewKey, confirmed: event.target.checked })} className="mt-1.5" /><span>{he ? 'בדקתי את שני החשבונות ואת הבחירות. אני מאשר/ת איחוד, התחברות מחדש וחידוש חיבורי הפלאגין והווידג׳טים לאחר מכן.' : 'I reviewed both accounts and my choices. I approve merging, signing in again, and reconnecting the plugin and widgets afterward.'}</span></label>
        <Button type="button" disabled={actionBlocked || !activeChoices.confirmed || (review.settings.conflict && !activeChoices.settings) || (review.credential.conflict && !activeChoices.credential)} onClick={() => confirmReview(review)}>{he ? 'אישור איחוד החשבונות' : 'Confirm account merge'}</Button>
      </div>}
      {operation && 'resumable' in operation && <div className="space-y-3">
        <a href={ACCOUNT_MERGE_RECOVERY_PATH} className="text-sm underline underline-offset-4">{he ? 'המשך גם ללא התחברות' : 'Continue recovery while signed out'}</a>
        <p role="status" className="text-sm leading-6">{progressLabel(operation.phase, he)}</p>
        {operation.resumable && <Button type="button" variant="outline" disabled={actionBlocked} onClick={() => { void mutate(`${encodeURIComponent(operation.id)}/resume`); }}>{he ? 'המשך התהליך השמור' : 'Resume saved operation'}</Button>}
      </div>}
      {operation?.phase === 'completed' && <div className="space-y-3"><p role="status" className="text-sm leading-6">{he ? 'האיחוד הושלם. יש להתחבר מחדש כדי לפתוח את התיק המאוחד.' : 'The merge is complete. Sign in again to open the unified portfolio.'}</p><Button type="button" disabled={busy} onClick={() => { void perform(async () => navigateAccountLink(operation.signInUrl, true)); }}>{he ? 'התחברות לתיק המאוחד' : 'Sign in to the unified portfolio'}</Button></div>}
      {(operation?.phase === 'cancelled' || operation?.phase === 'expired') && <div className="space-y-3"><p role="status" className="text-sm">{operation.phase === 'expired' ? (he ? 'תוקף התהליך פג. יש להתחיל שוב עם אימות חדש.' : 'This operation expired. Start again with fresh verification.') : (he ? 'התהליך בוטל לפני האיחוד.' : 'The operation was cancelled before merging.')}</p><Button type="button" variant="outline" disabled={busy} onClick={() => { void refresh(); }}>{he ? 'רענון מצב' : 'Refresh status'}</Button>{candidate && <Button type="button" disabled={actionBlocked} onClick={() => { void mutate('start', { candidateId: candidate.id }); }}>{he ? 'התחלת אימות חדש' : 'Start fresh verification'}</Button>}</div>}
      {operation?.canCancel && <div><Button type="button" variant="ghost" disabled={busy} onClick={() => { void mutate(`${encodeURIComponent(operation.id)}/cancel`); }}>{he ? 'ביטול התהליך' : 'Cancel operation'}</Button></div>}
    </>}
  </section>;
}

function accountLabel(review: AccountLinkReview, accountId: string, he: boolean) {
  const index = review.accounts.findIndex((account) => account.id === accountId);
  return he ? `חשבון ${index + 1}` : `Account ${index + 1}`;
}
function countLabel(key: keyof AccountLinkReview['accounts'][0]['counts'], he: boolean) {
  return ({ positions: he ? 'רישומי החזקות' : 'Position records', lots: he ? 'רכישות' : 'Purchase lots', plans: he ? 'תוכניות' : 'Plans', watchlistGroups: he ? 'קבוצות מעקב' : 'Watchlist groups', watchlistTickers: he ? 'סימולים במעקב' : 'Watchlist entries' })[key];
}
function progressLabel(phase: AccountLinkOperation['phase'], he: boolean) {
  if (phase === 'reconcile_required') return he ? 'האיחוד ממתין לבדיקה לפני המשך. מצב התהליך נשמר; אין להתחיל איחוד נוסף.' : 'The merge needs review before continuing. Its state is saved; do not start another merge.';
  if (phase === 'revocation_pending') return he ? 'מבטל הרשאות קודמות לפני פתיחת התיק המאוחד…' : 'Revoking previous access before opening the unified portfolio…';
  return he ? 'האיחוד מתבצע. הנתונים נעולים לעריכה עד להשלמת התהליך.' : 'The merge is in progress. Data is locked for editing until it completes.';
}
