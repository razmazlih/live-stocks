'use client';

import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Globe2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer, DashboardMain } from '@/components/dashboard/page-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { formatCurrency, formatDate, formatPercent } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';
import type { PositionMetrics } from '@/types';

function deriveTags(metric: PositionMetrics, locale: 'he' | 'en'): string[] {
  const { position, combined, yearsHeld } = metric;
  return [
    position.symbol.toUpperCase(),
    ...(position.display.trim() ? [position.display.trim()] : []),
    yearsHeld < 0.25 ? (locale === 'he' ? 'חדש' : 'New') : yearsHeld < 2 ? (locale === 'he' ? 'ביניים' : 'Mid-term') : (locale === 'he' ? 'ותיק' : 'Long-term'),
    combined >= 0 ? (locale === 'he' ? 'מעל התחזית' : 'Ahead of projection') : (locale === 'he' ? 'מתחת לתחזית' : 'Below projection'),
  ];
}

function formatHoldingPeriod(years: number, locale: 'he' | 'en') {
  const months = Math.max(0, Math.round(years * 12));
  return locale === 'he' ? (months < 12 ? `${months} חודשים` : `${(years).toFixed(1)} שנים`) : (months < 12 ? `${months} months` : `${years.toFixed(1)} years`);
}

export default function AiPromptsPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const { metrics, loading, refreshing, lastUpdate, reload } = usePortfolioData();
  const [selectedSymbols, setSelectedSymbols] = useState<string[] | null>(null);
  const openMetrics = useMemo(() => metrics.filter((metric) => metric.position.quantity > 0), [metrics]);

  const selectedMetrics = useMemo(() => {
    if (selectedSymbols === null) return openMetrics;
    return openMetrics.filter((metric) => selectedSymbols.includes(metric.position.symbol));
  }, [openMetrics, selectedSymbols]);

  const selectionIsAll = selectedSymbols === null;
  const selectedWithTags = useMemo(() => selectedMetrics.map((metric) => ({ metric, tags: deriveTags(metric, locale) })), [selectedMetrics, locale]);
  const totalSelectedValue = useMemo(() => selectedMetrics.reduce((sum, metric) => sum + metric.currentValue, 0), [selectedMetrics]);
  const allocations = useMemo(() => selectedMetrics.map((metric) => ({ metric, allocation: totalSelectedValue > 0 ? (metric.currentValue / totalSelectedValue) * 100 : 0 })), [selectedMetrics, totalSelectedValue]);

  const snapshot = useMemo(() => {
    const updatedAt = lastUpdate ? lastUpdate.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US') : (locale === 'he' ? 'לא זמין' : 'Not available');
    if (!selectedWithTags.length) return locale === 'he' ? 'אין מניות נבחרות להעתקה.' : 'No stocks selected to copy.';
    const sorted = [...allocations].sort((a, b) => b.allocation - a.allocation);
    const topOne = sorted[0]?.allocation ?? 0;
    const topThree = sorted.slice(0, 3).reduce((sum, item) => sum + item.allocation, 0);
    const heading = locale === 'he' ? 'צילום מצב תיק מניות (ללא כמויות וללא סכומים כספיים)' : 'Portfolio stock snapshot (no quantities or absolute money amounts)';
    const summary = locale === 'he'
      ? `עדכון: ${updatedAt}\nמניות נבחרות: ${selectedWithTags.length}\nריכוזיות החזקה מובילה: ${formatPercent(topOne, locale)}\nהקצאה מצטברת של 3 הגדולות: ${formatPercent(topThree, locale)}`
      : `Updated: ${updatedAt}\nSelected stocks: ${selectedWithTags.length}\nLargest holding concentration: ${formatPercent(topOne, locale)}\nTop 3 combined allocation: ${formatPercent(topThree, locale)}`;
    const rows = selectedWithTags.map(({ metric, tags }) => {
      const allocation = allocations.find((item) => item.metric.position.symbol === metric.position.symbol)?.allocation ?? 0;
      const { position } = metric;
      return [
        `${locale === 'he' ? 'סימול' : 'Ticker'}: ${position.symbol.toUpperCase()}`,
        `${locale === 'he' ? 'שם' : 'Name'}: ${position.display || position.symbol}`,
        `${locale === 'he' ? 'תאריך כניסה' : 'Entry date'}: ${position.entryDate ? formatDate(position.entryDate, locale) : '—'}`,
        `${locale === 'he' ? 'מחיר כניסה' : 'Entry price'}: ${formatCurrency(position.entryPrice, 'USD', locale)}`,
        `${locale === 'he' ? 'מחיר נוכחי' : 'Current price'}: ${formatCurrency(metric.currentPrice, 'USD', locale)}`,
        `${locale === 'he' ? 'שינוי יומי' : 'Daily change'}: ${metric.dailyChangePercent === undefined ? '—' : formatPercent(metric.dailyChangePercent, locale)}`,
        `${locale === 'he' ? 'שינוי מאז הכניסה' : 'Change since entry'}: ${formatPercent(metric.roiPercent, locale)}`,
        `${locale === 'he' ? 'זמן החזקה' : 'Holding period'}: ${formatHoldingPeriod(metric.yearsHeld, locale)}`,
        `${locale === 'he' ? 'הקצאה' : 'Allocation'}: ${formatPercent(allocation, locale)}`,
        `${locale === 'he' ? 'טאגים' : 'Tags'}: ${tags.join(', ')}`,
      ].join(' | ');
    });
    return `${heading}\n\n${summary}\n\n${rows.join('\n')}`;
  }, [allocations, lastUpdate, locale, selectedWithTags]);

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
    const selection = current ?? [];
    return selection.includes(symbol) ? selection.filter((item) => item !== symbol) : [...selection, symbol];
  });
  const hasSelection = selectedMetrics.length > 0;
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
                  <Button type="button" variant={selectionIsAll ? 'default' : 'outline'} size="sm" onClick={() => setSelectedSymbols(null)}>{locale === 'he' ? `הכול (${openMetrics.length})` : `All (${openMetrics.length})`}</Button>
                  {openMetrics.map((metric) => {
                    const active = selectedSymbols?.includes(metric.position.symbol) ?? false;
                    return <Button key={metric.position.symbol} type="button" variant={active ? 'default' : 'outline'} size="sm" onClick={() => toggleSymbol(metric.position.symbol)} className={cn('max-w-full', active && 'bg-[var(--color-primary-700)]')}>
                      {metric.position.display || metric.position.symbol} <span className="text-xs opacity-75">{metric.position.symbol.toUpperCase()}</span>
                    </Button>;
                  })}
                </div>
                {!loading && openMetrics.length === 0 && <p className="text-sm text-[var(--color-slate-600)]">{t.aiPrompts.empty}</p>}
              </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2 shadow-sm">
                <CardHeader><CardTitle>{locale === 'he' ? 'צילום מצב להעתקה' : 'Copyable stock snapshot'}</CardTitle><CardDescription>{locale === 'he' ? 'מחירים ואחוזים בלבד — ללא כמויות, שווי או סכומי רווח/הפסד.' : 'Prices and percentages only — no quantities, value, or P/L amounts.'}</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea value={snapshot} readOnly className="min-h-[260px] resize-none border-[var(--color-primary-100)] bg-white/70 shadow-inner" />
                  <Button className="w-full sm:w-auto" disabled={!hasSelection} onClick={() => copyText(snapshot, locale === 'he' ? 'מצב המניות הועתק' : 'Stock snapshot copied')}><Copy />{locale === 'he' ? 'העתק מצב מניות' : 'Copy stock snapshot'}</Button>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader><CardTitle>{locale === 'he' ? 'הגנת פרטיות' : 'Privacy guardrails'}</CardTitle><CardDescription>{locale === 'he' ? 'מה משותף עם ה-AI' : 'What is shared with the AI'}</CardDescription></CardHeader>
                <CardContent className="space-y-3 text-sm text-[var(--color-slate-700)]">
                  <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary-700)]" /><span>{locale === 'he' ? 'אין כמויות, שווי תיק או סכומי רווח/הפסד.' : 'No quantities, portfolio value, or absolute profit/loss.'}</span></div>
                  <div className="flex gap-2"><Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary-700)]" /><span>{locale === 'he' ? 'הפרומפט מחייב מקורות וקישורים עם תאריך בדיקה.' : 'The prompt requires sources, links, and a check date.'}</span></div>
                  <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary-700)]" /><span>{locale === 'he' ? 'רק מניות שנבחרו ייכללו.' : 'Only selected stocks are included.'}</span></div>
                </CardContent>
              </Card>
            </div>

            <Card className="shadow-sm ring-1 ring-[var(--color-primary-050)]">
              <CardHeader><CardTitle>{locale === 'he' ? 'פרומפט מחקר מניות' : 'Stock research prompt'}</CardTitle><CardDescription>{locale === 'he' ? 'מחקר מקור-מבוסס, קטליזטורים, סיכונים ופעולות המשך עבור המניות שנבחרו.' : 'Source-based research, catalysts, risks, and next actions for the selected stocks.'}</CardDescription></CardHeader>
              <CardContent className="space-y-3"><Textarea value={researchPrompt} readOnly className="min-h-[420px] resize-none" /><Button className="w-full" disabled={!hasSelection} onClick={() => copyText(researchPrompt, locale === 'he' ? 'פרומפט המחקר הועתק' : 'Research prompt copied')}><Copy />{locale === 'he' ? 'העתק פרומפט מחקר' : 'Copy research prompt'}</Button></CardContent>
            </Card>
          </DashboardMain>
        </div>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
