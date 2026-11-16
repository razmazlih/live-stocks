'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import type { ScreenshotSyncInput, ScreenshotSyncPlan } from '@/lib/screenshot-sync';
type Review = { input: ScreenshotSyncInput; plan: ScreenshotSyncPlan; stale: boolean; expiresAt: string };
const reasons = { missing_cost: 'חסרה עלות ממוצעת בדולרים', missing_acquisition_date: 'חסר תאריך רכישה מקורי', existing_position_differs: 'קיימת היסטוריה שונה — נדרשים פרטי העסקאות בפועל', invalid_existing_position: 'נתוני ההחזקה הקיימת דורשים בדיקה' };
export default function ScreenshotSyncPage() {
  const token = useRef('');
  const initialized = useRef(false);
  const { user } = useAuth();
  const [review, setReview] = useState<Review | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  async function send(action: 'review' | 'apply') {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/positions/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.current, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'יש להתחבר לחשבון שבו הוכנה ההצעה ולפתוח שוב את הקישור.');
      if (action === 'review') setReview(data); else setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'הסנכרון נכשל'); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (initialized.current) return; initialized.current = true; token.current = window.location.hash.slice(1); window.history.replaceState(null, '', window.location.pathname); if (token.current) void send('review'); else setError('פתחו את קישור ההצעה שקיבלתם בצ׳אט.'); }, []);
  return <main dir="rtl" className="mx-auto max-w-3xl space-y-6 p-6">
    <h1 className="text-2xl font-bold">סקירת סנכרון מצילום מסך</h1>
    <p>מחובר בתור {user.email || user.name || user.id}</p>
    <p>בדקו את החשבון, הסימולים, הכמויות, העלות ותאריכי הרכישה לפני שמירה. התמונה אינה נשמרת ב־LiveStocks.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {busy && <p role="status">בודק את ההצעה…</p>}
    {saved ? <p role="status">ההחזקות נשמרו בהצלחה. <Link href="/positions" className="underline">מעבר לפוזיציות</Link></p> : review && <>
      <p>חשבון: {review.input.location === 'bank_one' ? 'בנק 1' : 'בנק 2'} · צילום נכון ל־{review.input.observedAt}</p>
      <div className="overflow-x-auto"><table className="w-full text-right"><caption className="mb-3 text-right">החזקות חדשות לשמירה</caption><thead><tr><th>סימול</th><th>כמות</th><th>עלות ממוצעת USD</th><th>תאריך רכישה</th></tr></thead><tbody>{review.plan.changes.map(row => <tr key={row.symbol}><td>{row.symbol}</td><td>{row.quantity}</td><td>{row.averageCostUsd}</td><td>{row.acquiredOn}</td></tr>)}</tbody></table></div>
      <p>{review.plan.unchanged.length} החזקות תואמות ללא שינוי. החזקות שלא הופיעו בצילום נשארות בתיק.</p>
      {review.plan.blocked.length > 0 && <div role="alert"><p>אין אפשרות לשמור עד בירור השורות הבאות בצ׳אט:</p><ul>{review.plan.blocked.map(row => <li key={row.symbol}>{row.symbol}: {reasons[row.reason]}</li>)}</ul></div>}
      <p>יתרות חדשות נרשמות כרכישה מקורית אחת, ללא עמלה נוספת. יש לוודא שהעלות כוללת את העמלות הרלוונטיות ושאין עסקאות היסטוריות חסרות.</p>
      {review.stale && <p role="alert">התיק השתנה מאז הכנת ההצעה. הכינו הצעה חדשה בצ׳אט.</p>}
      <button className="rounded bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50" disabled={busy || review.stale || !review.plan.canApply} onClick={() => void send('apply')}>אישור ושמירת ההחזקות</button>
    </>}
    <Link href="/positions" className="block underline">חזרה לפוזיציות</Link>
  </main>;
}
