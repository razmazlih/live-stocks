import { getAuthPublicOptions } from '@/lib/auth/better-auth-config';
import type { AuthScreenMode } from '@/types/auth';
import { SignIn } from './sign-in';

export type AuthPageParams = Promise<Record<string, string | string[] | undefined>>;

export async function AuthPage({ mode, searchParams }: { mode: AuthScreenMode; searchParams: AuthPageParams }) {
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined;
  const token = text('token');
  return <SignIn key={mode} {...getAuthPublicOptions()} mode={mode} initialLocale={text('lang') === 'en' ? 'en' : 'he'}
    returnTo={text('returnTo')} callbackFailed={mode === 'sign-in' && Boolean(text('error'))}
    verificationReturned={text('verified') === '1'} resetToken={token && token.length <= 1024 ? token : undefined}
    resetLinkInvalid={mode === 'reset-password' && Boolean(text('error'))} />;
}
