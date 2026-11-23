'use client';

import dynamic from 'next/dynamic';
import { useRef, type Ref } from 'react';
import type { Locale } from '@/types';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/context';
import { useUrlState } from '@/hooks/use-url-state';

const ResearchExportDialog = dynamic(() => import('./research-export-dialog').then((module) => module.ResearchExportDialog));
const parseExport = (params: URLSearchParams) => params.get('export') === 'research';

export function ResearchExportTrigger({ locale, triggerRef, onOpen }: {
  locale: Locale;
  triggerRef?: Ref<HTMLButtonElement>;
  onOpen?: () => void;
}) {
  return <Button ref={triggerRef} disabled={!onOpen} aria-label={locale === 'he' ? 'ייצוא לניתוח' : 'Export for research'} variant="outline" className="rounded-lg border-slate-300 bg-white text-slate-700" onClick={onOpen}><Download aria-hidden /><span className={locale === 'en' ? 'hidden sm:inline' : undefined}>{locale === 'he' ? 'ייצוא לניתוח' : 'Export for research'}</span>{locale === 'en' ? <span className="sm:hidden">Export</span> : null}</Button>;
}

export function ResearchExportButton() {
  const { locale } = useApp();
  const [open, patch] = useUrlState(parseExport);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <ResearchExportTrigger locale={locale} triggerRef={triggerRef} onOpen={() => patch({ export: 'research' })} />
    {open ? <ResearchExportDialog open={open} onOpenChange={(value) => patch({ export: value ? 'research' : null })} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }} /> : null}
  </>;
}
