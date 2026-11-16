import { AuthPage, type AuthPageParams } from '@/components/auth/auth-page';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'איפוס סיסמה / Password reset · LiveStocks', robots: { index: false }, referrer: 'no-referrer' };
export default function ForgotPasswordPage({ searchParams }: { searchParams: AuthPageParams }) {
  return <AuthPage mode="forgot-password" searchParams={searchParams} />;
}
