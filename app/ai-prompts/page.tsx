'use client';

import { useCallback, useMemo } from 'react';
import { CheckCircle2, Copy, Globe2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import type { PositionMetrics } from '@/types';

function deriveTags(
  metric: PositionMetrics,
  locale: 'he' | 'en'
): string[] {
  const tags = new Set<string>();
  const { position, combined, yearsHeld } = metric;

  if (position.symbol) {
    tags.add(position.symbol.toUpperCase());
  }

  if (position.display && position.display.trim()) {
    tags.add(position.display.trim());
  }

  if (yearsHeld < 0.25) {
    tags.add(locale === 'he' ? 'חדש (עד 3 ח.)' : 'New (<3mo)');
  } else if (yearsHeld < 2) {
    tags.add(locale === 'he' ? 'ביניים (עד 2 ש.)' : 'Mid-term (<2y)');
  } else {
    tags.add(locale === 'he' ? 'ותיק (2+ ש.)' : 'Long-term (2y+)');
  }

  tags.add(combined >= 0 ? (locale === 'he' ? 'מעל התחזית' : 'Ahead of projection') : (locale === 'he' ? 'מתחת לתחזית' : 'Below projection'));

  return Array.from(tags);
}

function formatPromptPercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : 'NA';
}

export default function AiPromptsPage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const direction = locale === 'he' ? 'rtl' : 'ltr';
  const {
    metrics,
    loading,
    refreshing,
    lastUpdate,
    reload,
  } = usePortfolioData();

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
    ? (locale === 'he'
        ? `טאגים רלוונטיים: ${allTags.join(', ')}`
        : `Relevant tags: ${allTags.join(', ')}`)
    : locale === 'he'
      ? 'אין טאגים רלוונטיים (אין פוזיציות פעילות).'
      : 'No tags available (no active positions).';

  const baseContext = useMemo(() => {
    const contextHeading =
      locale === 'he'
        ? 'נתוני פוזיציות (מבנה קשיח להעתקה; אחוזים בלבד ללא מחירים וסכומי כסף):'
        : 'Positions data (strict copy-ready structure; percentages only with no prices or money amounts):';
    const parsingNote =
      locale === 'he'
        ? 'הערה: כל ערך מספרי מוצג באחוזים בפורמט אחיד.'
        : 'Note: every numeric value is normalized as a percentage.';
    return `${contextHeading}\n${parsingNote}\n${positionsContext}`;
  }, [locale, positionsContext]);

  const aiTemplates = useMemo(() => {
    if (locale === 'he') {
      return [
        {
          key: 'quick',
          title: t.aiPrompts.templates.quickForecast,
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט מניות עם גישה לאינטרנט. מותר להשתמש רק במקורות אמינים.\n\nמטרה:\nלהחזיר ניתוח קצר באחוזים בלבד, בלי מחירים ובלי סכומי כסף.\n\nכללים מחייבים:\n1. אין להציג מחירים, מטבע או רווח/הפסד כספי.\n2. כל נתון מספרי בפלט חייב להיות באחוזים בלבד.\n3. אם חסר נתון: \"לא זמין\" או \"דורש אימות\".\n4. אחוזים בפורמט שתי ספרות אחרי הנקודה.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n| סימול | חברה | שינוי מאז הכניסה % | שינוי יומי % | פער ליעד קונסנזוס % | טווח תשואה חזוי 12ח' % [מינ-מקס] | סטטוס (חיובי/נייטרלי/שלילי) | קטליזטור קרוב | פעולה מיידית |\n\nחישובים:\n- פער ליעד קונסנזוס % = ((יעד קונסנזוס - מחיר נוכחי) / מחיר נוכחי) * 100.\n- טווח תשואה חזוי 12ח' % = [((יעד מינימום - מחיר נוכחי) / מחיר נוכחי) * 100, ((יעד מקסימום - מחיר נוכחי) / מחיר נוכחי) * 100].\n- בפלט מציגים רק את האחוזים, לא את המחירים עצמם.\n\n2. אחרי הטבלה כתוב \"מקורות:\" ואז רשימת מקורות:\n- TICKER: מקור - מה אומת ממנו (תאריך בדיקה: YYYY-MM-DD) - URL מלא\n\nאין להוסיף טקסט מעבר לטבלה ולמקורות.\n`,
        },
        {
          key: 'risk',
          title: t.aiPrompts.templates.riskFocus,
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט סיכונים למניות. הפלט חייב להיות באחוזים בלבד.\n\nמטרה:\nלסווג כל סימול להזדמנות/נייטרלי/סיכון לפי מדדי אחוזים בלבד.\n\nכללים מחייבים:\n1. ללא מחירים וללא סכומי כסף בפלט.\n2. ללא רווח/הפסד כספי, רק אחוזים.\n3. אם נתון חסר: \"לא זמין\".\n4. אחוזים עם שתי ספרות אחרי הנקודה.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n| סימול | חברה | שינוי מאז הכניסה % | מרחק משיא 52ש' % | מרחק משפל 52ש' % | פער ליעד קונסנזוס % | מצב (הזדמנות/נייטרלי/סיכון) | נימוק קצר | טריגר לבדיקה חוזרת | דחיפות |\n\nחישובים:\n- מרחק משיא 52ש' % = ((מחיר נוכחי - שיא 52ש') / שיא 52ש') * 100.\n- מרחק משפל 52ש' % = ((מחיר נוכחי - שפל 52ש') / שפל 52ש') * 100.\n- פער ליעד קונסנזוס % = ((יעד קונסנזוס - מחיר נוכחי) / מחיר נוכחי) * 100.\n- בפלט מציגים רק את האחוזים.\n\n2. אחרי הטבלה כתוב \"מקורות:\" ואז רשימת מקורות:\n- TICKER: מקור - מה אומת ממנו (תאריך בדיקה: YYYY-MM-DD) - URL מלא\n\nאין להוסיף טקסט מעבר לטבלה ולמקורות.\n`,
        },
        {
          key: 'research',
          title: t.aiPrompts.templates.research,
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט מחקר שמכין תוכנית עבודה לרבעון הקרוב, באחוזים בלבד.\n\nמטרה:\nלהחזיר טבלת מחקר פרקטית בלי שום סכום כספי.\n\nכללים מחייבים:\n1. כל נתון מספרי חייב להיות באחוזים.\n2. אין מחירים, אין מטבע, אין רווח/הפסד כספי.\n3. אם נתון חסר: \"לא זמין\".\n4. אחוזים עם שתי ספרות אחרי הנקודה.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n| סימול | שינוי מאז הכניסה % | טווח תשואה חזוי 12ח' % [מינ-מקס] | KPI-ים באחוזים למעקב | תרחיש בסיס % | תרחיש לחץ % | 3 שאלות קריטיות לדוח הבא | משימות מחקר P1/P2/P3 |\n\nכללי תוכן:\n- בעמודת KPI-ים: 3 עד 5 מדדים באחוזים, מופרדים ב-';'.\n- בעמודת 3 שאלות קריטיות: בדיוק 3 שאלות קצרות מופרדות ב-';'.\n- בעמודת משימות מחקר: בדיוק 3 משימות בפורמט 'P1: ...; P2: ...; P3: ...'.\n\n2. אחרי הטבלה כתוב \"מקורות:\" ואז רשימת מקורות:\n- TICKER: מקור - מה אומת ממנו (תאריך בדיקה: YYYY-MM-DD) - URL מלא\n\nאין להוסיף טקסט מעבר לטבלה ולמקורות.\n`,
        },
      ];
    }

    const rulesEn = {
      quick: `${baseContext}\n${tagLine}\nYou are a stocks analyst with internet access. Use reliable sources only.\n\nGoal:\nReturn a short analysis in percentages only, with no prices and no money amounts.\n\nHard rules:\n1. Do not show prices, currency values, or money P/L.\n2. Every numeric output must be a percentage.\n3. If data is missing: \"Not available\" or \"Needs verification\".\n4. Percentages must use two decimals.\n5. Output in English only.\n\nOutput format:\n1. One Markdown table with columns:\n| Ticker | Company | Change vs entry % | Daily change % | Gap to consensus target % | 12M expected return range % [min-max] | Status (Positive/Neutral/Negative) | Next catalyst | Immediate action |\n\nFormulas:\n- Gap to consensus % = ((Consensus target - Current price) / Current price) * 100.\n- 12M expected return range % = [((Target min - Current price) / Current price) * 100, ((Target max - Current price) / Current price) * 100].\n- Show percentages only in output.\n\n2. After the table, add \"Sources:\" and list:\n- TICKER: Source - what it validated (Checked: YYYY-MM-DD) - full URL\n\nDo not output anything beyond the table and sources.\n`,
      risk: `${baseContext}\n${tagLine}\nYou are an equity risk analyst. Output must be percentages only.\n\nGoal:\nClassify each ticker as Opportunity/Neutral/Risk using percentage metrics only.\n\nHard rules:\n1. No prices and no money amounts in output.\n2. No money profit/loss references, only percentages.\n3. Missing data must be \"Not available\".\n4. Percentages with two decimals.\n5. Output in English only.\n\nOutput format:\n1. One Markdown table with columns:\n| Ticker | Company | Change vs entry % | Distance from 52W high % | Distance from 52W low % | Gap to consensus target % | Stance (Opportunity/Neutral/Risk) | Short rationale | Re-check trigger | Urgency |\n\nFormulas:\n- Distance from 52W high % = ((Current price - 52W high) / 52W high) * 100.\n- Distance from 52W low % = ((Current price - 52W low) / 52W low) * 100.\n- Gap to consensus % = ((Consensus target - Current price) / Current price) * 100.\n- Show percentages only in output.\n\n2. After the table, add \"Sources:\" and list:\n- TICKER: Source - what it validated (Checked: YYYY-MM-DD) - full URL\n\nDo not output anything beyond the table and sources.\n`,
      research: `${baseContext}\n${tagLine}\nYou are a research analyst preparing a quarterly plan in percentages only.\n\nGoal:\nReturn a practical research table with no money amounts.\n\nHard rules:\n1. Every numeric value must be a percentage.\n2. No prices, no currency, no money P/L.\n3. Missing data must be \"Not available\".\n4. Percentages with two decimals.\n5. Output in English only.\n\nOutput format:\n1. One Markdown table with columns:\n| Ticker | Change vs entry % | 12M expected return range % [min-max] | KPI percentages to track | Base scenario % | Stress scenario % | 3 critical questions for next earnings call | Research tasks P1/P2/P3 |\n\nContent constraints:\n- KPI percentages column: 3-5 percentage KPIs separated by ';'.\n- Critical questions column: exactly 3 short questions separated by ';'.\n- Research tasks column: exactly 'P1: ...; P2: ...; P3: ...'.\n\n2. After the table, add \"Sources:\" and list:\n- TICKER: Source - what it validated (Checked: YYYY-MM-DD) - full URL\n\nDo not output anything beyond the table and sources.\n`,
    };

    return [
      { key: 'quick', title: t.aiPrompts.templates.quickForecast, prompt: rulesEn.quick },
      { key: 'risk', title: t.aiPrompts.templates.riskFocus, prompt: rulesEn.risk },
      { key: 'research', title: t.aiPrompts.templates.research, prompt: rulesEn.research },
    ];
  }, [baseContext, locale, tagLine, t.aiPrompts.templates]);

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

  const copyContext = useCallback(() => {
    void handleCopy(positionsContext);
  }, [handleCopy, positionsContext]);

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
        exclude: ['dashboard', 'insights', 'portfolio', 'realized', 'watchlist', 'positions', 'aiPrompts', 'settings'],
        overrides: {
          reload: {
            onClick: reload,
            disabled: loading || refreshing,
          },
        },
      }),
    [t, reload, loading, refreshing]
  );

  const hasPositions = openMetrics.length > 0;

  const infoItems = useMemo(
    () =>
      locale === 'he'
        ? [
            { icon: ShieldCheck, title: 'רק נתונים אמיתיים', desc: 'אין לנחש או להשלים מספרים — משתמשים רק במה שמופיע במקורות.' },
            { icon: Globe2, title: 'מקורות אמינים בלבד', desc: 'אתרי פיננסים גדולים, דוחות רשמיים ו-IR. ציין מקור ותאריך בדיקה.' },
            { icon: CheckCircle2, title: 'טבלאות תמציתיות', desc: 'אין טקסט חופשי נוסף — רק טבלה ורשימת מקורות.' },
          ]
        : [
            { icon: ShieldCheck, title: 'Real data only', desc: 'No guessing or invented numbers — rely on source-backed data.' },
            { icon: Globe2, title: 'Trusted sources', desc: 'Major finance sites, filings, and IR with explicit source and date.' },
            { icon: CheckCircle2, title: 'Concise tables', desc: 'No extra prose — just the table and the sources list.' },
          ],
    [locale]
  );

  const statChips = useMemo(
    () => [
      {
        label: locale === 'he' ? 'פוזיציות פעילות' : 'Active positions',
        value: openMetrics.length,
      },
      {
        label: locale === 'he' ? 'כמות טאגים' : 'Tags count',
        value: allTags.length,
      },
      {
        label: locale === 'he' ? 'עדכון אחרון' : 'Last refresh',
        value: lastUpdate
          ? lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })
          : locale === 'he'
            ? 'עדיין לא עודכן'
            : 'Not updated yet',
      },
    ],
    [allTags.length, lastUpdate, locale, openMetrics.length]
  );

  const templateNotes = useMemo(
    () =>
      locale === 'he'
        ? {
            quick: {
              badge: 'מהיר',
              detail: 'נותן תמונת מצב מיידית עם אפסייד, קטליזטור קרוב ופעולת מעקב.',
            },
            risk: {
              badge: 'איזון סיכון',
              detail: 'מסווג כל מניה להזדמנות/נייטרלי/סיכון עם טריגר בדיקה חוזרת.',
            },
            research: {
              badge: 'מחקר עמוק',
              detail: 'בונה תוכנית מחקר לרבעון עם KPI ושכבות עדיפות P1/P2/P3.',
            },
          }
        : {
            quick: {
              badge: 'Fast',
              detail: 'Quick snapshot with upside, next catalyst, and immediate follow-up.',
            },
            risk: {
              badge: 'Risk frame',
              detail: 'Classifies each ticker into opportunity/neutral/risk with re-check triggers.',
            },
            research: {
              badge: 'Deep research',
              detail: 'Builds a quarterly plan with KPI tracking and P1/P2/P3 tasks.',
            },
          },
    [locale]
  );

  return (
    <DashboardPageShell direction={direction}>
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-[2rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-6 shadow-sm sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--color-primary-500)] via-[var(--color-sky-600)] to-[var(--color-emerald-500)]" />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-primary-050)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                  <Sparkles className="h-4 w-4" />
                  <span>{t.aiPrompts.quickAction}</span>
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-black tracking-tight text-[var(--color-primary-900)] sm:text-4xl">
                    {t.aiPrompts.title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                    {t.aiPrompts.subtitle}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--color-slate-600)]">
                  {statChips.map((chip) => (
                    <span
                      key={chip.label}
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/85 px-3 py-1.5 text-[var(--color-slate-600)] shadow-sm"
                    >
                      <span>{chip.label}</span>
                      <span className="font-semibold text-[var(--color-primary-900)]">{chip.value}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-slate-600)]">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/85 px-3 py-1.5 shadow-sm">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {locale === 'he' ? 'מבוסס נתונים אמיתיים בלבד' : 'Source-backed only'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/85 px-3 py-1.5 shadow-sm">
                    <Globe2 className="h-3.5 w-3.5" />
                    {locale === 'he' ? 'מוכן להדבקה ולשימוש חוזר' : 'Ready to paste and reuse'}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-slate-500)]">
                    {locale === 'he' ? 'פוזיציות פעילות' : 'Active positions'}
                  </p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-[var(--color-primary-900)]">
                    {openMetrics.length}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-slate-600)]">
                    {hasPositions
                      ? locale === 'he'
                        ? 'זו נקודת ההתחלה ליצירת כל פרומפט.'
                        : 'This is the starting point for every prompt.'
                      : locale === 'he'
                        ? 'אין כרגע פוזיציות פעילות.'
                        : 'No active positions are available right now.'}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-slate-500)]">
                    {locale === 'he' ? 'טאגים מאוגדים' : 'Curated tags'}
                  </p>
                  <p className="mt-2 text-3xl font-black tracking-tight text-[var(--color-primary-900)]">
                    {allTags.length}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-slate-600)]">
                    {locale === 'he'
                      ? 'מקטין רעש ומייצר קונספט עבודה יציב.'
                      : 'Keeps noise down and gives the model a stable work frame.'}
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 p-4 shadow-sm sm:col-span-2 xl:col-span-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-slate-500)]">
                        {locale === 'he' ? 'רענון אחרון' : 'Last refresh'}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--color-slate-700)]">
                        {lastUpdate
                          ? lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : locale === 'he'
                            ? 'עדיין לא עודכן'
                          : 'Not updated yet'}
                      </p>
                    </div>
                    <div className="rounded-full bg-[color:var(--color-primary-050)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary-700)]">
                      {loading || refreshing
                        ? locale === 'he'
                          ? 'מתעדכן'
                          : 'Refreshing'
                        : locale === 'he'
                          ? 'מוכן'
                        : 'Ready'}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-slate-600)]">
                    {locale === 'he'
                      ? 'בלוק ההקשר נשמר עקבי בין כל התבניות, ולכן קל לשחזר פרומפטים טובים.'
                      : 'The context block stays consistent across templates, which makes good prompts easy to reuse.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <QuickActionsSection
            title={t.dashboard.quickActions}
            description={locale === 'he' ? 'פעולות ייעודיות לזרימת הפרומפטים במסך הזה.' : 'Screen-specific actions for the prompt workflow.'}
            actions={quickActions}
          />

          <section className="grid gap-4 lg:grid-cols-3">
            {infoItems.map((item) => {
              const Icon = item.icon;

              return (
                <Card
                  key={item.title}
                  className="overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm"
                >
                  <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)] shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <CardDescription className="text-sm leading-6 text-[var(--color-slate-600)]">
                        {item.desc}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
            <Card className="overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
              <CardHeader className="space-y-4 border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{t.aiPrompts.contextTitle}</CardTitle>
                    <CardDescription className="max-w-2xl">
                      {loading ? t.aiPrompts.loading : t.aiPrompts.contextHelper}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-primary-200)] bg-[color:var(--color-primary-050)] px-3 py-1 text-xs font-medium text-[var(--color-primary-700)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
                      {hasPositions
                        ? locale === 'he'
                          ? `${openMetrics.length} פוזיציות פעילות`
                          : `${openMetrics.length} active positions`
                        : t.aiPrompts.empty}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyContext}
                      className="w-full rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/80 text-[var(--color-slate-700)] shadow-sm hover:bg-[color:var(--color-primary-050)] sm:w-auto"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {locale === 'he' ? 'העתק בלוק' : 'Copy block'}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-medium text-[var(--color-slate-500)]">
                  <span className="w-full rounded-full bg-[color:var(--color-primary-050)] px-3 py-1 text-center text-[var(--color-primary-700)] sm:w-auto">
                    {locale === 'he' ? 'מקור נתונים' : 'Source data'}
                  </span>
                  <span className="w-full rounded-full bg-[color:var(--color-slate-100)] px-3 py-1 text-center text-[var(--color-slate-600)] sm:w-auto">
                    {locale === 'he' ? 'טקסט מוכן להדבקה' : 'Paste-ready text'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <Textarea
                  value={positionsContext}
                  readOnly
                  className="min-h-[260px] resize-none border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 font-mono text-[13px]"
                />
                <div className="flex flex-col gap-2 border-t border-[color:var(--color-slate-200)]/70 pt-4 text-xs text-[var(--color-slate-600)] sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
                    {lastUpdate
                      ? `${t.app.updated}: ${lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`
                      : t.app.updated}
                  </span>
                  <span>
                    {hasPositions
                      ? locale === 'he'
                        ? 'העתק את הבלוק הזה לכל תבנית כדי לשמור על עקביות.'
                        : 'Reuse this block across templates to keep prompts consistent.'
                      : locale === 'he'
                        ? 'אין פוזיציות פעילות כרגע.'
                        : 'No active positions right now.'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
                <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70">
                  <CardTitle>{t.aiPrompts.tagsTitle}</CardTitle>
                  <CardDescription>{t.aiPrompts.tagsHelper}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 p-5 sm:p-6">
                  {allTags.length === 0 ? (
                    <p className="text-sm text-[var(--color-slate-600)]">{t.aiPrompts.tagsEmpty}</p>
                  ) : (
                    allTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="border border-[color:var(--color-primary-100)] bg-[color:var(--color-neutral-white)] text-[var(--color-primary-900)] shadow-sm"
                      >
                        {tag}
                      </Badge>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm">
                <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70">
                  <CardTitle>{locale === 'he' ? 'מה ייכנס ל-AI' : 'What the AI receives'}</CardTitle>
                  <CardDescription>
                    {locale === 'he'
                      ? 'בלוק מובנה עם סימול, שינויים באחוזים ותגיות בלבד (ללא סכומים כספיים).'
                      : 'A structured block with ticker, percentage metrics, and tags only (no money amounts).'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5 text-sm text-[var(--color-slate-700)] sm:p-6">
                  <div className="rounded-2xl border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] px-4 py-3 text-xs font-medium text-[var(--color-primary-900)] shadow-inner">
                    {tagLine}
                  </div>
                  <p className="text-xs leading-5 text-[var(--color-slate-600)]">
                    {locale === 'he'
                      ? 'הבלוק נשאר קצר, עקבי ונוח להדבקה בכל פרומפט.'
                      : 'The block stays short, consistent, and easy to paste into every prompt.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-[var(--color-primary-900)]">
                  {t.aiPrompts.templatesTitle}
                </h2>
                <p className="text-sm leading-6 text-[var(--color-slate-600)]">
                  {locale === 'he'
                    ? 'כל תבנית כבר בנויה עם הקשר, הגבלות פלט, ומבנה מוכן.'
                    : 'Each template is already built with context, output constraints, and a ready-made structure.'}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="w-fit border border-[color:var(--color-primary-100)] bg-[color:var(--color-neutral-white)] text-[var(--color-primary-700)] shadow-sm"
              >
                {aiTemplates.length} {locale === 'he' ? 'תבניות' : 'templates'}
              </Badge>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {aiTemplates.map((template) => (
                <Card
                  key={template.key}
                  className="group relative flex flex-col overflow-hidden border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 shadow-sm"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--color-primary-500)] via-[var(--color-sky-600)] to-[var(--color-emerald-500)]" />
                  <CardHeader className="flex flex-col gap-3 border-b border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)]/70 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <Badge
                        variant="secondary"
                        className="w-fit border border-[color:var(--color-primary-100)] bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)] shadow-sm"
                      >
                        {templateNotes[template.key as keyof typeof templateNotes].badge}
                      </Badge>
                      <div>
                        <CardTitle className="text-lg">{template.title}</CardTitle>
                        <CardDescription className="mt-1 text-sm leading-6 text-[var(--color-slate-600)]">
                          {templateNotes[template.key as keyof typeof templateNotes].detail}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(template.prompt)}
                      aria-label={t.aiPrompts.copy}
                      className="shrink-0 self-start rounded-full border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)]/80 shadow-sm"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
                    <Textarea
                      value={template.prompt}
                      readOnly
                      className="min-h-[260px] resize-none border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 font-mono text-[13px]"
                    />
                    <div className="flex flex-col gap-2 text-xs text-[var(--color-slate-500)] sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {template.key === 'quick'
                          ? locale === 'he'
                            ? 'הכי טוב להתחלה מהירה.'
                            : 'Best for a fast start.'
                          : template.key === 'risk'
                            ? locale === 'he'
                              ? 'מסמן מה לבדוק קודם.'
                              : 'Highlights what to inspect first.'
                            : locale === 'he'
                              ? 'בנוי לתחקיר עמוק ומסודר.'
                              : 'Built for deep, structured research.'}
                      </span>
                      <span className="rounded-full bg-[color:var(--color-slate-100)] px-2.5 py-1 font-medium text-[var(--color-slate-600)]">
                        {locale === 'he' ? 'מוכן לשימוש' : 'Ready'}
                      </span>
                    </div>
                    <Button
                      onClick={() => handleCopy(template.prompt)}
                      className="w-full rounded-full bg-[var(--color-primary-600)] text-white shadow-sm hover:bg-[var(--color-primary-700)]"
                    >
                      {t.aiPrompts.copy}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardPageShell>
  );
}
