'use client';

import { createContext, useCallback, useContext, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useApp } from '@/lib/context';
import styles from './stock-inspector.module.css';

export interface InspectorStock {
  symbol: string;
  source?: string;
  side?: 'BUY' | 'SELL';
}

type OpenInspector = (stock: InspectorStock, trigger: HTMLElement) => void;
const Context = createContext<OpenInspector | null>(null);
export const useStockInspector = () => useContext(Context);

export function inspectLink(event: MouseEvent<HTMLAnchorElement>, inspect: OpenInspector | null, stock: InspectorStock) {
  if (!inspect || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  event.preventDefault();
  inspect(stock, event.currentTarget);
  return true;
}

const StockDetail = dynamic(() => import('@/app/stock/[symbol]/stock-detail-view').then(module => module.StockDetailView));

const desktopQuery = '(min-width: 768px)';
const desktopSnapshot = () => window.matchMedia?.(desktopQuery).matches ?? false;
function subscribeLayout(notify: () => void) {
  const media = window.matchMedia?.(desktopQuery);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
}

export function StockInspectorProvider({ children }: { children: ReactNode }) {
  const { locale } = useApp();
  const he = locale === 'he';
  const desktop = useSyncExternalStore(subscribeLayout, desktopSnapshot, () => false);
  const [stock, setStock] = useState<(InspectorStock & { requestId: number }) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dragStart = useRef<number | null>(null);
  const saving = useRef(false);
  const dragged = useRef(false);
  const open = useCallback<OpenInspector>((request, trigger) => {
    if (saving.current) return;
    triggerRef.current = trigger;
    setExpanded(Boolean(request.side));
    setStock(previous => ({ ...request, requestId: (previous?.requestId ?? 0) + 1 }));
  }, []);
  return <Context.Provider value={open}>
    {children}
    <Dialog modal={!desktop} open={Boolean(stock)} onOpenChange={next => { if (!next && !saving.current) setStock(null); }}>
      {stock && <DialogContent dir={he ? 'rtl' : 'ltr'} aria-describedby={undefined}
        className={styles.panel} data-expanded={expanded} closeLabel={he ? 'סגירת פרטי המניה' : 'Close stock details'}
        onInteractOutside={event => { if (desktop) event.preventDefault(); }}
        onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const trigger = triggerRef.current;
          if (trigger?.isConnected) trigger.focus({ preventScroll: true });
          else {
            const heading = document.querySelector<HTMLElement>('.app-canvas h1');
            if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
          }
        }}>
        <header className={styles.header}>
          <DialogTitle className={styles.title} tabIndex={-1} ref={titleRef}>
            {he ? 'פרטי מניה' : 'Stock details'} · <bdi>{stock.symbol}</bdi>
          </DialogTitle>
          <button type="button" className={styles.expand} aria-expanded={expanded}
            aria-label={expanded ? (he ? 'הקטנת החלונית' : 'Reduce panel height') : (he ? 'הרחבה למסך מלא' : 'Expand to full height')}
            onClick={event => { if (event.detail === 0 || !dragged.current) setExpanded(value => !value); dragged.current = false; }}
            onPointerDown={event => { dragged.current = false; dragStart.current = event.clientY; event.currentTarget.setPointerCapture?.(event.pointerId); }}
            onPointerUp={event => {
              if (dragStart.current === null) return;
              const distance = event.clientY - dragStart.current;
              dragStart.current = null;
              dragged.current = Math.abs(distance) > 24;
              if (dragged.current) setExpanded(distance < 0);
            }}
            onPointerCancel={() => { dragStart.current = null; }}>
            {expanded ? <ChevronsDown aria-hidden /> : <ChevronsUp aria-hidden />}
          </button>
        </header>
        <div className={styles.content}>
          <StockDetail key={stock.symbol} symbol={stock.symbol} inspector={{ ...stock, expand: () => setExpanded(true), setSaving: value => { saving.current = value; } }} />
        </div>
      </DialogContent>}
    </Dialog>
  </Context.Provider>;
}
