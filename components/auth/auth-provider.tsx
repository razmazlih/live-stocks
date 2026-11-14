'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/lib/context';
import { configureSupabaseUser, resetSupabaseClient } from '@/lib/supabase';
import { StockNavigationProvider } from '@/components/portfolio/stock-navigation';
import { SignIn } from './sign-in';
import { isPublicAuthPath, isPublicInformationPath } from '@/lib/public-routes';
import { authClient } from '@/lib/auth/better-auth-client';
import { authNavigation, clearBrowserAccount } from '@/lib/auth/browser-session';
import { Button } from '@/components/ui/button';
import type { AuthPublicOptions } from '@/types/auth';

export type AccountUser = { id: string; email?: string; name?: string; emailVerified: boolean };
type AccountSession = { user: AccountUser | null; configured: boolean; options?: AuthPublicOptions };
const AuthContext = createContext<{ user: AccountUser; signOut: () => void } | null>(null);
const ACCOUNT_EVENT = 'livestocks:account-change';

const DEFAULT_OPTIONS: AuthPublicOptions = { configured: true, googleEnabled: false, emailDeliveryConfigured: false };

export function AuthProvider({ children, options = DEFAULT_OPTIONS }: { children: ReactNode; options?: AuthPublicOptions }) {
  const pathname = usePathname();
  if (isPublicInformationPath(pathname)) return <>{children}</>;
  return <PrivateAuthProvider options={options}>{children}</PrivateAuthProvider>;
}

function PrivateAuthProvider({ children, options }: { children: ReactNode; options: AuthPublicOptions }) {
  const pathname = usePathname();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [error, setError] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [generation, setGeneration] = useState(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const signingOut = useRef(false);
  const [signOutState, setSignOutState] = useState<'idle' | 'pending' | 'failed'>('idle');

  const revalidate = useCallback(async () => {
    if (signingOut.current) return;
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    resetSupabaseClient();
    setSession(null);
    setError(false);
    setVerificationRequired(false);
    try {
      const response = await fetch('/api/account/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (response.status === 401) {
        if (!controller.signal.aborted) setSession({ user: null, configured: true });
        return;
      }
      if (response.status === 403) {
        const failure = await response.json();
        if (failure.error === 'Verify your email before continuing') {
          if (!controller.signal.aborted) {
            setVerificationRequired(true);
            setSession({ user: null, configured: true });
          }
          return;
        }
      }
      if (!response.ok) throw new Error('Session verification failed');
      const value = await response.json() as AccountSession;
      if (controller.signal.aborted) return;
      if (typeof value.configured !== 'boolean' || (value.user && !value.user.id)) throw new Error('Invalid session response');
      configureSupabaseUser(value.user?.id ?? null);
      setGeneration((current) => current + 1);
      setSession(value);
    } catch {
      if (!controller.signal.aborted) {
        setError(true);
        setSession({ user: null, configured: true });
      }
    }
  }, []);

  useEffect(() => {
    void revalidate().then(() => {
      // Notify other tabs once on mount (including a completed login redirect).
      try { localStorage.setItem(ACCOUNT_EVENT, `session:${Date.now()}`); } catch { /* Storage may be disabled. */ }
    });
    const refresh = () => { void revalidate(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCOUNT_EVENT) return;
      if (event.newValue?.startsWith('logout:')) {
        pendingRequest.current?.abort();
        resetSupabaseClient();
        setSession({ user: null, configured: true });
      } else refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('livestocks:session-invalid', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      pendingRequest.current?.abort();
      resetSupabaseClient();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('livestocks:session-invalid', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [revalidate]);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    setSignOutState('pending');
    pendingRequest.current?.abort();
    clearBrowserAccount('logout');
    setSession({ user: null, configured: true });
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      authNavigation.assign('/sign-in');
    } catch { setSignOutState('failed'); }
  }, []);

  if (signOutState !== 'idle') return <main className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] p-5 text-foreground"><section className="max-w-md space-y-4 rounded-3xl border border-border bg-card p-7 text-card-foreground"><p role={signOutState === 'failed' ? 'alert' : 'status'}>{signOutState === 'failed' ? 'ההתנתקות לא הושלמה. יש לנסות שוב. / Sign-out did not complete. Please retry.' : 'מתנתק… / Signing out…'}</p>{signOutState === 'failed' && <Button onClick={() => { void signOut(); }}>ניסיון התנתקות נוסף / Retry sign-out</Button>}</section></main>;
  // Public auth forms remain usable during session checks; private providers never mount here.
  if (isPublicAuthPath(pathname)) return <>{children}</>;
  if (!session) return <main className="flex min-h-screen items-center justify-center"><p role="status">LiveStocks · טוען / Loading…</p></main>;
  if (!session.user) return <SignIn {...(session.options ?? options)} configured={session.configured} error={error} verificationRequired={verificationRequired} returnTo={pathname} />;
  return <AuthContext.Provider value={{ user: session.user, signOut }}>
    <AppProvider key={`${session.user.id}:${generation}`}>
      <StockNavigationProvider>{children}</StockNavigationProvider>
    </AppProvider>
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('A signed-in account is required.');
  return value;
}
