'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import type { ScreenshotSyncInput, ScreenshotSyncPlan } from '@/lib/screenshot-sync';

type Review = { input: ScreenshotSyncInput; plan: ScreenshotSyncPlan; stale: boolean; expiresAt: string };
type DateDraft = { acquiredOn: string | null; estimatedAcquiredOn: string | null };
type DateCandidateResult = { status: 'matched' | 'no_match' | 'unavailable'; latestCandidateDate?: string | null; candidates: { date: string; closeUsd: number }[]; warnings: string[]; estimated: true; canVerifyAcquisition: false };
type DateChoice = 'actual' | 'statement' | 'estimate';
const reasons = { missing_cost: 'חסרה עלות ממוצעת בדולרים', observation_precedes_recorded_events: 'הצילום ישן יותר מעסקאות שכבר נרשמו — נדרש צילום עדכני', invalid_existing_position: 'נתוני ההחזקה הקיימת דורשים בדיקה' };
const actions = { add: 'החזקה חדשה', reconcile: 'עדכון יתרה', close: 'איפוס יתרה' };
const choiceClass = 'min-h-10 rounded-lg border px-3 py-2 text-sm disabled:opacity-50';
function rowDates(row: { acquiredOn: string | null; estimatedAcquiredOn?: string | null }): DateDraft {
  return { acquiredOn: row.acquiredOn, estimatedAcquiredOn: row.estimatedAcquiredOn ?? null };
}

