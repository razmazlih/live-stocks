import { SignIn } from '@/components/auth/sign-in';
import { isAuth0Configured } from '@/lib/auth/auth0';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const { returnTo, error } = await searchParams;
  return <SignIn configured={isAuth0Configured()} returnTo={returnTo} callbackFailed={error === 'sign-in-failed'} />;
}
