'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, FileText, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { buildAiSnapshot } from '@/lib/ai-snapshot';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';

export interface ResearchExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function ResearchExportDialog({ open, onOpenChange, onCloseAutoFocus }: ResearchExportDialogProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { metrics, loading, refreshing, lastUpdate, reload, error } = usePortfolioData();
  const [selectedSymbols, setSelectedSymbols] = useState<string[] | null>(null);
  const allStocks = useMemo(() => buildAiSnapshot(metrics, null, lastUpdate, Boolean(error)).stocks, [metrics, lastUpdate, error]);
  const selectionIsAll = selectedSymbols === null || (allStocks.length > 0 && allStocks.every(stock => selectedSymbols.includes(stock.symbol)));
  const [query, setQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [failedFormat, setFailedFormat] = useState<'prompt' | 'json' | null>(null);
  const [copying, setCopying] = useState<'prompt' | 'json' | null>(null);
  const copyLock = useRef(false);
  const he = locale === 'he';
  const visibleStocks = allStocks.filter(stock => `${stock.symbol} ${stock.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    if (!open) { setQuery(''); setAdvancedOpen(false); setPreviewOpen(false); setFailedFormat(null); }
  }, [open]);
  const snapshotData = useMemo(() => buildAiSnapshot(metrics, selectedSymbols, lastUpdate, Boolean(error)), [metrics, selectedSymbols, lastUpdate, error]);
  const snapshot = JSON.stringify(snapshotData, null, 2);

  const researchPrompt = useMemo(() => {
    const language = locale === 'he' ? 'עברית' : 'English';
    const header = locale === 'he'
      ? 'אתה אנליסט מניות חיצוני עם גישה לאינטרנט. ערוך מחקר מעמיק רק עבור המניות בצילום המצב המצורף.'
      : 'You are an external equity analyst with internet access. Conduct deep research only for the stocks in the supplied snapshot.';
    const instructions = locale === 'he'
      ? `מטרה: החזר טבלת Markdown אחת, שורה לכל מניה, ולאחריה מקורות בלבד.\n\nכללים קריטיים:\n1. השתמש רק במקורות אמינים: דוחות חברה, Investor Relations, SEC/ISA ואתרי פיננסים מוכרים.\n2. אל תמציא מספרים, תחזיות, טווחים או טענות. מידע חסר יסומן במפורש "לא זמין" או "דורש אימות".\n3. בדוק קטליזטורים, סיכונים, דוחות או אירועים קרובים, מחירי יעד אנליסטים אם קיימים, ומשימות מחקר להמשך.\n4. מחירי יעד יוצגו רק אם הם מגובים במקור; אין לבנות מודל חיזוי עצמאי.\n5. הפלט ב-${language} בלבד, ללא ייעוץ קנייה/מכירה.\n\nפורמט הטבלה:\n| סימול | חברה | מחיר נוכחי | שינוי מאז הכניסה % | קטליזטורים מבוססי מקור | סיכונים מבוססי מקור | דוח/אירוע הבא | יעד אנליסטים ל-12ח׳ (אם קיים) | משימות מחקר מומלצות | עדיפות מחקר (גבוהה/בינונית/שגרתית) |\n\nאחרי הטבלה כתוב "מקורות:" ורשימת מקורות בפורמט: \`- TICKER: מקור – תיאור קצר (תאריך בדיקה: YYYY-MM-DD) – URL מלא\`.`
      : `Goal: return one Markdown table, one row per stock, followed by sources only.\n\nCritical rules:\n1. Use trustworthy sources only: company filings, Investor Relations, SEC/ISA, and established finance sites.\n2. Never invent figures, forecasts, ranges, or claims. Mark missing data explicitly as "Not available" or "Needs verification".\n3. Research catalysts, risks, upcoming reports/events, analyst targets when available, and next research tasks.\n4. Show targets only when source-backed; do not build a proprietary forecast.\n5. Output in ${language} only, without buy/sell advice.\n\nTable format:\n| Ticker | Company | Current Price | Change Since Entry % | Source-backed Catalysts | Source-backed Risks | Next Report/Event | 12M Analyst Target (if available) | Recommended Research Tasks | Research Priority (High/Medium/Routine) |\n\nAfter the table write "Sources:" and list sources as: \`- TICKER: Source – short description (Checked: YYYY-MM-DD) – full URL\`.`;
    return `${header}\n\n${snapshot}\n\n${instructions}`;
  }, [locale, snapshot]);

  const copyText = useCallback(async (format: 'prompt' | 'json') => {
    if (copyLock.current) return;
    copyLock.current = true;
    setCopying(format);
    const text = format === 'json' ? snapshot : researchPrompt;
    try {
      await navigator.clipboard.writeText(text);
      setFailedFormat(null);
      toast.success(he ? 'המסמך הועתק — אפשר להדביק ב־AI' : 'Document copied — paste it into your AI');
    } catch {
      setFailedFormat(format);
      setAdvancedOpen(true);
      setPreviewOpen(true);
      toast.error(t.aiPrompts.copyError);
    } finally { copyLock.current = false; setCopying(null); }
  }, [snapshot, researchPrompt, he, t.aiPrompts.copyError]);

  const toggleSymbol = (symbol: string) => setSelectedSymbols((current) => {
    const selection = current ?? allStocks.map((stock) => stock.symbol);
    return selection.includes(symbol) ? selection.filter((item) => item !== symbol) : [...selection, symbol];
  });
  const hasSelection = snapshotData.stocks.length > 0 && !loading && !refreshing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} dir={he ? 'rtl' : 'ltr'} className="flex max-h-[85dvh] w-full flex-col gap-0 overflow-hidden rounded-t-3xl p-0 sm:w-[calc(100%_-_1.5rem)] sm:max-w-lg sm:rounded-3xl sm:p-0 [&>button:last-child]:hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-[var(--accent-text)]"><FileText className="h-4 w-4" /></span>
            <DialogHeader className="min-w-0 space-y-0 pe-0 text-start">
              <DialogTitle className="text-base font-semibold tracking-tight sm:text-lg">{he ? 'ייצוא לניתוח' : 'Export for research'}</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs leading-5">{he ? 'פרומפט מחקר מוכן להעתקה' : 'A ready-to-copy research prompt'}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="rounded-xl bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={reload} disabled={loading || refreshing} aria-label={t.common.refresh} title={t.common.refresh}>
              <RefreshCw aria-hidden className={cn('!h-4 !w-4', (loading || refreshing) && 'animate-spin')} />
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={he ? 'סגירה' : 'Close'} className="rounded-xl bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"><X aria-hidden className="!h-4 !w-4" /></Button>
            </DialogClose>
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 sm:px-5" aria-busy={loading || refreshing}>
          {(loading || error) && <p role="status" className="text-xs leading-5 text-muted-foreground">{loading ? t.common.loading : he ? 'מוצגים הנתונים הזמינים מהעדכון האחרון.' : 'Showing available data from the last update.'}</p>}
          <div className="flex min-h-8 items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{he ? 'מניות לניתוח' : 'Stocks to research'} <span className="ms-1 font-normal text-muted-foreground">{snapshotData.stocks.length}/{allStocks.length}</span></h3>
            {allStocks.length > 0 && <button type="button" className="min-h-[44px] shrink-0 rounded-lg px-2 text-xs font-medium text-[var(--accent-text)] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedSymbols(selectionIsAll ? [] : null)}>{selectionIsAll ? (he ? 'נקה בחירה' : 'Clear selection') : (he ? 'בחר הכול' : 'Select all')}</button>}
          </div>
          {allStocks.length > 6 && <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label={he ? 'חיפוש מניות' : 'Search stocks'} placeholder={he ? 'חיפוש לפי סימול או חברה' : 'Search ticker or company'} value={query} onChange={event => setQuery(event.target.value)} className="ps-9" />
          </div>}
          {allStocks.length > 0 ? <div role="group" aria-label={he ? 'בחירת מניות' : 'Stock selection'} className="max-h-[min(240px,32dvh)] overflow-y-auto rounded-xl border border-border">
            {visibleStocks.map(stock => {
              const active = selectedSymbols === null || selectedSymbols.includes(stock.symbol);
              return <button key={stock.symbol} type="button" aria-pressed={active} onClick={() => toggleSymbol(stock.symbol)} className={cn('flex min-h-[48px] w-full items-center gap-3 border-b border-border px-3 py-2 text-start text-sm last:border-b-0 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', active ? 'bg-blue-500/10 hover:bg-blue-500/20' : 'hover:bg-muted')}>
                <span aria-hidden className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-background')}>{active && <Check className="h-3.5 w-3.5" />}</span>
                <bdi className="shrink-0 font-semibold">{stock.symbol}</bdi>
                {stock.name && stock.name !== stock.symbol && <span className="min-w-0 flex-1 truncate text-muted-foreground" title={stock.name}>{stock.name}</span>}
              </button>;
            })}
            {visibleStocks.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">{he ? 'לא נמצאו מניות בחיפוש.' : 'No matching stocks.'}</p>}
          </div> : !loading && <p className="py-2 text-sm text-muted-foreground">{t.aiPrompts.empty}</p>}

          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{he ? 'ללא כמויות, שווי תיק או סכומי רווח.' : 'No quantities, portfolio value or profit amounts.'}</p>
          <details open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)} className="border-t border-border pt-1">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden"><ChevronDown aria-hidden className={cn('h-3.5 w-3.5', advancedOpen && 'rotate-180')} />{he ? 'אפשרויות נוספות' : 'More options'}</summary>
            <div className="space-y-2 pb-1">
              <Button type="button" variant="outline" size="sm" disabled={!hasSelection || copying !== null} onClick={() => { void copyText('json'); }}><Copy aria-hidden />{copying === 'json' ? (he ? 'מעתיק…' : 'Copying…') : (he ? 'העתק JSON' : 'Copy JSON')}</Button>
              {failedFormat && <p role="alert" className="text-xs leading-5 text-muted-foreground">{he ? 'לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק את הטקסט למטה.' : 'Automatic copying is unavailable. Select and copy the text below.'}</p>}
              <details open={previewOpen} onToggle={event => setPreviewOpen(event.currentTarget.open)}>
                <summary className="flex min-h-[44px] cursor-pointer items-center text-xs text-[var(--accent-text)]">{he ? 'תצוגה מקדימה' : 'Preview'}</summary>
                <Textarea aria-label={he ? 'מסמך להעתקה ל-AI' : 'Document to copy to AI'} dir={failedFormat === 'json' ? 'ltr' : undefined} value={failedFormat === 'json' ? snapshot : researchPrompt} readOnly onFocus={event => event.currentTarget.select()} className="h-32 min-h-0 resize-none text-xs leading-5" />
              </details>
            </div>
          </details>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <Button type="button" className="w-full" disabled={!hasSelection || copying !== null} onClick={() => { void copyText('prompt'); }}><Copy aria-hidden />{copying === 'prompt' ? (he ? 'מעתיק…' : 'Copying…') : (he ? 'העתק ל-AI' : 'Copy for AI')}</Button>
          <p className="text-center text-[11px] leading-4 text-muted-foreground">{he ? 'הדביקו ב־ChatGPT או בכל כלי AI לבחירתכם.' : 'Paste into ChatGPT or your preferred AI tool.'}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
