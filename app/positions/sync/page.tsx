'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SyncReviewSkeleton } from '@/components/positions/sync-review-skeleton';
import { useApp } from '@/lib/context';
import { useAuth } from '@/components/auth/auth-provider';
import type { ScreenshotSyncInput, ScreenshotSyncPlan } from '@/lib/screenshot-sync';

type Review = { input: ScreenshotSyncInput; plan: ScreenshotSyncPlan; stale: boolean; expiresAt: string };
type DateDraft = { acquiredOn: string | null; estimatedAcquiredOn: string | null };
type DateCandidateResult = { status: 'matched' | 'no_match' | 'unavailable'; latestCandidateDate?: string | null; candidates: { date: string; closeUsd: number }[]; warnings: string[]; estimated: true; canVerifyAcquisition: false };
type DateChoice = 'actual' | 'statement' | 'estimate';
const reasons = { missing_cost: 'חסרה עלות ממוצעת בדולרים', observation_precedes_recorded_events: 'הצילום ישן יותר מעסקאות שכבר נרשמו — נדרש צילום עדכני', invalid_existing_position: 'נתוני ההחזקה הקיימת דורשים בדיקה' };
const englishReasons = { missing_cost: 'Average USD cost is missing', observation_precedes_recorded_events: 'The screenshot predates recorded trades. A newer screenshot is required.', invalid_existing_position: 'The recorded holding needs review' };
const englishActions = { add: 'New holding', reconcile: 'Update balance', close: 'Set balance to zero' };
const actions = { add: 'החזקה חדשה', reconcile: 'עדכון יתרה', close: 'איפוס יתרה' };
const choiceClass = 'min-h-10 rounded-lg border px-3 py-2 text-sm disabled:opacity-50';
function rowDates(row: { acquiredOn: string | null; estimatedAcquiredOn?: string | null }): DateDraft {
  return { acquiredOn: row.acquiredOn, estimatedAcquiredOn: row.estimatedAcquiredOn ?? null };
}

