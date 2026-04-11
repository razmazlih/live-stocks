'use client';

import { useCallback, useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';

import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import type { PositionMetrics } from '@/types';

type TemplateKey = 'quick' | 'risk' | 'research';

interface PromptTemplate {
  key: TemplateKey;
  title: string;
  badge: string;
  summary: string;
  fit: string;
  prompt: string;
}

function isTemplateKey(value: string): value is TemplateKey {
  return value === 'quick' || value === 'risk' || value === 'research';
}

function deriveTags(metric: PositionMetrics, locale: 'he' | 'en'): string[] {
  const tags = new Set<string>();
  const { position, combined, yearsHeld } = metric;

  if (position.symbol) {
    tags.add(position.symbol.toUpperCase());
  }

  if (position.display && position.display.trim()) {
    tags.add(position.display.trim());
  }

  if (yearsHeld < 0.25) {
    tags.add(locale === 'he' ? 'חדש' : 'New');
  } else if (yearsHeld < 2) {
    tags.add(locale === 'he' ? 'ביניים' : 'Mid-term');
  } else {
    tags.add(locale === 'he' ? 'ותיק' : 'Long-term');
  }

  tags.add(
    combined >= 0
      ? locale === 'he'
        ? 'מעל התחזית'
        : 'Ahead of projection'
      : locale === 'he'
        ? 'מתחת לתחזית'
        : 'Below projection'
  );

  return Array.from(tags);
}

function formatPromptPercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : 'NA';
}

