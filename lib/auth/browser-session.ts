'use client';

import { resetSupabaseClient } from '@/lib/supabase';
import { safeSignInReturnTo } from './return-to';

export const authNavigation = { assign: (destination: string) => window.location.assign(destination) };

export function clearBrowserAccount(event: 'session' | 'logout'): void {
  resetSupabaseClient();
  try { localStorage.setItem('livestocks:account-change', `${event}:${Date.now()}`); } catch { /* Disabled storage cannot prevent clearing memory. */ }
}

export function finishEmailSignIn(returnTo: string): void {
  clearBrowserAccount('session');
  authNavigation.assign(safeSignInReturnTo(returnTo));
}
