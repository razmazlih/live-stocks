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
import { DEMO_USER_ID } from '@/lib/demo/data';
import { Button } from '@/components/ui/button';
import type { AuthPublicOptions } from '@/types/auth';

export type AccountUser = { id: string; email?: string; name?: string; emailVerified: boolean };
type AccountSession = { user: AccountUser | null; configured: boolean; options?: AuthPublicOptions };
const AuthContext = createContext<{ user: AccountUser; signOut: () => void } | null>(null);
const ACCOUNT_EVENT = 'livestocks:account-change';

const DEFAULT_OPTIONS: AuthPublicOptions = { configured: true, passwordEnabled: false, googleEnabled: false, emailDeliveryConfigured: false };

export function AuthProvider({ children, options = DEFAULT_OPTIONS }: { children: ReactNode; options?: AuthPublicOptions }) {
  const pathname = usePathname();
  if (pathname === '/account/owner-confirmation') return <OwnerConfirmationBoundary>{children}</OwnerConfirmationBoundary>;
  if (isPublicInformationPath(pathname)) return <>{children}</>;
  return <PrivateAuthProvider options={options}>{children}</PrivateAuthProvider>;
}

/** The capture page checks its own server session without financial-profile bootstrap. */
function OwnerConfirmationBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    resetSupabaseClient();
    return () => resetSupabaseClient();
  }, []);
  return <>{children}</>;
}

function PrivateAuthProvider({ children, options }: { children: ReactNode; options: AuthPublicOptions }) {
  const pathname = usePathname();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [error, setError] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [generation, setGeneration] = useState(0);
  const currentSession = useRef<AccountSession | null>(null);
  const pendingRequest = useRef<AbortController | null>(null);
  const signingOut = useRef(false);
  const demoSignOutPending = useRef(false);
  const [signOutState, setSignOutState] = useState<'idle' | 'pending' | 'failed'>('idle');

  const acceptSession = useCallback((value: AccountSession) => {
    if (currentSession.current?.user?.id !== value.user?.id) {
      // Only an actual account boundary may discard private state and requests.
      if (!value.user) resetSupabaseClient();
      setGeneration((current) => current + 1);
    }
    configureSupabaseUser(value.user?.id ?? null);
    currentSession.current = value;
    setSession(value);
  }, []);

  const revalidate = useCallback(async (replacePending = false) => {
    if (signingOut.current) return;
    // A tab becoming visible commonly emits focus too. Share the in-flight check.
    if (pendingRequest.current && !replacePending) return;
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    const isCurrent = () => !controller.signal.aborted && pendingRequest.current === controller;
    try {
      const response = await fetch('/api/account/session', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (response.status === 401) {
        if (isCurrent()) {
          setError(false);
          setVerificationRequired(false);
          acceptSession({ user: null, configured: true });
        }
        return;
      }
      if (response.status === 403) {
        const failure = await response.json();
        if (failure.error === 'Verify your email before continuing') {
          if (isCurrent()) {
            setError(false);
            setVerificationRequired(true);
            acceptSession({ user: null, configured: true });
          }
          return;
        }
      }
      if (!response.ok) throw new Error('Session verification failed');
      const value = await response.json() as AccountSession;
      if (!isCurrent()) return;
      if (typeof value.configured !== 'boolean' || (value.user && !value.user.id)) throw new Error('Invalid session response');
      setError(false);
      setVerificationRequired(false);
      acceptSession(value);
    } catch {
      // An outage is not proof of logout. Existing server-side authorization still applies.
      if (isCurrent() && !currentSession.current?.user) {
        setError(true);
        acceptSession({ user: null, configured: true });
      }
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }, [acceptSession]);

  useEffect(() => {
    resetSupabaseClient();
    void revalidate().then(() => {
      // Notify other tabs once on mount (including a completed login redirect).
      try { localStorage.setItem(ACCOUNT_EVENT, `session:${Date.now()}`); } catch { /* Storage may be disabled. */ }
    });
    const refresh = () => { void revalidate(); };
    const refreshInvalidSession = () => { void revalidate(true); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCOUNT_EVENT) return;
      if (event.newValue?.startsWith('logout:')) {
        pendingRequest.current?.abort();
        pendingRequest.current = null;
        resetSupabaseClient();
        acceptSession({ user: null, configured: true });
      } else refreshInvalidSession();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('livestocks:session-invalid', refreshInvalidSession);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      pendingRequest.current?.abort();
      pendingRequest.current = null;
      resetSupabaseClient();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('livestocks:session-invalid', refreshInvalidSession);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [revalidate, acceptSession]);

  const signOut = useCallback(async () => {
    const isDemo = demoSignOutPending.current || currentSession.current?.user?.id === DEMO_USER_ID;
    demoSignOutPending.current = isDemo;
    signingOut.current = true;
    setSignOutState('pending');
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    clearBrowserAccount('logout');
    acceptSession({ user: null, configured: true });
    try {
      if (process.env.NODE_ENV === 'development' && isDemo) {
        const response = await fetch('/api/local-demo', { method: 'DELETE', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Demo sign-out failed');
        authNavigation.assign('/sign-in');
        return;
      }
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      authNavigation.assign('/sign-in');
    } catch { setSignOutState('failed'); }
  }, [acceptSession]);

  if (signOutState !== 'idle') return <main className="flex min-h-screen items-center justify-center bg-[var(--color-page-bg)] p-5 text-foreground"><section className="max-w-md space-y-4 rounded-3xl border border-border bg-card p-7 text-card-foreground"><p role={signOutState === 'failed' ? 'alert' : 'status'}>{signOutState === 'failed' ? 'ההתנתקות לא הושלמה. יש לנסות שוב. / Sign-out did not complete. Please retry.' : 'מתנתק… / Signing out…'}</p>{signOutState === 'failed' && <Button onClick={() => { void signOut(); }}>ניסיון התנתקות נוסף / Retry sign-out</Button>}</section></main>;
  // Public auth forms remain usable during session checks; private providers never mount here.
  if (isPublicAuthPath(pathname) || pathname === '/oauth/consent' || pathname === '/account/sign-in-methods/complete' || pathname === '/account/owner-confirmation') return <>{children}</>;
  if (!session) return <main className="flex min-h-screen items-center justify-center"><p role="status">LiveStocks · טוען / Loading…</p></main>;
  if (!session.user) return <SignIn {...(session.options ?? options)} configured={session.configured} error={error} verificationRequired={verificationRequired} returnTo={pathname} />;
  return <AuthContext.Provider value={{ user: session.user, signOut }}>
    <AppProvider key={`${session.user.id}:${generation}`}>
      {session.user.id === DEMO_USER_ID && <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-4 bg-amber-100 px-4 py-2 text-sm text-amber-950" dir="rtl"><span>חשבון דמו · נתונים סינתטיים להמחשה בלבד · תצוגה בלבד</span><button type="button" className="underline" onClick={() => { void signOut(); }}>יציאה מהדמו</button></div>}
      <StockNavigationProvider>{children}</StockNavigationProvider>
    </AppProvider>
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('A signed-in account is required.');
  return value;
}
