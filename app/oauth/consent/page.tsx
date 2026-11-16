import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OAuthConsent } from '@/components/auth/oauth-consent';
import { ConsentError, getConsentReview } from '@/lib/auth/oauth-consent';
import type { AuthPageParams } from '@/components/auth/auth-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'LiveStocks · Connection consent', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function ConsentPage({ searchParams }: { searchParams: AuthPageParams }) {
  const params = await searchParams, query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  let review = null;
  try { review = await getConsentReview(query.toString(), new Headers(await headers())); }
  catch (error) {
    if (error instanceof ConsentError && error.code === 'SIGN_IN_REQUIRED') {
      redirect(`/sign-in?returnTo=${encodeURIComponent(`/oauth/consent?${query}`)}`);
    }
  }
  return <OAuthConsent review={review} initialLocale={params.ui_lang === 'en' ? 'en' : 'he'} />;
}
