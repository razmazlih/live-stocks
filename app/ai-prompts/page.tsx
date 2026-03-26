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
              detail: 'מתאים כשצריך תשובת כיוון קצרה על מחיר, פער ויעד.',
            },
            risk: {
              badge: 'איזון סיכון',
              detail: 'מסדר את התמונה בין הזדמנות, סיכון ודחיפות מעקב.',
            },
            research: {
              badge: 'מחקר עמוק',
              detail: 'מכין פרומפט עבודה מפורט לתחקיר והכנה לדיון.',
            },
          }
        : {
            quick: {
              badge: 'Fast',
              detail: 'Use when you need a quick direction on price, gap, and target.',
            },
            risk: {
              badge: 'Risk frame',
              detail: 'Balances opportunity, risk, and urgency in one pass.',
            },
            research: {
              badge: 'Deep research',
              detail: 'Prepares a detailed working prompt for analysis and review.',
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
            description={locale === 'he' ? 'קיצורי דרך לזרימת הפרומפטים.' : 'Shortcuts for the prompt workflow.'}
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
                      ? 'רק מחיר כניסה, מחיר נוכחי, תאריך כניסה וטאגים מעובדים.'
                      : 'Only entry price, current price, entry date, and curated tags.'}
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
