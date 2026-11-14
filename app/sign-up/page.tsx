import { AuthPage, type AuthPageParams } from '@/components/auth/auth-page';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'הרשמה / Sign up · LiveStocks', robots: { index: false }, referrer: 'no-referrer' };
export default function SignUpPage({ searchParams }: { searchParams: AuthPageParams }) {
  return <AuthPage mode="sign-up" searchParams={searchParams} />;
}
