import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ownerConfirmationConfiguration, ownerConfirmationView } from '@/lib/auth/owner-confirmation';
import { OwnerConfirmation } from '@/components/auth/owner-confirmation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'LiveStocks · אישור חשבון להעברה', robots: { index: false }, referrer: 'no-referrer' as const };
export default async function OwnerConfirmationPage() {
  try { ownerConfirmationConfiguration(); } catch { notFound(); }
  let view;
  try { view = await ownerConfirmationView(new Headers(await headers())); } catch { /* No financial data is loaded on an invalid capture session. */ }
  if (!view) return <main dir="rtl" className="p-8"><h1>לא ניתן לאשר את החשבון</h1><p>נדרשת כניסת Google טרייה של חשבון הבעלים. הנתונים לא הועברו.</p><a href="/sign-in?returnTo=%2Faccount%2Fowner-confirmation">חזרה לכניסה</a></main>;
  return <OwnerConfirmation {...view} />;
}
