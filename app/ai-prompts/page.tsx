'use client';

import { useCallback, useMemo, useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer, DashboardMain } from '@/components/dashboard/page-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { buildAiSnapshot } from '@/lib/ai-snapshot';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';

export default function AiPromptsPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { metrics, loading, refreshing, lastUpdate, reload, error } = usePortfolioData();
  const [selectedSymbols, setSelectedSymbols] = useState<string[] | null>(null);
  const allStocks = useMemo(() => buildAiSnapshot(metrics, null, lastUpdate, Boolean(error)).stocks, [metrics, lastUpdate, error]);
  const selectionIsAll = selectedSymbols === null;
  const snapshotData = useMemo(() => buildAiSnapshot(metrics, selectedSymbols, lastUpdate, Boolean(error)), [metrics, selectedSymbols, lastUpdate, error]);
  const snapshot = JSON.stringify(snapshotData, null, 2);
  const [outputFormat, setOutputFormat] = useState<'prompt' | 'json'>('prompt');

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

  const copyText = useCallback(async (text: string, successMessage: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(successMessage); }
    catch (error) { console.error('Failed to copy AI content', error); toast.error(t.aiPrompts.copyError); }
  }, [t.aiPrompts.copyError]);

  const toggleSymbol = (symbol: string) => setSelectedSymbols((current) => {
    const selection = current ?? allStocks.map((stock) => stock.symbol);
    return selection.includes(symbol) ? selection.filter((item) => item !== symbol) : [...selection, symbol];
  });
  const hasSelection = snapshotData.stocks.length > 0 && !loading;
  const quickActions = useMemo(() => createCommonQuickActions(t, { overrides: { reload: { onClick: reload, disabled: loading || refreshing, iconClassName: loading || refreshing ? 'animate-spin' : undefined } } }), [t, reload, loading, refreshing]);

  return (
    <DashboardRouteShell activeKey="aiPrompts" locale={locale}>
      <DashboardContainer className="pb-14">
        <div className="flex flex-col gap-5">
          <PageHeader title={t.aiPrompts.title} subtitle={t.aiPrompts.subtitle} icon={Sparkles} quickActionsTitle={t.dashboard.quickActions} quickActions={quickActions} />
          <DashboardMain className="mt-0 space-y-5">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{locale === 'he' ? 'בחר מניות למחקר ולהעתקה' : 'Select stocks for research and copying'}</CardTitle>
                <CardDescription>{locale === 'he' ? 'הבחירה חלה גם על צילום המצב וגם על פרומפט המחקר.' : 'The selection applies to both the snapshot and the research prompt.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" aria-pressed={selectionIsAll} variant={selectionIsAll ? 'default' : 'outline'} size="sm" onClick={() => setSelectedSymbols(null)}>{locale === 'he' ? `הכול (${allStocks.length})` : `All (${allStocks.length})`}</Button>
                  {allStocks.map((stock) => {
                    const active = selectedSymbols?.includes(stock.symbol) ?? false;
                    return <Button key={stock.symbol} type="button" aria-pressed={selectionIsAll || active} variant={selectionIsAll || active ? 'default' : 'outline'} size="sm" onClick={() => toggleSymbol(stock.symbol)} className={cn('max-w-full', active && 'bg-[var(--color-primary-700)]')}>
                      {stock.name || stock.symbol} <span className="text-xs opacity-75">{stock.symbol.toUpperCase()}</span>
                    </Button>;
                  })}
                </div>
                {!loading && allStocks.length === 0 && <p className="text-sm text-[var(--color-slate-600)]">{t.aiPrompts.empty}</p>}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{locale === 'he' ? 'מסמך אחד ל-AI' : 'One document for AI'}</CardTitle>
                <CardDescription>{locale === 'he' ? 'שורה אחת לכל סימול, מתוך נתוני התיק המשותפים. ללא כמויות, שווי תיק או סכומי רווח. ההקצאה מחושבת מתוך כל התיק הפתוח.' : 'One record per ticker from the shared portfolio data. No quantities, portfolio value or profit amounts. Allocation uses the entire open portfolio.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label={locale === 'he' ? 'פורמט העתקה' : 'Copy format'}>
                  <Button variant={outputFormat === 'prompt' ? 'default' : 'outline'} aria-pressed={outputFormat === 'prompt'} onClick={() => setOutputFormat('prompt')}>{locale === 'he' ? 'פרומפט למחקר' : 'Research prompt'}</Button>
                  <Button variant={outputFormat === 'json' ? 'default' : 'outline'} aria-pressed={outputFormat === 'json'} onClick={() => setOutputFormat('json')}>JSON</Button>
                </div>
                <Textarea aria-label={locale === 'he' ? 'מסמך להעתקה ל-AI' : 'Document to copy to AI'} dir={outputFormat === 'json' ? 'ltr' : undefined} value={outputFormat === 'json' ? snapshot : researchPrompt} readOnly className="min-h-[360px]" />
                <Button className="w-full sm:w-auto" disabled={!hasSelection} onClick={() => copyText(outputFormat === 'json' ? snapshot : researchPrompt, locale === 'he' ? 'המסמך הועתק' : 'Document copied')}><Copy />{locale === 'he' ? 'העתק ל-AI' : 'Copy for AI'}</Button>
              </CardContent>
            </Card>
          </DashboardMain>
        </div>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