async function request(he: boolean, token: string, action: 'review' | 'apply' | 'date_candidates', extra: Record<string, unknown> = {}) {
    const response = await fetch('/api/positions/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, ...extra }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || (he ? 'יש להתחבר לחשבון שבו הוכנה ההצעה ולפתוח שוב את הקישור.' : 'Sign in to the account where you prepared the proposal and reopen the link.'));
    return data;
  }

export default function ScreenshotSyncPage() {
  const token = useRef('');
  const initialized = useRef(false);
  const generation = useRef(0);
  const { user } = useAuth();
  const { locale } = useApp();
  const he = locale === 'he';
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [dates, setDates] = useState<Record<string, DateDraft>>({});
  const [dateChoices, setDateChoices] = useState<Record<string, DateChoice>>({});
  const [candidates, setCandidates] = useState<Record<string, DateCandidateResult>>({});
  const [loadingDates, setLoadingDates] = useState<Record<string, boolean>>({});

  const acceptReview = useCallback((value: Review) => {
    setReview(value);
    setDates(Object.fromEntries(value.plan.changes.filter(row => row.quantity > 0 && !row.acquiredOn).map(row => [row.symbol, rowDates(row)])));
    setDateChoices(Object.fromEntries(value.plan.changes.filter(row => row.quantity > 0 && row.acquiredOn).map(row => [row.symbol, 'actual' as const])));
    setAcknowledged(false);
  }, []);
  async function send(action: 'review' | 'apply') {
    const activeToken = token.current, activeGeneration = generation.current;
    const isCurrent = () => token.current === activeToken && generation.current === activeGeneration;
    setBusy(true); setError('');
    try {
      const data = await request(he, activeToken, action, action === 'apply' ? { acknowledgeIncompleteHistory: true, ...(datesDirty ? { dates: Object.entries(dates).map(([symbol, value]) => ({ symbol, ...value })) } : {}) } : {});
      if (!isCurrent()) return;
      if (action === 'review') acceptReview(data); else setSaved(true);
    } catch (failure) { if (isCurrent()) setError(failure instanceof Error ? failure.message : (he ? 'הסנכרון נכשל' : 'Sync failed')); }
    finally { if (isCurrent()) setBusy(false); }
  }
  async function findDate(symbol: string) {
    const activeToken = token.current, activeGeneration = generation.current;
    const isCurrent = () => token.current === activeToken && generation.current === activeGeneration;
    setDateChoices(current => ({ ...current, [symbol]: 'estimate' }));
    setLoadingDates(current => ({ ...current, [symbol]: true })); setError('');
    setCandidates(current => { const next = { ...current }; delete next[symbol]; return next; });
    try {
      const data = await request(he, activeToken, 'date_candidates', { symbol });
      if (isCurrent()) setCandidates(current => ({ ...current, [symbol]: data }));
    } catch (failure) { if (isCurrent()) setError(failure instanceof Error ? failure.message : (he ? 'לא ניתן לבדוק כרגע את היסטוריית המחיר.' : 'Price history is currently unavailable.')); }
    finally { if (isCurrent()) setLoadingDates(current => ({ ...current, [symbol]: false })); }
  }
  function changeDate(symbol: string, value: DateDraft) {
    setDates(current => ({ ...current, [symbol]: value }));
    setAcknowledged(false);
  }
  useEffect(() => {
    const loadFragment = () => {
      const nextToken = window.location.hash.slice(1);
      if (!nextToken) return;
      token.current = nextToken;
      const activeGeneration = ++generation.current;
      const isCurrent = () => token.current === nextToken && generation.current === activeGeneration;
      window.history.replaceState(null, '', window.location.pathname);
      setReview(null); setSaved(false); setAcknowledged(false); setError('');
      setDates({}); setDateChoices({}); setCandidates({}); setLoadingDates({}); setBusy(true);
      void request(he, nextToken, 'review')
        .then(value => { if (isCurrent()) acceptReview(value); })
        .catch(failure => { if (isCurrent()) setError(failure instanceof Error ? failure.message : (he ? 'הסנכרון נכשל' : 'Sync failed')); })
        .finally(() => { if (isCurrent()) setBusy(false); });
    };
    // Reattach on Strict Mode replay while keeping its initial request singular.
    window.addEventListener('hashchange', loadFragment);
    if (!initialized.current) {
      initialized.current = true;
      if (window.location.hash.slice(1)) loadFragment();
      else setError((he ? 'פתחו את קישור ההצעה שקיבלתם בצ׳אט.' : 'Open the review link you received in chat.'));
    }
    return () => window.removeEventListener('hashchange', loadFragment);
  }, [acceptReview, he]);
  const positiveChanges = review?.plan.changes.filter(row => row.quantity > 0 && !row.acquiredOn) ?? [];
  const datesDirty = positiveChanges.some(row => {
    const original = rowDates(row), draft = dates[row.symbol];
    return draft && (draft.acquiredOn !== original.acquiredOn || draft.estimatedAcquiredOn !== original.estimatedAcquiredOn);
  });

  return <main dir={he ? 'rtl' : 'ltr'} className="mx-auto max-w-5xl space-y-5 p-4 text-foreground sm:p-8">
    <h1 className="text-2xl font-bold">{he ? 'סקירת סנכרון מצילום מסך' : 'Review screenshot sync'}</h1>
    <p>{he ? 'מחובר בתור' : 'Signed in as'} {user.email || user.name || user.id}</p>
    <p>{he ? 'בדקו את החשבון, הסימולים, הכמויות והעלות לפני שמירה. התמונה אינה נשמרת ב־LiveStocks.' : 'Check the account, symbols, quantities and cost before saving. LiveStocks does not store the screenshot.'}</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!review && !error && !saved && <SyncReviewSkeleton locale={locale} />}
    {busy && review && <p role="status">{he ? 'בודק את ההצעה…' : 'Checking the proposal…'}</p>}
    {saved ? <p role="status">{he ? 'ההחזקות סונכרנו בהצלחה והיסטוריית העסקאות נשמרה.' : 'Holdings synced. Your transaction history was preserved.'} <Link href="/positions" className="underline">{he ? 'מעבר לפוזיציות' : 'View positions'}</Link></p> : review && <>
      <p>{he ? 'חשבון:' : 'Account:'} {review.plan.sourceName}{he ? ' · מצב ההחזקות נכון ל־' : ' · Balances as of '}{review.input.observedAt}</p>
      <div className="overflow-x-auto rounded-xl border p-3"><table className="w-full text-start"><caption className="mb-3 text-start font-semibold">{he ? 'השינויים המוצעים' : 'Proposed changes'}</caption><thead><tr><th className="p-2">{he ? 'סימול' : 'Symbol'}</th><th className="p-2">{he ? 'פעולה' : 'Action'}</th><th className="p-2">{he ? 'כמות לפני ← אחרי' : 'Quantity before → after'}</th><th className="p-2">{he ? 'עלות ממוצעת USD לפני ← אחרי' : 'Average cost in USD before → after'}</th><th className="p-2">{he ? 'תאריך רכישה' : 'Purchase date'}</th></tr></thead><tbody>{review.plan.changes.map(row => <tr key={row.symbol} className="border-t"><td className="p-2">{row.symbol}</td><td className="p-2">{(he ? actions : englishActions)[row.kind]}</td><td className="p-2"><span dir="ltr">{row.previousQuantity} → {row.quantity}</span></td><td className="p-2"><span dir="ltr">{row.previousAverageCostUsd?.toLocaleString(undefined, { maximumFractionDigits: 4 }) ?? '—'} → {row.quantity > 0 ? row.averageCostUsd : '—'}</span></td><td className="p-2">{(dates[row.symbol] ?? rowDates(row)).acquiredOn ?? ((dates[row.symbol] ?? rowDates(row)).estimatedAcquiredOn ? `${(dates[row.symbol] ?? rowDates(row)).estimatedAcquiredOn} · ${he ? 'משוער בלבד' : 'Estimated'}` : (he ? 'לא ידוע' : 'Unknown'))}</td></tr>)}</tbody></table></div>
      <p>{review.plan.unchanged.length} {he ? 'החזקות תואמות ללא שינוי. החזקות שלא הופיעו בצילום נשארות בתיק. איפוס יתרה יתבצע רק בשורה עם כמות אפס שאושרה במפורש.' : 'matching holdings. Holdings missing from the screenshot stay in your portfolio. A balance is set to zero only when you approve an explicit zero quantity.'}</p>
      {review.plan.blocked.length > 0 && <div role="alert"><p>{he ? 'אין אפשרות לשמור עד בירור השורות הבאות בצ׳אט:' : 'Review these rows in chat before saving:'}</p><ul>{review.plan.blocked.map(row => <li key={row.symbol}>{row.symbol}: {(he ? reasons : englishReasons)[row.reason]}</li>)}</ul></div>}
      {positiveChanges.length > 0 && <details className="space-y-3 rounded-xl border p-4">
        <summary className="min-h-10 cursor-pointer font-medium">{he ? 'השלמת תאריך רכישה (לא חובה)' : 'Add a purchase date (optional)'}</summary>
        <p className="text-sm text-muted-foreground">{he ? 'לא בטוחים? אפשר לדלג. הערכה תישמר כמשוערת ולא תשמש כתחליף לתאריך אמיתי.' : 'You can skip this. An estimate will be recorded as approximate.'}</p>
        {positiveChanges.map(row => {
          const value = dates[row.symbol] ?? rowDates(row), choice = dateChoices[row.symbol], candidate = candidates[row.symbol];
          const dateLoading = Boolean(loadingDates[row.symbol]);
          const latestDate = candidate?.latestCandidateDate ?? candidate?.candidates?.[0]?.date;
          return <fieldset key={row.symbol} className="space-y-2 border-t py-3">
            <legend className="font-medium">{row.symbol}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={choiceClass} disabled={busy} aria-pressed={choice === 'actual'} onClick={() => setDateChoices(current => ({ ...current, [row.symbol]: 'actual' }))}>{he ? 'תאריך ידוע' : 'Known date'}</button>
              <button type="button" className={choiceClass} disabled={busy} aria-pressed={choice === 'statement'} onClick={() => setDateChoices(current => ({ ...current, [row.symbol]: 'statement' }))}>{he ? 'צילום עסקאות' : 'Trade screenshot'}</button>
              <button type="button" className={choiceClass} disabled={busy || dateLoading} aria-pressed={choice === 'estimate'} onClick={() => void findDate(row.symbol)}>{he ? 'לפי המחיר' : 'Match price'}</button>
              {dateLoading && <span role="status" className="self-center text-xs text-muted-foreground">{he ? 'בודק…' : 'Checking…'}</span>}
            </div>
            {choice === 'actual' && <label className="block space-y-1 text-sm"><span>{he ? 'תאריך הרכישה בפועל של' : 'Actual purchase date for'} {row.symbol}</span><input type="date" className="block rounded border bg-background p-2" min="1900-01-01" max={review.input.observedAt} value={value.acquiredOn ?? ''} disabled={busy} onChange={event => changeDate(row.symbol, { acquiredOn: event.target.value || null, estimatedAcquiredOn: null })} /></label>}
            {choice === 'statement' && <p className="text-sm">{he ? 'העלו בצ׳אט צילום של העסקה עם הסימול והתאריך, ובקשו קישור מעודכן. הסתירו מספר חשבון.' : 'Upload a screenshot of the trade with its symbol and date in chat and request an updated link. Hide the account number.'}</p>}
            {choice === 'estimate' && candidate && <div className="space-y-2 text-sm">
              {candidate.status === 'matched' && latestDate ? <>
                <p><bdi>{latestDate}</bdi>{he ? ' · משוער לפי התאמת מחיר, לא הוכחה לרכישה.' : ' · Estimated from a price match. The purchase date is unverified.'}</p>
                <button type="button" className={choiceClass} disabled={busy} onClick={() => changeDate(row.symbol, { acquiredOn: null, estimatedAcquiredOn: latestDate })}>{he ? 'בחירת תאריך משוער' : 'Use estimated date'}</button>
              </> : <p>{candidate.status === 'unavailable' ? (he ? 'היסטוריית המחיר אינה זמינה כרגע. אפשר להזין תאריך ידוע או להמשיך בלי תאריך.' : 'Price history is unavailable. Enter a known date or continue without one.') : (he ? 'לא נמצאה התאמת מחיר בטווח שנבדק. אפשר להזין תאריך ידוע או להמשיך בלי תאריך.' : 'No matching price was found. Enter a known date or continue without one.')}</p>}
              {candidate.warnings?.length > 0 && <details className="text-muted-foreground"><summary className="cursor-pointer">{he ? 'איך חושבה ההערכה?' : 'How was this estimated?'}</summary>{candidate.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
            </div>}
            {value.estimatedAcquiredOn && <p className="text-sm"><bdi>{value.estimatedAcquiredOn}</bdi>{he ? ' · משוער' : ' · Estimated'}</p>}
          </fieldset>;
        })}
      </details>}
      <section className="space-y-3 rounded-xl border bg-muted/40 p-4"><p>{he ? 'ההיסטוריה נשמרת. נתונים היסטוריים חסרים לא ינוחשו.' : 'Your recorded history is preserved. Missing historical figures will appear as unavailable.'}</p><details><summary className="cursor-pointer text-sm">{he ? 'פרטים נוספים' : 'More details'}</summary><p className="mt-2 text-sm">{he ? 'השינוי נרשם כהתאמת יתרה נפרדת. קניות, מכירות ורווחים מתועדים נשמרים. הכמות, העלות והרווח הפתוח מתעדכנים לפי הצילום. רווח כולל היסטורי, תשואה ומס שאי אפשר לאמת יוצגו כחסרים. מכירות עתידיות יחושבו מבסיס העלות המעודכן.' : 'The update is recorded as a separate balance reconciliation. Recorded buys, sales and gains are preserved. The screenshot updates quantity, cost and open profit. Historical returns and taxes that cannot be verified appear as unavailable. Future sales use the updated cost basis.'}</p></details><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>{he ? 'בדקתי את היתרות והעלות ואני מאשר את הסנכרון.' : 'I reviewed the balances and cost and approve this sync.'}</span></label></section>
      {review.stale && <p role="alert">{he ? 'התיק השתנה מאז הכנת ההצעה. הכינו הצעה חדשה בצ׳אט.' : 'The portfolio changed after this proposal was prepared. Create a new proposal in chat.'}</p>}
      <button className="rounded bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50" disabled={busy || review.stale || !review.plan.canApply || !acknowledged} onClick={() => void send('apply')}>{he ? 'אישור וסנכרון ההחזקות' : 'Confirm and sync holdings'}</button>
    </>}
    <Link href="/positions" className="block underline">{he ? 'חזרה לפוזיציות' : 'Back to positions'}</Link>
  </main>;
}
