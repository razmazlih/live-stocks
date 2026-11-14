import { AuthPage, type AuthPageParams } from '@/components/auth/auth-page';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'סיסמה חדשה / New password · LiveStocks', robots: { index: false }, referrer: 'no-referrer' };
export default function ResetPasswordPage({ searchParams }: { searchParams: AuthPageParams }) {
  return <AuthPage mode="reset-password" searchParams={searchParams} />;
}
