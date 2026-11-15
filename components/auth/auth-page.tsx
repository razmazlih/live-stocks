import { redirect } from 'next/navigation';
import { getAuthPublicOptions } from '@/lib/auth/better-auth-config';
import type { AuthScreenMode } from '@/types/auth';
import { SignIn } from './sign-in';
import { signedOAuthQuery } from '@/lib/auth/oauth-continuation';

export type AuthPageParams = Promise<Record<string, string | string[] | undefined>>;

export async function AuthPage({ mode, searchParams }: { mode: AuthScreenMode; searchParams: AuthPageParams }) {
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined;
  const token = text('token');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  const options = getAuthPublicOptions();
  if (!options.passwordEnabled && mode !== 'sign-in') {
    const destination = new URLSearchParams(signedOAuthQuery(query) ?? '');
    if (!destination.has('sig')) { if (text('returnTo')) destination.set('returnTo', text('returnTo')!); if (text('lang')) destination.set('lang', text('lang')!); }
    redirect(`/sign-in?${destination}`);
  }
  return <SignIn key={mode} {...options} mode={mode} initialLocale={(text('ui_lang') ?? text('lang')) === 'en' ? 'en' : 'he'}
    oauthQuery={signedOAuthQuery(query)}
    returnTo={text('returnTo')} callbackFailed={mode === 'sign-in' && Boolean(text('error'))}
    verificationReturned={text('verified') === '1'} resetToken={token && token.length <= 1024 ? token : undefined}
    resetLinkInvalid={mode === 'reset-password' && Boolean(text('error'))} />;
}
