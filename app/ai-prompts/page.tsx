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
import { formatCurrency, formatDate } from '@/lib/calculations';
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
            entry: 'כניסה',
            current: 'מחיר נוכחי',
            entryDate: 'תאריך כניסה',
            tags: 'טאגים',
          }
        : {
            entry: 'Entry',
            current: 'Current price',
            entryDate: 'Entry date',
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
        const { position, currentPrice } = metric;
        const entry = formatCurrency(position.entryPrice, 'USD', locale);
        const current = formatCurrency(currentPrice, 'USD', locale);
        const entryDt = position.entryDate ? formatDate(position.entryDate, locale) : '';

        return `${position.display || position.symbol} (${position.symbol}) | ${contextLabels.entry} ${entry} | ${contextLabels.current} ${current} | ${contextLabels.entryDate} ${entryDt} | ${contextLabels.tags}: ${tags.join(', ')}`;
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
    const contextHeading = locale === 'he' ? 'נתוני פוזיציות:' : 'Positions data:';
    return `${contextHeading}\n${positionsContext}`;
  }, [locale, positionsContext]);

  const aiTemplates = useMemo(() => {
    if (locale === 'he') {
      return [
        {
          key: 'quick',
          title: t.aiPrompts.templates.quickForecast,
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט מניות שמחובר לאינטרנט ויכול לגשת רק למקורות מידע אמינים (כמו אתרי פיננסים גדולים, דוחות חברה, SEC/ISA, Investor Relations וכדומה).\n\nמטרה:\nלהחזיר טבלה אחת מסודרת עבור כל המניות שנשלחו אליך, המבוססת אך ורק על נתונים אמיתיים מעודכנים. אין להמציא מספרים, טווחים או סיפורים שלא מופיעים במקורות אמיתיים.\n\nהנחיות קריטיות:\n1. עבור כל מניה:\n   - בדוק מחיר נוכחי, היסטוריית מחיר רלוונטית, ומחירי יעד (12 חודשים) של אנליסטים, אם קיימים.\n   - אם מידע כלשהו לא קיים או לא עדכני, כתוב במפורש \"לא זמין\" או \"דורש אימות\" – אל תנחש.\n2. מחיר צפוי:\n   - אל תבנה מודל חיזוי משלך.\n   - השתמש רק בנתוני אמת, למשל:\n     - מחיר יעד קונסנזוס 12 חודשים של אנליסטים (אם קיים).\n     - טווח מחירי יעד (מינימום–מקסימום) מהאנליסטים השונים.\n   - אם אין מחירי יעד – ציין \"אין מחיר יעד קונסנזוס זמין\" ואל תמציא מספר.\n3. אל תוסיף טקסט חופשי לפני או אחרי הטבלה, חוץ מרשימת מקורות בסוף.\n4. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. קודם כל טבלת Markdown אחת, עם העמודות הבאות:\n\n| סימול | שם חברה | תאריך כניסה | מחיר כניסה | מחיר נוכחי | שינוי מאז הכניסה % | פרשנות קצרה לפער | מחיר יעד 12ח' (קונסנזוס, אם קיים) | טווח מחירי יעד 12ח' [מינ–מקס] | טווח מחיר לשנה אחרי תאריך הכניסה* | טווח מחיר לשנה מהיום* |\n\nהערות:\n- \"פרשנות קצרה לפער\" – משפט אחד בלבד.\n- העמודות שסומנו ב-* (\"טווח מחיר לשנה אחרי תאריך הכניסה\" ו\"טווח מחיר לשנה מהיום\") חייבות להיגזר ישירות ממחירי היעד האמיתיים:\n  - אם יש כמה מחירי יעד – השתמש בטווח [מינימום, מקסימום].\n  - אם יש רק מחיר יעד אחד – רשום [X, X].\n  - אם אין מחירי יעד – רשום \"לא זמין\" ולא תמציא טווח.\n\n2. אחרי הטבלה, כתוב כותרת \"מקורות:\" ואז רשימת מקורות בפורמט:\n- TICKER: שם האתר – תיאור קצר (תאריך בדיקה: YYYY-MM-DD) – URL מלא\n\nאל תכתוב שום דבר נוסף מלבד:\n1. הטבלה\n2. רשימת המקורות.\n`,
        },
        {
          key: 'risk',
          title: t.aiPrompts.templates.riskFocus,
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט מניות שמחובר לאינטרנט ויכול לגשת רק למקורות מידע אמינים (אתרי פיננסים גדולים, דוחות חברה, SEC/ISA, Investor Relations וכו').\n\nמטרה:\nלהעריך עבור כל מניה האם המצב הנוכחי ביחס למחיר הכניסה נראה יותר כהזדמנות, כסיכון, או כנייטרלי – על בסיס נתוני אמת בלבד – ולהחזיר את הכל בטבלה אחת.\n\nהנחיות קריטיות:\n1. השתמש רק בנתונים אמיתיים:\n   - מחיר נוכחי\n   - היסטוריית מחיר רלוונטית (לדוגמה: שיא/שפל 52 שבועות)\n   - מחירי יעד אנליסטים ל-12 חודשים (אם קיימים)\n   - מדדי סיכון פשוטים אם זמינים (למשל Beta, תנודתיות בסיסית)\n2. הגדר:\n   - \"הזדמנות\" – למשל אם המחיר הנוכחי נמוך משמעותית ממחירי יעד אמיתיים / ממכפלים היסטוריים, לפי המקורות.\n   - \"סיכון\" – למשל אם המחיר הנוכחי גבוה משמעותית ממחירי יעד או מהמכפילים ההיסטוריים.\n   - \"נייטרלי\" – כאשר אין סטייה משמעותית או שהנתונים אינם חד-משמעיים.\n3. מחיר צפוי:\n   - מבוסס רק על מחירי יעד של אנליסטים.\n   - אם קיימים מספר מחירי יעד – השתמש בטווח [מינימום, מקסימום].\n   - אם אין מחירי יעד – כתוב \"לא זמין\" ולא תציע טווח מומצא.\n4. אין להמציא מספרים, יחסים, או סיפורי השקעה שלא מבוססים במקורות.\n5. הפלט בעברית בלבד.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות:\n\n| סימול | שם חברה | מחיר כניסה | מחיר נוכחי | שינוי מאז הכניסה % | מצב (סיכון / הזדמנות / נייטרלי) | מה לחקור לעומק (משפט אחד) | מחיר יעד 12ח' (קונסנזוס, אם קיים) | טווח מחירי יעד 12ח' [מינ–מקס] | טווח מחיר לשנה אחרי תאריך הכניסה* | טווח מחיר לשנה מהיום* | דחיפות (מעקב צמוד / בדיקת עומק / שגרתי) |\n\nהעמודות עם * חייבות להיות מבוססות ישירות על נתוני מחירי היעד בלבד, בלי מודלים מומצאים:\n- כמה מחירי יעד → טווח [מינ, מקס].\n- מחיר יעד יחיד → [X, X].\n- אין יעד → \"לא זמין\".\n\n2. אחרי הטבלה, כתוב כותרת \"מקורות:\" ואז רשימת מקורות בפורמט:\n- TICKER: שם האתר – תיאור קצר (תאריך בדיקה: YYYY-MM-DD) – URL מלא\n\nאין להוסיף שום טקסט נוסף מעבר לטבלה ורשימת המקורות.\n`,
        },
        {
          key: 'research',
          title: t.aiPrompts.templates.research,
          prompt: `${baseContext}\n${tagLine}\nאתה אנליסט חיצוני שמטרתו להגדיר משימות מחקר עמוקות על מניות, על בסיס נתונים אמיתיים בלבד מהאינטרנט.\n\nמטרה:\nעבור כל מניה, להחזיר:\n1. טבלה אחת מסודרת (שורה לכל מניה) עם עמודת \"משימות מחקר\" (3–5 נקודות קצרות בתוך התא).\n2. כל המספרים, הטווחים והטענות יהיו מבוססי מקור בלבד.\n\nהנחיות קריטיות:\n1. השתמש רק בנתונים אמיתיים:\n   - מחיר נוכחי\n   - היסטוריית מחיר בסיסית (כיוון כללי מאז תאריך הכניסה)\n   - מחירי יעד אנליסטים (אם קיימים)\n   - מידע בסיסי מדוחות / חדשות מרכזיות (אם יש)\n2. \"השערת סיפור השקעה\" – חייבת להיות מבוססת על:\n   - תחום פעילות החברה\n   - טרנדים מרכזיים שמופיעים במקורות\n   - שינויי מחיר משמעותיים מהעבר\n   ולא על דמיון חופשי.\n3. \"סיכונים מרכזיים\" – רק כאלה שמופיעים במקורות (כמו תחרות, רגולציה, חוב, תלות בלקוח אחד וכו').\n4. מחיר צפוי:\n   - רק על בסיס מחירי יעד אנליסטים אמיתיים:\n     - טווח [מינ, מקס] של מחירי היעד ל-12 חודשים.\n   - אם אין מחירי יעד – רשום \"לא זמין\".\n5. אם חסר מידע – ציין זאת במפורש במקום להמציא.\n\nפורמט פלט:\n1. טבלת Markdown אחת עם העמודות הבאות:\n\n| סימול | שם חברה | תאריך כניסה | מחיר כניסה | מחיר נוכחי | שינוי מאז הכניסה % | השערת סיפור ההשקעה (מבוססת מקורות) | סיכונים מרכזיים (נקודות קצרות) | מה לבדוק בדוחות הבאים | טווח מחירי יעד 12ח' [מינ–מקס] | טווח מחיר לשנה אחרי תאריך הכניסה* | טווח מחיר לשנה מהיום* | משימות מחקר מומלצות (3–5 נקודות) |\n\nהעמודות עם * חייבות להיות נגזרות ישירות מטווח מחירי היעד:\n- יש טווח מחירי יעד → השתמש באותו טווח.\n- אין מחירי יעד → כתוב \"לא זמין\".\n\n2. אחרי הטבלה, כתוב כותרת \"מקורות:\" ואז רשימת מקורות בפורמט:\n- TICKER: שם האתר – תיאור קצר (תאריך בדיקה: YYYY-MM-DD) – URL מלא\n\nאל תכתוב שום חלק נוסף (אין צורך בהסברים איך חיפשת או מה המגבלות של המודל).\n`,
        },
      ];
    }

    const rulesEn = {
      quick: `${baseContext}\n${tagLine}\nYou are a stocks analyst with live internet access, limited to trustworthy sources (major finance sites, company filings, SEC/ISA, IR pages).\n\nGoal:\nReturn a single Markdown table for the tickers provided, based only on real, current data. Do not invent numbers, ranges, or narratives.\n\nCritical guidance:\n1. For each ticker:\n   - Pull current price, relevant price history, and 12-month analyst targets if they exist.\n   - If any data is missing/stale, state clearly \"Not available\" or \"Needs verification\" — no guessing.\n2. Expected price:\n   - Do not build your own model.\n   - Use only real targets, e.g. 12-month analyst consensus and min/max target range.\n   - If no targets exist, state \"No consensus target available\" and do not fabricate values.\n3. No free text before/after the table except a sources list.\n4. Output must be in English.\n\nOutput format:\n1. One Markdown table with columns:\n\n| Ticker | Company | Entry Date | Entry Price | Current Price | Change vs Entry % | Short gap interpretation | 12M Target (consensus if available) | 12M Target Range [min–max] | Price range one year after entry* | Price range one year from today* |\n\nNotes:\n- \"Short gap interpretation\" is a single sentence.\n- Columns marked * must derive directly from actual analyst targets:\n  - Multiple targets → use [min, max].\n  - Single target → [X, X].\n  - No targets → \"Not available\".\n\n2. After the table, add \"Sources:\" then a list:\n- TICKER: Site name – short description (Checked: YYYY-MM-DD) – full URL\n\nDo not write anything beyond the table and the sources list.\n`,
      risk: `${baseContext}\n${tagLine}\nYou are a stocks analyst with internet access to reputable sources only (major finance sites, filings, SEC/ISA, IR, etc.).\n\nGoal:\nAssess whether each position looks like an opportunity, a risk, or neutral versus its entry price, using real data only, and return one table.\n\nCritical guidance:\n1. Use only real data:\n   - Current price\n   - Relevant price history (e.g., 52-week high/low)\n   - 12-month analyst targets (if available)\n   - Simple risk markers if available (e.g., beta, basic volatility)\n2. Define:\n   - \"Opportunity\" if current price is materially below real targets/valuations.\n   - \"Risk\" if current price is materially above targets/valuations.\n   - \"Neutral\" when the gap is small or data is inconclusive.\n3. Expected price:\n   - Based only on analyst targets.\n   - Multiple targets → [min, max]. Single target → [X, X]. None → \"Not available\".\n4. Never invent numbers, ratios, or stories not backed by sources.\n5. Output must be in English.\n\nOutput format:\n1. One Markdown table with columns:\n\n| Ticker | Company | Entry Price | Current Price | Change vs Entry % | Stance (Risk / Opportunity / Neutral) | What to investigate (one sentence) | 12M Target (consensus if available) | 12M Target Range [min–max] | Price range one year after entry* | Price range one year from today* | Urgency (Close monitor / Deep dive / Routine) |\n\nColumns marked * must be based directly on analyst targets only.\n\n2. After the table, add \"Sources:\" then a list:\n- TICKER: Site name – short description (Checked: YYYY-MM-DD) – full URL\n\nDo not add any other text beyond the table and sources list.\n`,
      research: `${baseContext}\n${tagLine}\nYou are an external analyst defining deep-dive research tasks for stocks, based only on real internet data.\n\nGoal:\nFor each ticker, return:\n1. A single Markdown table (one row per ticker) with a \"Research tasks\" cell (3–5 concise bullets inside the cell).\n2. All numbers/ranges/claims must be source-based.\n\nCritical guidance:\n1. Use only real data:\n   - Current price\n   - Basic price history (overall trend since entry date)\n   - Analyst targets (if available)\n   - Core info from filings/news (if available)\n2. \"Investment story hypothesis\" must rely on:\n   - The company’s domain\n   - Macro/sector trends in sources\n   - Meaningful historical price moves\n   Not imagination.\n3. \"Key risks\" must come from sources (competition, regulation, debt, customer concentration, etc.).\n4. Expected price:\n   - Only from analyst targets: 12M target range [min, max]. If none, write \"Not available\".\n5. If data is missing, say so explicitly instead of inventing.\n\nOutput format:\n1. One Markdown table with columns:\n\n| Ticker | Company | Entry Date | Entry Price | Current Price | Change vs Entry % | Investment story hypothesis (source-based) | Key risks (short bullets) | What to inspect in upcoming reports | 12M Target Range [min–max] | Price range one year after entry* | Price range one year from today* | Recommended research tasks (3–5 bullets) |\n\nColumns marked * must be derived directly from the analyst target range.\n\n2. After the table, add \"Sources:\" then a list:\n- TICKER: Site name – short description (Checked: YYYY-MM-DD) – full URL\n\nDo not include anything else (no search explanations or model limitations).\n`,
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

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
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

  return (
    <DashboardPageShell direction={direction}>
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-10">
        <div className="flex flex-col gap-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-primary-900)] via-[var(--color-primary-700)] to-[var(--color-primary-500)] p-6 shadow-xl ring-1 ring-black/5">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
            <div className="relative flex flex-col gap-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                <Sparkles className="h-4 w-4" />
                <span>{t.aiPrompts.quickAction}</span>
              </div>
              <div className="flex flex-col gap-2 text-white">
                <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{t.aiPrompts.title}</h1>
                <p className="max-w-3xl text-sm text-white/80">{t.aiPrompts.subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {statChips.map((chip) => (
                  <div
                    key={chip.label}
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur ring-1 ring-white/20"
                  >
                    <span className="text-white/80">{chip.label}</span>
                    <span className="text-white">{chip.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <QuickActionsSection
            title={t.dashboard.quickActions}
            description={t.positions.quickActionsDescription}
            actions={quickActions}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader>
                <CardTitle>{t.aiPrompts.contextTitle}</CardTitle>
                <CardDescription>
                  {loading ? t.aiPrompts.loading : t.aiPrompts.contextHelper}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={positionsContext}
                  readOnly
                  className="min-h-[200px] resize-none border-[var(--color-primary-100)] bg-white/70 shadow-inner"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-slate-600)]">
                  <span className="inline-flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
                    {lastUpdate
                      ? `${t.app.updated}: ${lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`
                      : t.app.updated}
                  </span>
                  <span>
                    {hasPositions
                      ? (locale === 'he'
                          ? `${openMetrics.length} פוזיציות פעילות בפרומפט`
                          : `${openMetrics.length} active positions in prompt`)
                      : t.aiPrompts.empty}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{t.aiPrompts.tagsTitle}</CardTitle>
                <CardDescription>{t.aiPrompts.tagsHelper}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {allTags.length === 0 ? (
                  <p className="text-sm text-[var(--color-slate-600)]">{t.aiPrompts.tagsEmpty}</p>
                ) : (
                  allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-white text-[var(--color-primary-900)] ring-1 ring-[var(--color-primary-100)]"
                    >
                      {tag}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 shadow-sm">
              <CardHeader>
                <CardTitle>{locale === 'he' ? 'איך להשתמש בפרומפט' : 'How to use these prompts'}</CardTitle>
                <CardDescription>{locale === 'he' ? 'שמור על טבלאות נקיות ומקורות בדוקים.' : 'Keep outputs clean tables with verified sources.'}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {infoItems.map((item) => (
                  <div
                    key={item.title}
                    className="flex flex-col gap-1 rounded-xl border border-[var(--color-primary-100)] bg-white/80 p-3 shadow-inner"
                  >
                    <item.icon className="h-5 w-5 text-[var(--color-primary-700)]" />
                    <div className="text-sm font-semibold text-[var(--color-primary-950)]">{item.title}</div>
                    <div className="text-xs text-[var(--color-slate-600)]">{item.desc}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{locale === 'he' ? 'מה ייכנס ל-AI' : 'What the AI receives'}</CardTitle>
                <CardDescription>
                  {locale === 'he'
                    ? 'רק מחיר כניסה, מחיר נוכחי, תאריך כניסה וטאגים מעובדים.'
                    : 'Only entry price, current price, entry date, and curated tags.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[var(--color-slate-700)]">
                <div className="rounded-lg bg-[var(--color-primary-050)] px-3 py-2 text-xs text-[var(--color-primary-900)]">
                  {tagLine}
                </div>
                <p className="text-xs text-[var(--color-slate-600)]">
                  {locale === 'he'
                    ? 'העתק את הבלוק למטה ואז בחר את תבנית הפרומפט המתאימה.'
                    : 'Copy the block below, then choose a prompt template.'}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-3 shadow-sm">
              <CardHeader>
                <CardTitle>{t.aiPrompts.templatesTitle}</CardTitle>
                <CardDescription>{t.aiPrompts.subtitle}</CardDescription>
              </CardHeader>
            </Card>

            {aiTemplates.map((template) => (
              <Card key={template.key} className="flex flex-col shadow-sm ring-1 ring-[var(--color-primary-050)]">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-lg">{template.title}</CardTitle>
                    <CardDescription className="mt-1 text-sm text-[var(--color-slate-600)]">
                      {template.key === 'quick'
                        ? t.aiPrompts.templates.quickForecast
                        : template.key === 'risk'
                          ? t.aiPrompts.templates.riskFocus
                          : t.aiPrompts.templates.research}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(template.prompt)}
                    aria-label={t.aiPrompts.copy}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <Textarea value={template.prompt} readOnly className="min-h-[240px] resize-none" />
                  <Button onClick={() => handleCopy(template.prompt)} className="w-full">
                    {t.aiPrompts.copy}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}
