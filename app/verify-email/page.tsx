import { AuthPage, type AuthPageParams } from '@/components/auth/auth-page';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'אימות דוא״ל / Verify email · LiveStocks', robots: { index: false }, referrer: 'no-referrer' };
export default function VerifyEmailPage({ searchParams }: { searchParams: AuthPageParams }) {
  return <AuthPage mode="verify-email" searchParams={searchParams} />;
}
