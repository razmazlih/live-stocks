'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

const TRANSITION_NAME = 'stock-detail-surface';
const MAX_WAIT_MS = 1200;
type Transition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void>; skipTransition(): void };
type TransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => Transition };
type Pending = { path: string; from: string; release(): void; skip(): void };
export type StockNavigationPreview = { symbol: string; display: string; imageUrl?: string | null };
type Navigation = { navigate(href: string, source: HTMLElement | null, preview?: StockNavigationPreview): boolean; ready(path: string): void; pendingPath: string | null; preview: StockNavigationPreview | null };
const Context = createContext<Navigation | null>(null);

/** Link navigation remains ordinary Next navigation without native transition support. */
export function StockNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<Pending | null>(null);
  const [preview, setPreview] = useState<StockNavigationPreview | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const ready = useCallback((path: string) => {
    if (pending.current?.path === path) pending.current.release();
  }, []);

  const navigate = useCallback((href: string, source: HTMLElement | null, identity?: StockNavigationPreview) => {
    const doc = document as TransitionDocument;
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (pending.current) return true;
    const path = new URL(href, window.location.origin).pathname;
    let release!: () => void;
    const committed = new Promise<void>(resolve => { release = resolve; });
    const oldName = source?.style.viewTransitionName ?? '';
    if (source) source.style.viewTransitionName = TRANSITION_NAME;
    document.documentElement.dataset.stockNavigation = 'forward';
    setPreview(identity ?? null);
    setPendingPath(path);
    let transition: Transition;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      if (source) source.style.viewTransitionName = oldName;
      delete document.documentElement.dataset.stockNavigation;
      pending.current = null;
      setPendingPath(null);
    };
    try {
      transition = doc.startViewTransition(async () => {
        router.push(href);
        await committed;
        // Readiness fires in a layout effect: the hero is committed already.
        // Avoid frame waits here: background tabs can throttle them for seconds.
        if (window.location.pathname === path) window.scrollTo({ top: 0, behavior: 'instant' });
      });
    } catch {
      cleanup();
      return false;
    }
    const skip = () => { transition.skipTransition(); release(); };
    pending.current = { path, from: window.location.pathname, release, skip };
    timer = setTimeout(skip, MAX_WAIT_MS);
    // A skipped/unsupported snapshot must never turn into an unhandled rejection.
    void transition.ready.catch(() => {});
    void transition.updateCallbackDone.catch(() => {});
    void transition.finished.then(cleanup, cleanup);
    return true;
  }, [router]);

  useEffect(() => {
    const navigation = pending.current;
    if (navigation && pathname !== navigation.from && pathname !== navigation.path) navigation.skip();
  }, [pathname]);
  useEffect(() => () => pending.current?.skip(), []);

  return <Context.Provider value={{ navigate, ready, pendingPath, preview }}>{children}</Context.Provider>;
}

/** Signal on success, empty and error states so navigation never depends on a successful API call. */
export function useStockNavigationReady(ready: boolean) {
  const navigation = useContext(Context);
  const signal = navigation?.ready;
  useLayoutEffect(() => {
    if (ready) signal?.(window.location.pathname);
  }, [ready, signal]);
}

export function useStockNavigationPreview(symbol: string) {
  const preview = useContext(Context)?.preview;
  return preview?.symbol.toUpperCase() === symbol.toUpperCase() ? preview : null;
}

export function StockDetailsLink({ href, preview, onClick, className, children, ...props }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string; preview?: StockNavigationPreview }) {
  const navigation = useContext(Context);
  const anchor = useRef<HTMLAnchorElement>(null);
  const isPending = navigation?.pendingPath === new URL(href, 'https://livestocks.local').pathname;
  return <Link {...props} ref={anchor} href={href} className={className} aria-busy={isPending || undefined}
    onClick={onClick}
    onNavigate={event => {
      // onNavigate excludes modified clicks, downloads and external navigation.
      if (navigation?.navigate(href, anchor.current?.closest('article') ?? null, preview)) event.preventDefault();
    }}>
    {children}
  </Link>;
}