async function request(token: string, action: 'review' | 'apply' | 'date_candidates', extra: Record<string, unknown> = {}) {
    const response = await fetch('/api/positions/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, ...extra }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'יש להתחבר לחשבון שבו הוכנה ההצעה ולפתוח שוב את הקישור.');
    return data;
  }

export default function ScreenshotSyncPage() {
  const token = useRef('');
  const initialized = useRef(false);
  const generation = useRef(0);
  const { user } = useAuth();
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
      const data = await request(activeToken, action, action === 'apply' ? { acknowledgeIncompleteHistory: true, ...(datesDirty ? { dates: Object.entries(dates).map(([symbol, value]) => ({ symbol, ...value })) } : {}) } : {});
      if (!isCurrent()) return;
      if (action === 'review') acceptReview(data); else setSaved(true);
    } catch (failure) { if (isCurrent()) setError(failure instanceof Error ? failure.message : 'הסנכרון נכשל'); }
    finally { if (isCurrent()) setBusy(false); }
  }
  async function findDate(symbol: string) {
    const activeToken = token.current, activeGeneration = generation.current;
    const isCurrent = () => token.current === activeToken && generation.current === activeGeneration;
    setDateChoices(current => ({ ...current, [symbol]: 'estimate' }));
    setLoadingDates(current => ({ ...current, [symbol]: true })); setError('');
    setCandidates(current => { const next = { ...current }; delete next[symbol]; return next; });
    try {
      const data = await request(activeToken, 'date_candidates', { symbol });
      if (isCurrent()) setCandidates(current => ({ ...current, [symbol]: data }));
    } catch (failure) { if (isCurrent()) setError(failure instanceof Error ? failure.message : 'לא ניתן לבדוק כרגע את היסטוריית המחיר.'); }
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
      void request(nextToken, 'review')
        .then(value => { if (isCurrent()) acceptReview(value); })
        .catch(failure => { if (isCurrent()) setError(failure instanceof Error ? failure.message : 'הסנכרון נכשל'); })
        .finally(() => { if (isCurrent()) setBusy(false); });
    };
    // Reattach on Strict Mode replay while keeping its initial request singular.
    window.addEventListener('hashchange', loadFragment);
    if (!initialized.current) {
      initialized.current = true;
      if (window.location.hash.slice(1)) loadFragment();
      else setError('פתחו את קישור ההצעה שקיבלתם בצ׳אט.');
    }
    return () => window.removeEventListener('hashchange', loadFragment);
  }, [acceptReview]);
  const positiveChanges = review?.plan.changes.filter(row => row.quantity > 0 && !row.acquiredOn) ?? [];
  const datesDirty = positiveChanges.some(row => {
    const original = rowDates(row), draft = dates[row.symbol];
    return draft && (draft.acquiredOn !== original.acquiredOn || draft.estimatedAcquiredOn !== original.estimatedAcquiredOn);
  });

  return <main dir="rtl" className="mx-auto max-w-5xl space-y-6 p-6">
    <h1 className="text-2xl font-bold">סקירת סנכרון מצילום מסך</h1>
    <p>מחובר בתור {user.email || user.name || user.id}</p>
    <p>בדקו את החשבון, הסימולים, הכמויות והעלות לפני שמירה. התמונה אינה נשמרת ב־LiveStocks.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {busy && <p role="status">בודק את ההצעה…</p>}
    {saved ? <p role="status">ההחזקות סונכרנו בהצלחה והיסטוריית העסקאות נשמרה. <Link href="/positions" className="underline">מעבר לפוזיציות</Link></p> : review && <>
      <p>חשבון: {review.input.location === 'bank_one' ? 'בנק 1' : 'בנק 2'} · מצב ההחזקות נכון ל־{review.input.observedAt}</p>
      <div className="overflow-x-auto rounded-xl border p-3"><table className="w-full text-right"><caption className="mb-3 text-right font-semibold">השינויים המוצעים</caption><thead><tr><th className="p-2">סימול</th><th className="p-2">פעולה</th><th className="p-2">כמות לפני ← אחרי</th><th className="p-2">עלות ממוצעת USD לפני ← אחרי</th><th className="p-2">תאריך רכישה</th></tr></thead><tbody>{review.plan.changes.map(row => <tr key={row.symbol} className="border-t"><td className="p-2">{row.symbol}</td><td className="p-2">{actions[row.kind]}</td><td className="p-2"><span dir="ltr">{row.previousQuantity} → {row.quantity}</span></td><td className="p-2"><span dir="ltr">{row.previousAverageCostUsd?.toLocaleString(undefined, { maximumFractionDigits: 4 }) ?? '—'} → {row.quantity > 0 ? row.averageCostUsd : '—'}</span></td><td className="p-2">{(dates[row.symbol] ?? rowDates(row)).acquiredOn ?? ((dates[row.symbol] ?? rowDates(row)).estimatedAcquiredOn ? `${(dates[row.symbol] ?? rowDates(row)).estimatedAcquiredOn} · משוער בלבד` : 'לא ידוע')}</td></tr>)}</tbody></table></div>
      <p>{review.plan.unchanged.length} החזקות תואמות ללא שינוי. החזקות שלא הופיעו בצילום נשארות בתיק. איפוס יתרה יתבצע רק בשורה עם כמות אפס שאושרה במפורש.</p>
      {review.plan.blocked.length > 0 && <div role="alert"><p>אין אפשרות לשמור עד בירור השורות הבאות בצ׳אט:</p><ul>{review.plan.blocked.map(row => <li key={row.symbol}>{row.symbol}: {reasons[row.reason]}</li>)}</ul></div>}
      {positiveChanges.length > 0 && <details className="space-y-3 rounded-xl border p-4">
        <summary className="min-h-10 cursor-pointer font-medium">השלמת תאריך רכישה (לא חובה)</summary>
        <p className="text-sm text-muted-foreground">לא בטוחים? אפשר לדלג. הערכה תישמר כמשוערת ולא תשמש כתחליף לתאריך אמיתי.</p>
        {positiveChanges.map(row => {
          const value = dates[row.symbol] ?? rowDates(row), choice = dateChoices[row.symbol], candidate = candidates[row.symbol];
          const dateLoading = Boolean(loadingDates[row.symbol]);
          const latestDate = candidate?.latestCandidateDate ?? candidate?.candidates?.[0]?.date;
          return <fieldset key={row.symbol} className="space-y-2 border-t py-3">
            <legend className="font-medium">{row.symbol}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={choiceClass} disabled={busy} aria-pressed={choice === 'actual'} onClick={() => setDateChoices(current => ({ ...current, [row.symbol]: 'actual' }))}>תאריך ידוע</button>
              <button type="button" className={choiceClass} disabled={busy} aria-pressed={choice === 'statement'} onClick={() => setDateChoices(current => ({ ...current, [row.symbol]: 'statement' }))}>צילום עסקאות</button>
              <button type="button" className={choiceClass} disabled={busy || dateLoading} aria-pressed={choice === 'estimate'} onClick={() => void findDate(row.symbol)}>לפי המחיר</button>
              {dateLoading && <span role="status" className="self-center text-xs text-muted-foreground">בודק…</span>}
            </div>
            {choice === 'actual' && <label className="block space-y-1 text-sm"><span>תאריך הרכישה בפועל של {row.symbol}</span><input type="date" className="block rounded border bg-background p-2" min="1900-01-01" max={review.input.observedAt} value={value.acquiredOn ?? ''} disabled={busy} onChange={event => changeDate(row.symbol, { acquiredOn: event.target.value || null, estimatedAcquiredOn: null })} /></label>}
            {choice === 'statement' && <p className="text-sm">העלו בצ׳אט צילום של העסקה עם הסימול והתאריך, ובקשו קישור מעודכן. הסתירו מספר חשבון.</p>}
            {choice === 'estimate' && candidate && <div className="space-y-2 text-sm">
              {candidate.status === 'matched' && latestDate ? <>
                <p><bdi>{latestDate}</bdi> · משוער לפי התאמת מחיר, לא הוכחה לרכישה.</p>
                <button type="button" className={choiceClass} disabled={busy} onClick={() => changeDate(row.symbol, { acquiredOn: null, estimatedAcquiredOn: latestDate })}>בחירת תאריך משוער</button>
              </> : <p>{candidate.status === 'unavailable' ? 'היסטוריית המחיר אינה זמינה כרגע. אפשר להזין תאריך ידוע או להמשיך בלי תאריך.' : 'לא נמצאה התאמת מחיר בטווח שנבדק. אפשר להזין תאריך ידוע או להמשיך בלי תאריך.'}</p>}
              {candidate.warnings?.length > 0 && <details className="text-muted-foreground"><summary className="cursor-pointer">איך חושבה ההערכה?</summary>{candidate.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
            </div>}
            {value.estimatedAcquiredOn && <p className="text-sm"><bdi>{value.estimatedAcquiredOn}</bdi> · משוער</p>}
          </fieldset>;
        })}
      </details>}
      <section className="space-y-3 rounded-xl border bg-muted/40 p-4"><p>ההיסטוריה נשמרת. נתונים היסטוריים חסרים לא ינוחשו.</p><details><summary className="cursor-pointer text-sm">פרטים נוספים</summary><p className="mt-2 text-sm">השינוי נרשם כהתאמת יתרה נפרדת. קניות, מכירות ורווחים מתועדים נשמרים. הכמות, העלות והרווח הפתוח מתעדכנים לפי הצילום. רווח כולל היסטורי, תשואה ומס שאי אפשר לאמת יוצגו כחסרים. מכירות עתידיות יחושבו מבסיס העלות המעודכן.</p></details><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>בדקתי את היתרות והעלות ואני מאשר את הסנכרון.</span></label></section>
      {review.stale && <p role="alert">התיק השתנה מאז הכנת ההצעה. הכינו הצעה חדשה בצ׳אט.</p>}
      <button className="rounded bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50" disabled={busy || review.stale || !review.plan.canApply || !acknowledged} onClick={() => void send('apply')}>אישור וסנכרון ההחזקות</button>
    </>}
    <Link href="/positions" className="block underline">חזרה לפוזיציות</Link>
  </main>;
}