export default function AiPromptsPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const direction = locale === 'he' ? 'rtl' : 'ltr';
  const { metrics, loading, refreshing, lastUpdate, reload } = usePortfolioData();

  const [selectedTemplateKey, setSelectedTemplateKey] = useState<TemplateKey>('quick');

  const openMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity > 0),
    [metrics]
  );

  const positionsWithTags = useMemo(() => {
    return openMetrics.map((metric) => {
      const tags = deriveTags(metric, locale);
      return { metric, tags };
    });
  }, [openMetrics, locale]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    positionsWithTags.forEach((item) => {
      item.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags);
  }, [positionsWithTags]);

  const contextLabels = useMemo(
    () =>
      locale === 'he'
        ? {
            symbol: 'סימול',
            company: 'חברה',
            changePct: 'שינוי מאז הכניסה (%)',
            dailyChangePct: 'שינוי יומי (%)',
            gapVsInternalProjectionPct: 'פער מול תחזית פנימית (%)',
            tags: 'טאגים',
          }
        : {
            symbol: 'Ticker',
            company: 'Company',
            changePct: 'Change vs entry (%)',
            dailyChangePct: 'Daily change (%)',
            gapVsInternalProjectionPct: 'Gap vs internal projection (%)',
            tags: 'Tags',
          },
    [locale]
  );

  const positionsContext = useMemo(() => {
    if (!positionsWithTags.length) {
      return locale === 'he' ? 'אין פוזיציות פעילות כרגע.' : 'No active positions right now.';
    }

    return positionsWithTags
      .map(({ metric, tags }) => {
        const { position, currentPrice, projectedPrice, roiPercent, dailyChangePercent } = metric;
        const projectedGapPercent =
          Number.isFinite(projectedPrice) && projectedPrice !== 0
            ? ((currentPrice - projectedPrice) / projectedPrice) * 100
            : Number.NaN;
        const tagsValue = tags.length ? tags.join(', ') : 'NA';

        return `${contextLabels.symbol}: ${position.symbol.toUpperCase()} | ${contextLabels.company}: ${position.display || position.symbol} | ${contextLabels.changePct}: ${formatPromptPercent(roiPercent)} | ${contextLabels.dailyChangePct}: ${formatPromptPercent(dailyChangePercent ?? Number.NaN)} | ${contextLabels.gapVsInternalProjectionPct}: ${formatPromptPercent(projectedGapPercent)} | ${contextLabels.tags}: ${tagsValue}`;
      })
      .join('\n');
  }, [positionsWithTags, locale, contextLabels]);

  const tagLine = allTags.length
    ? locale === 'he'
      ? `טאגים רלוונטיים: ${allTags.join(', ')}`
      : `Relevant tags: ${allTags.join(', ')}`
    : locale === 'he'
      ? 'אין טאגים רלוונטיים (אין פוזיציות פעילות).'
      : 'No tags available (no active positions).';

  const baseContext = useMemo(() => {
    const contextHeading =
      locale === 'he'
        ? 'נתוני פוזיציות (מבנה קשיח להעתקה; אחוזים בלבד, ללא כמויות, מחירים או סכומי כסף):'
        : 'Positions data (strict copy-ready structure; percentages only, with no quantities, prices, or money amounts):';
    const parsingNote =
      locale === 'he'
        ? 'הערה: כל ערך מספרי מוצג באחוזים בפורמט אחיד, ואין להציג כמויות החזקה.'
        : 'Note: every numeric value is normalized as a percentage, and holding quantities must not appear.';
    return `${contextHeading}\n${parsingNote}\n${positionsContext}`;
  }, [locale, positionsContext]);

  const aiTemplates = useMemo<PromptTemplate[]>(() => {
    if (locale === 'he') {
      return [
        {
          key: 'quick',
          title: t.aiPrompts.templates.quickForecast,
          badge: 'מהיר',
          summary: 'סקירה מהירה לכל המניות עם סטטוס, קטליזטור קרוב ופעולה מיידית.',
          fit: 'Snapshot קצר להדבקה מיידית',
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט מניות עם גישה לאינטרנט. מותר להשתמש רק במקורות אמינים.\n\nמטרה:\nלהחזיר ניתוח קצר באחוזים בלבד, בלי מחירים, בלי סכומי כסף ובלי כמויות החזקה.\n\nכללים מחייבים:\n1. אין להציג מחירים, מטבע, רווח/הפסד כספי או כמות מניות/יחידות.\n2. כל נתון מספרי על עלייה/ירידה/פער/טווח בפלט חייב להיות באחוזים בלבד.\n3. אם חסר נתון: "לא זמין" או "דורש אימות".\n4. אחוזים בפורמט שתי ספרות אחרי הנקודה.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n| סימול | חברה | שינוי מאז הכניסה % | שינוי יומי % | פער ליעד קונסנזוס % | טווח תשואה חזוי 12ח' % [מינ-מקס] | סטטוס (חיובי/נייטרלי/שלילי) | קטליזטור קרוב | פעולה מיידית |\n\nחישובים:\n- פער ליעד קונסנזוס % = ((יעד קונסנזוס - מחיר נוכחי) / מחיר נוכחי) * 100.\n- טווח תשואה חזוי 12ח' % = [((יעד מינימום - מחיר נוכחי) / מחיר נוכחי) * 100, ((יעד מקסימום - מחיר נוכחי) / מחיר נוכחי) * 100].\n- בפלט מציגים רק את האחוזים, לא את המחירים עצמם.\n\n2. אחרי הטבלה כתוב "מקורות:" ואז רשימת מקורות:\n- TICKER: מקור - מה אומת ממנו (תאריך בדיקה: YYYY-MM-DD) - URL מלא\n\nאין להוסיף טקסט מעבר לטבלה ולמקורות.\n`,
        },
        {
          key: 'risk',
          title: t.aiPrompts.templates.riskFocus,
          badge: 'סיכון',
          summary: 'ממסגר במהירות מה דורש בדיקה חוזרת, ומה נראה כהזדמנות מול סיכון.',
          fit: 'לתעדוף סיכון והזדמנות',
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט סיכונים למניות. הפלט חייב להיות באחוזים בלבד.\n\nמטרה:\nלסווג כל סימול להזדמנות/נייטרלי/סיכון לפי מדדי אחוזים בלבד.\n\nכללים מחייבים:\n1. ללא מחירים, ללא סכומי כסף וללא כמות מניות/יחידות בפלט.\n2. כל מספר שמתאר עלייה/ירידה/מרחק/פער יוצג באחוזים בלבד.\n3. אם נתון חסר: "לא זמין".\n4. אחוזים עם שתי ספרות אחרי הנקודה.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n| סימול | חברה | שינוי מאז הכניסה % | מרחק משיא 52ש' % | מרחק משפל 52ש' % | פער ליעד קונסנזוס % | מצב (הזדמנות/נייטרלי/סיכון) | נימוק קצר | טריגר לבדיקה חוזרת | דחיפות |\n\nחישובים:\n- מרחק משיא 52ש' % = ((מחיר נוכחי - שיא 52ש') / שיא 52ש') * 100.\n- מרחק משפל 52ש' % = ((מחיר נוכחי - שפל 52ש') / שפל 52ש') * 100.\n- פער ליעד קונסנזוס % = ((יעד קונסנזוס - מחיר נוכחי) / מחיר נוכחי) * 100.\n- בפלט מציגים רק את האחוזים.\n\n2. אחרי הטבלה כתוב "מקורות:" ואז רשימת מקורות:\n- TICKER: מקור - מה אומת ממנו (תאריך בדיקה: YYYY-MM-DD) - URL מלא\n\nאין להוסיף טקסט מעבר לטבלה ולמקורות.\n`,
        },
        {
          key: 'research',
          title: t.aiPrompts.templates.research,
          badge: 'מחקר',
          summary: 'בונה מסגרת עבודה עמוקה יותר לרבעון הבא עם KPI ושכבות עדיפות ברורות.',
          fit: 'לתוכנית מחקר מסודרת',
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט מחקר שמכין תוכנית עבודה לרבעון הקרוב, באחוזים בלבד.\n\nמטרה:\nלהחזיר טבלת מחקר פרקטית בלי שום סכום כספי ובלי כמויות החזקה.\n\nכללים מחייבים:\n1. כל נתון מספרי חייב להיות באחוזים.\n2. אין מחירים, אין מטבע, אין רווח/הפסד כספי ואין כמות מניות/יחידות.\n3. אם נתון חסר: "לא זמין".\n4. אחוזים עם שתי ספרות אחרי הנקודה.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n| סימול | שינוי מאז הכניסה % | טווח תשואה חזוי 12ח' % [מינ-מקס] | KPI-ים באחוזים למעקב | תרחיש בסיס % | תרחיש לחץ % | 3 שאלות קריטיות לדוח הבא | משימות מחקר P1/P2/P3 |\n\nכללי תוכן:\n- בעמודת KPI-ים: 3 עד 5 מדדים באחוזים, מופרדים ב-';'.\n- בעמודת 3 שאלות קריטיות: בדיוק 3 שאלות קצרות מופרדות ב-';'.\n- בעמודת משימות מחקר: בדיוק 3 משימות בפורמט 'P1: ...; P2: ...; P3: ...'.\n\n2. אחרי הטבלה כתוב "מקורות:" ואז רשימת מקורות:\n- TICKER: מקור - מה אומת ממנו (תאריך בדיקה: YYYY-MM-DD) - URL מלא\n\nאין להוסיף טקסט מעבר לטבלה ולמקורות.\n`,
        },
      ];
    }

    return [
      {
        key: 'quick',
        title: t.aiPrompts.templates.quickForecast,
        badge: 'Fast',
        summary: 'Quick snapshot per ticker with stance, next catalyst, and immediate follow-up.',
        fit: 'Short prompt for immediate paste',
        prompt: `${baseContext}\n${tagLine}\nYou are a stocks analyst with internet access. Use reliable sources only.\n\nGoal:\nReturn a short analysis in percentages only, with no prices, no money amounts, and no holding quantities.\n\nHard rules:\n1. Do not show prices, currency values, money P/L, or share/unit quantities.\n2. Every numeric output about rise, fall, gap, or range must be a percentage.\n3. If data is missing: "Not available" or "Needs verification".\n4. Percentages must use two decimals.\n5. Output in English only.\n\nOutput format:\n1. One Markdown table with columns:\n| Ticker | Company | Change vs entry % | Daily change % | Gap to consensus target % | 12M expected return range % [min-max] | Status (Positive/Neutral/Negative) | Next catalyst | Immediate action |\n\nFormulas:\n- Gap to consensus % = ((Consensus target - Current price) / Current price) * 100.\n- 12M expected return range % = [((Target min - Current price) / Current price) * 100, ((Target max - Current price) / Current price) * 100].\n- Show percentages only in output.\n\n2. After the table, add "Sources:" and list:\n- TICKER: Source - what it validated (Checked: YYYY-MM-DD) - full URL\n\nDo not output anything beyond the table and sources.\n`,
      },
      {
        key: 'risk',
        title: t.aiPrompts.templates.riskFocus,
        badge: 'Risk',
        summary: 'Frames what needs review first and separates opportunity from risk using one table.',
        fit: 'Prioritize risk vs opportunity',
        prompt: `${baseContext}\n${tagLine}\nYou are an equity risk analyst. Output must be percentages only.\n\nGoal:\nClassify each ticker as Opportunity/Neutral/Risk using percentage metrics only.\n\nHard rules:\n1. No prices, no money amounts, and no share/unit quantities in output.\n2. Any number describing rise, fall, distance, or gap must be a percentage.\n3. Missing data must be "Not available".\n4. Percentages with two decimals.\n5. Output in English only.\n\nOutput format:\n1. One Markdown table with columns:\n| Ticker | Company | Change vs entry % | Distance from 52W high % | Distance from 52W low % | Gap to consensus target % | Stance (Opportunity/Neutral/Risk) | Short rationale | Re-check trigger | Urgency |\n\nFormulas:\n- Distance from 52W high % = ((Current price - 52W high) / 52W high) * 100.\n- Distance from 52W low % = ((Current price - 52W low) / 52W low) * 100.\n- Gap to consensus % = ((Consensus target - Current price) / Current price) * 100.\n- Show percentages only in output.\n\n2. After the table, add "Sources:" and list:\n- TICKER: Source - what it validated (Checked: YYYY-MM-DD) - full URL\n\nDo not output anything beyond the table and sources.\n`,
      },
      {
        key: 'research',
        title: t.aiPrompts.templates.research,
        badge: 'Research',
        summary: 'Builds a deeper quarterly research plan with KPI tracking and explicit priorities.',
        fit: 'Structured quarterly research plan',
        prompt: `${baseContext}\n${tagLine}\nYou are a research analyst preparing a quarterly plan in percentages only.\n\nGoal:\nReturn a practical research table with no money amounts and no holding quantities.\n\nHard rules:\n1. Every numeric value must be a percentage.\n2. No prices, no currency, no money P/L, and no share/unit quantities.\n3. Missing data must be "Not available".\n4. Percentages with two decimals.\n5. Output in English only.\n\nOutput format:\n1. One Markdown table with columns:\n| Ticker | Change vs entry % | 12M expected return range % [min-max] | KPI percentages to track | Base scenario % | Stress scenario % | 3 critical questions for next earnings call | Research tasks P1/P2/P3 |\n\nContent constraints:\n- KPI percentages column: 3-5 percentage KPIs separated by ';'.\n- Critical questions column: exactly 3 short questions separated by ';'.\n- Research tasks column: exactly 'P1: ...; P2: ...; P3: ...'.\n\n2. After the table, add "Sources:" and list:\n- TICKER: Source - what it validated (Checked: YYYY-MM-DD) - full URL\n\nDo not output anything beyond the table and sources.\n`,
      },
    ];
  }, [baseContext, locale, tagLine, t.aiPrompts.templates]);

  const isRefreshing = loading || refreshing;
  const hasPositions = openMetrics.length > 0;
  const lastRefreshValue = lastUpdate
    ? lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    : locale === 'he'
      ? 'עדיין לא עודכן'
      : 'Not updated yet';

  const pageCopy = useMemo(
    () =>
      locale === 'he'
        ? {
            refresh: 'רענן נתונים',
            lastRefresh: 'רענון אחרון',
            selectorTitle: 'בחרו פרומפט',
            selectorHelper: 'בחירה מהירה, העתקה מיידית, בלי מסכים מיותרים.',
            bestFor: 'מתאים ל...',
            copyContext: 'העתק בלוק',
            copyPrompt: 'העתק פרומפט',
            compactRules: ['אחוזים בלבד', 'ללא כמויות', 'HE/EN'],
            promptReady: 'הפרומפט כבר כולל context, tags וכללי פלט.',
            tagLineTitle: 'טאגים פעילים',
            rulesTitle: 'חוקים קשיחים',
            statusActive: 'קיימות פוזיציות פעילות לניתוח',
            statusEmpty: 'אין פוזיציות פעילות כרגע',
          }
        : {
            refresh: 'Refresh data',
            lastRefresh: 'Last refresh',
            selectorTitle: 'Choose a prompt',
            selectorHelper: 'Fast selection and copy, without extra explanatory UI.',
            bestFor: 'Best for...',
            copyContext: 'Copy block',
            copyPrompt: 'Copy prompt',
            compactRules: ['Percent only', 'No quantity', 'HE/EN'],
            promptReady: 'The prompt already includes context, tags, and output rules.',
            tagLineTitle: 'Active tags',
            rulesTitle: 'Hard rules',
            statusActive: 'Active positions are available for analysis',
            statusEmpty: 'No active positions right now',
          },
    [locale]
  );

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(t.aiPrompts.copySuccess);
      } catch (error) {
        console.error('Failed to copy prompt', error);
        toast.error(t.aiPrompts.copyError);
      }
    },
    [t.aiPrompts.copyError, t.aiPrompts.copySuccess]
  );

  const handleTemplateChange = useCallback((value: string) => {
    if (isTemplateKey(value)) {
      setSelectedTemplateKey(value);
    }
  }, []);

  return (
    <DashboardPageShell direction={direction}>
      <div className="dashboard-page-container">
        <div className="space-y-4">
          <section className="rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="space-y-2">
                  <h1 className="text-3xl font-black tracking-tight text-[var(--color-primary-900)] sm:text-[2.1rem]">
                    {t.aiPrompts.title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--color-slate-600)]">
                    {t.aiPrompts.subtitle}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--color-slate-600)]">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] px-3 py-1.5">
                    <span>{pageCopy.lastRefresh}</span>
                    <span className="font-semibold text-[var(--color-primary-900)]">{lastRefreshValue}</span>
                  </span>
                  {pageCopy.compactRules.map((rule) => (
                    <span
                      key={rule}
                      className="inline-flex items-center rounded-full border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] px-3 py-1.5 text-[var(--color-primary-700)]"
                    >
                      {rule}
                    </span>
                  ))}
                </div>
              </div>

              <Button
                variant="ghost"
                onClick={reload}
                disabled={isRefreshing}
                className="rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-[var(--color-slate-700)] shadow-sm hover:bg-[color:var(--color-primary-050)]"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {pageCopy.refresh}
              </Button>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
            <Card className="overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
              <CardHeader className="space-y-2 border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70">
                <CardTitle>{pageCopy.selectorTitle}</CardTitle>
                <CardDescription>{pageCopy.selectorHelper}</CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6">
                <Tabs value={selectedTemplateKey} onValueChange={handleTemplateChange}>
                  <TabsList
                    aria-label={pageCopy.selectorTitle}
                    className="h-auto w-full flex-col items-stretch gap-2 rounded-[1.25rem] bg-[color:var(--color-slate-50)]/70 p-2 md:flex-row"
                  >
                    {aiTemplates.map((template) => (
                      <TabsTrigger
                        key={template.key}
                        value={template.key}
                        className="h-auto min-h-[76px] flex-1 items-start justify-start whitespace-normal rounded-[1rem] border border-transparent px-4 py-3 text-start data-[state=active]:border-[color:var(--color-primary-100)] data-[state=active]:bg-[color:var(--color-neutral-white)]"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]"
                            >
                              {template.badge}
                            </Badge>
                          </div>
                          <div className="text-sm font-semibold text-[var(--color-primary-900)]">{template.title}</div>
                          <div className="text-xs leading-5 text-[var(--color-slate-500)]">{template.summary}</div>
                        </div>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {aiTemplates.map((template) => (
                    <TabsContent key={template.key} value={template.key} className="mt-4">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-[1.25rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className="w-fit border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]"
                                >
                                  {template.badge}
                                </Badge>
                                <span className="text-xs font-medium text-[var(--color-slate-500)]">{template.fit}</span>
                              </div>
                              <div>
                                <h2 className="text-lg font-semibold text-[var(--color-primary-900)]">{template.title}</h2>
                                <p className="mt-1 text-sm leading-6 text-[var(--color-slate-600)]">{template.summary}</p>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleCopy(template.prompt)}
                              className="rounded-full bg-[var(--color-primary-600)] text-white shadow-sm hover:bg-[var(--color-primary-700)]"
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {pageCopy.copyPrompt}
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-[color:var(--color-slate-200)] bg-white px-3 py-1.5 text-[var(--color-slate-600)]">
                              {pageCopy.bestFor} {template.fit}
                            </span>
                            <span className="rounded-full border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] px-3 py-1.5 text-[var(--color-primary-700)]">
                              {pageCopy.promptReady}
                            </span>
                          </div>
                        </div>

                        <Textarea
                          value={template.prompt}
                          readOnly
                          className="h-[280px] resize-none border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 font-mono text-[13px]"
                        />
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
              <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{t.aiPrompts.contextTitle}</CardTitle>
                    <CardDescription>
                      {loading ? t.aiPrompts.loading : pageCopy.promptReady}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(positionsContext)}
                    className="rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/80 text-[var(--color-slate-700)] shadow-sm hover:bg-[color:var(--color-primary-050)]"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {pageCopy.copyContext}
                  </Button>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--color-primary-200)] bg-[color:var(--color-primary-050)] px-3 py-1 text-xs font-medium text-[var(--color-primary-700)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
                  {hasPositions ? pageCopy.statusActive : pageCopy.statusEmpty}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="rounded-[1rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {pageCopy.rulesTitle}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {pageCopy.compactRules.map((rule) => (
                      <span
                        key={rule}
                        className="rounded-full border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] px-3 py-1.5 text-[var(--color-primary-700)]"
                      >
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>

                <Textarea
                  value={positionsContext}
                  readOnly
                  className="h-[200px] resize-none border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 font-mono text-[13px]"
                />

                <div className="rounded-[1.25rem] border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] px-4 py-3 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                    {pageCopy.tagLineTitle}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-primary-900)]">{tagLine}</p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </DashboardPageShell>
  );
}
