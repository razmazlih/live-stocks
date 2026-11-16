import { AuthPage, type AuthPageParams } from '@/components/auth/auth-page';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'כניסה / Sign in · LiveStocks', robots: { index: false }, referrer: 'no-referrer' };

export default function SignInPage({ searchParams }: { searchParams: AuthPageParams }) {
  return <AuthPage mode="sign-in" searchParams={searchParams} />;
}
