'use client';

import { useEffect, useState } from 'react';

export const ACCOUNT_MERGE_RECOVERY_PATH = '/api/account/link/recovery';

/** The HttpOnly operation cookie, not the current login or browser storage, authorizes recovery. */
export function AccountMergeRecoveryNotice({ locale }: { locale: 'he' | 'en' }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const lifetime = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || lifetime.signal.aborted) return;
      pending = true;
      try {
        const response = await fetch('/api/account/link/recovery-status', {
          credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: lifetime.signal,
        });
        if (!response.ok) {
          if (!lifetime.signal.aborted && [401, 403, 404].includes(response.status)) setAvailable(false);
          return;
        }
        const status: unknown = await response.json();
        if (!lifetime.signal.aborted) setAvailable(typeof status === 'object' && status !== null
          && 'available' in status && status.available === true && 'recovery' in status && status.recovery === true);
      } catch { /* A failed recovery check must not block ordinary sign-in. */ }
      finally { pending = false; }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { lifetime.abort(); window.removeEventListener('focus', refresh); };
  }, []);
  if (!available) return null;
  const he = locale === 'he';
  return <aside className="space-y-2 rounded-xl border border-border p-4 text-sm leading-6">
    <p>{he ? 'קיים בדפדפן זה תהליך איחוד שמור. אפשר לבדוק את מצבו ולהמשיך אותו גם ללא התחברות.' : 'This browser has a saved account merge. You can check its status and continue even while signed out.'}</p>
    <a className="font-medium underline underline-offset-4" href={ACCOUNT_MERGE_RECOVERY_PATH}>{he ? 'המשך איחוד חשבונות שמור' : 'Recover a saved account merge'}</a>
  </aside>;
}
