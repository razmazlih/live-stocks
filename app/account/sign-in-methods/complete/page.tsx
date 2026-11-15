import { isPasswordAuthEnabled } from '@/lib/auth/better-auth-config';
import { redirect } from 'next/navigation';
import { SignInMethodsReturn } from '@/components/auth/sign-in-methods';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'LiveStocks · Sign-in methods', robots: { index: false }, referrer: 'no-referrer' as const };
export default async function MethodCompletePage({ searchParams }: { searchParams: Promise<{ failed?: string; error?: string }> }) {
  if (!isPasswordAuthEnabled()) redirect('/settings');
  const params = await searchParams;
  return <SignInMethodsReturn failed={Boolean(params.failed || params.error)} />;
}
