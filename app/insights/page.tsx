'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useApp } from '@/lib/context';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { buildWeeklyActionItems, buildWeeklyMovers, buildWeeklySnapshot } from '@/lib/weekly-insights';
import { useTranslation } from '@/lib/translations';
import { formatLastUpdatedTime, formatSignedValue } from '@/lib/utils/portfolio-display';

export default function InsightsPage() {
  const { locale } = useApp();
  const isRtl = locale === 'he';
  const { t } = useTranslation(locale);
  const {
    loading,
    refreshing,
    metrics,
    summary,
    usdToIls,
    sparklineData,
    portfolioTimeline,
    lastUpdate,
    reload,
  } = usePortfolioData();

  const labels = useMemo(
    () =>
      locale === 'he'
        ? {
            title: 'Insights שבועי',
            subtitle: 'סיכום אוטומטי: מה השתנה השבוע, מה דורש פעולה, ומה השתפר או החמיר.',
            weeklyChange: 'שינוי נטו השבוע',
            forecastGap: 'פער מול התחזית (שבועי)',
            dailyMomentum: 'מומנטום נוכחי',
            whatChanged: 'מה השתנה השבוע',
            needsAction: 'מה דורש פעולה',
            improved: 'מה השתפר',
            worsened: 'מה החמיר',
            noData: 'אין מספיק נתונים שבועיים להצגה כרגע.',
            noAction: 'אין פריטים דחופים השבוע.',
            noImproved: 'לא זוהו שיפורים משמעותיים השבוע.',
            noWorsened: 'לא זוהו החמרות משמעותיות השבוע.',
            laggingGap: 'פער שלילי מול תחזית',
            updated: 'עדכון אחרון',
            weeklySummaryTitle: 'סיכום שבועי',
            weeklySummaryFallback: 'הנתונים השבועיים יתעדכנו אוטומטית ככל שיצטברו נתוני היסטוריה.',
          }
        : {
            title: 'Weekly Insights',
            subtitle: 'Automated recap: what changed this week, what needs action, and what improved or worsened.',
            weeklyChange: 'Weekly net change',
            forecastGap: 'Weekly forecast gap',
            dailyMomentum: 'Current momentum',
            whatChanged: 'What changed this week',
            needsAction: 'What needs action',
            improved: 'What improved',
            worsened: 'What worsened',
            noData: 'Not enough weekly data is available yet.',
            noAction: 'No urgent action items this week.',
            noImproved: 'No significant improvements this week.',
            noWorsened: 'No significant deterioration this week.',
            laggingGap: 'Negative gap vs projection',
            updated: 'Last update',
            weeklySummaryTitle: 'Weekly summary',
            weeklySummaryFallback: 'Weekly insights update automatically as historical data accumulates.',
          },
    [locale]
  );

  const snapshot = useMemo(
    () => buildWeeklySnapshot(portfolioTimeline, summary),
    [portfolioTimeline, summary]
  );
  const actionItems = useMemo(() => buildWeeklyActionItems(metrics), [metrics]);
  const movers = useMemo(() => buildWeeklyMovers(metrics, sparklineData), [metrics, sparklineData]);

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
        include: ['reload'],
        overrides: {
          reload: {
            onClick: reload,
            disabled: loading || refreshing,
            iconClassName: loading || refreshing ? 'animate-spin' : undefined,
          },
        },
      }),
    [t, reload, loading, refreshing]
  );

  const summaryBullets = useMemo(() => {
    if (!summary || snapshot.currentTimestamp === null || snapshot.baselineTimestamp === null) {
      return [labels.weeklySummaryFallback];
    }

    const netChangeText = formatSignedValue(snapshot.netPnLDeltaUsd, (value) => formatCurrency(value, 'USD', locale));
    const forecastGapText = formatSignedValue(snapshot.forecastGapDeltaUsd, (value) => formatCurrency(value, 'USD', locale));
    const topAction = actionItems[0];
    const topImproved = movers.improved[0];
    const topWorsened = movers.worsened[0];

    const messages: string[] =
      locale === 'he'
        ? [
            `השבוע התיק השתנה ב-${netChangeText}, והפער מול התחזית עומד על ${forecastGapText}.`,
            topAction
              ? `דורש פעולה: ${topAction.position.display || topAction.position.symbol} נמצא מתחת לתחזית.`
              : 'אין מניות עם פער שלילי חריג מול התחזית.',
            topImproved
              ? `שיפור בולט: ${topImproved.display} (${formatSignedValue(topImproved.changeUsd, (value) =>
                  formatCurrency(value, 'USD', locale)
                )}).`
              : 'לא זוהה שיפור בולט השבוע.',
            topWorsened
              ? `החמרה בולטת: ${topWorsened.display} (${formatSignedValue(topWorsened.changeUsd, (value) =>
                  formatCurrency(value, 'USD', locale)
                )}).`
              : 'לא זוהתה החמרה בולטת השבוע.',
          ]
        : [
            `The portfolio moved by ${netChangeText} this week, with a forecast gap of ${forecastGapText}.`,
            topAction
              ? `Action needed: ${topAction.position.display || topAction.position.symbol} is lagging its projection.`
              : 'No position is showing a severe negative gap vs projection.',
            topImproved
              ? `Top improvement: ${topImproved.display} (${formatSignedValue(topImproved.changeUsd, (value) =>
                  formatCurrency(value, 'USD', locale)
                )}).`
              : 'No standout improvement this week.',
            topWorsened
              ? `Top deterioration: ${topWorsened.display} (${formatSignedValue(topWorsened.changeUsd, (value) =>
                  formatCurrency(value, 'USD', locale)
                )}).`
              : 'No standout deterioration this week.',
          ];

    return messages;
  }, [summary, snapshot, actionItems, movers, labels.weeklySummaryFallback, locale]);

  const updatedAtLabel = formatLastUpdatedTime(lastUpdate, locale);
  const currentRate = summary?.usdToIlsRate ?? usdToIls;
  const topAction = actionItems[0];
  const topImproved = movers.improved[0];
  const topWorsened = movers.worsened[0];
  const hasWeeklyContext = Boolean(
    summary && snapshot.currentTimestamp !== null && snapshot.baselineTimestamp !== null
  );
  const isActionableWeek = actionItems.length > 0;
  const readinessLabel = isActionableWeek
    ? labels.needsAction
    : locale === 'he'
      ? 'שבוע למעקב'
      : 'Monitor mode';
  const readinessToneClass = isActionableWeek
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const readinessAccentClass = isActionableWeek
    ? 'bg-rose-100 text-rose-700'
    : 'bg-emerald-100 text-emerald-700';
  const readinessMessage = isActionableWeek
    ? topAction
      ? locale === 'he'
        ? `${topAction.position.display || topAction.position.symbol} דורש בדיקה לפני סגירת השבוע.`
        : `${topAction.position.display || topAction.position.symbol} needs review before week close.`
      : labels.noAction
    : locale === 'he'
      ? 'אין אותות חריגים שמצריכים התערבות מיידית.'
      : 'No urgent signals require intervention right now.';

  return (
    <DashboardPageShell direction={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHero
          title={labels.title}
          subtitle={labels.subtitle}
          updatedLabel={labels.updated}
          lastUpdatedDisplay={updatedAtLabel}
          exchangeRateLabel="1 USD ≈"
          exchangeRateValue={formatCurrency(currentRate, 'ILS', locale)}
          quickActionsTitle={t.dashboard.quickActions}
          quickActions={quickActions}
        />

        <main className="mt-8 space-y-4">
          <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/92 p-4 shadow-sm sm:p-6">
            <div className="space-y-5">
              {loading ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 py-12 text-slate-500">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                  <p>{t.common.loading}</p>
                </div>
              ) : (
                <>
                  <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
                    <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm">
                      <CardHeader className="flex flex-col gap-3 border-b border-[color:var(--color-slate-200)]/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <CardDescription className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            {locale === 'he' ? 'תקציר מנהלים' : 'Executive brief'}
                          </CardDescription>
                          <CardTitle className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                            {labels.weeklySummaryTitle}
                          </CardTitle>
                        </div>
                        <span
                          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${readinessToneClass}`}
                        >
                          <Sparkles className="h-4 w-4" />
                          {hasWeeklyContext
                            ? locale === 'he'
                              ? 'סיכום שבועי מוכן'
                              : 'Weekly summary ready'
                            : labels.weeklySummaryTitle}
                        </span>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-5">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)] p-4 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {labels.weeklyChange}
                            </p>
                            <p
                              className={`mt-2 text-2xl font-semibold tracking-tight ${
                                snapshot.netPnLDeltaUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {formatSignedValue(snapshot.netPnLDeltaUsd, (value) => formatCurrency(value, 'USD', locale))}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)] p-4 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {labels.forecastGap}
                            </p>
                            <p
                              className={`mt-2 text-2xl font-semibold tracking-tight ${
                                snapshot.forecastGapDeltaUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {formatSignedValue(snapshot.forecastGapDeltaUsd, (value) => formatCurrency(value, 'USD', locale))}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)] p-4 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {labels.dailyMomentum}
                            </p>
                            <p
                              className={`mt-2 text-2xl font-semibold tracking-tight ${
                                snapshot.currentDailyMomentumUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {formatSignedValue(snapshot.currentDailyMomentumUsd, (value) => formatCurrency(value, 'USD', locale))}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 xl:grid-cols-2">
                          {summaryBullets.map((line, index) => (
                            <div
                              key={line}
                              className={`rounded-2xl border px-4 py-4 shadow-sm ${
                                index === 0
                                  ? 'border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-blue-50)]/60'
                                  : 'border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]'
                              }`}
                            >
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    index === 0 ? 'bg-[var(--color-primary-400)]' : 'bg-[var(--color-slate-300)]'
                                  }`}
                                />
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                  {index === 0
                                    ? locale === 'he'
                                      ? 'המסר המרכזי'
                                      : 'Lead signal'
                                    : locale === 'he'
                                      ? 'הערת הקשר'
                                      : 'Context note'}
                                </span>
                              </div>
                              <p className="text-balance text-sm leading-6 text-slate-700">{line}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm">
                      <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 pb-4">
                        <CardDescription className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          {locale === 'he' ? 'מוכנות לקבלת החלטה' : 'Decision readiness'}
                        </CardDescription>
                        <CardTitle className="text-xl font-semibold tracking-tight text-slate-900">
                          {readinessLabel}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-5">
                        <div className={`rounded-2xl border p-4 shadow-sm ${readinessToneClass}`}>
                          <div className="flex items-start gap-3">
                            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${readinessAccentClass}`}>
                              <Sparkles className="h-5 w-5" />
                            </span>
                            <div className="space-y-2">
                              <p className="text-balance text-sm font-semibold">{readinessMessage}</p>
                              <p className="text-balance text-xs leading-5 opacity-80">
                                {locale === 'he'
                                  ? 'התצוגה הזו נועדה להצביע מיידית האם צריך לעקוב, לבדוק או לפעול.'
                                  : 'This view is tuned to show whether you should monitor, inspect, or act.'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500">
                                {labels.needsAction}
                              </p>
                              <p className="mt-1 text-balance text-sm font-medium text-slate-800">
                                {topAction
                                  ? `${topAction.position.display || topAction.position.symbol} · ${formatSignedValue(topAction.combined, (value) =>
                                      formatCurrency(value, 'USD', locale)
                                    )}`
                                  : labels.noAction}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500">
                                {labels.improved}
                              </p>
                              <p className="mt-1 text-balance text-sm font-medium text-slate-800">
                                {topImproved
                                  ? `${topImproved.display} · ${formatSignedValue(topImproved.changeUsd, (value) =>
                                      formatCurrency(value, 'USD', locale)
                                    )}`
                                  : labels.noImproved}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                            <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500">
                                {labels.worsened}
                              </p>
                              <p className="mt-1 text-balance text-sm font-medium text-slate-800">
                                {topWorsened
                                  ? `${topWorsened.display} · ${formatSignedValue(topWorsened.changeUsd, (value) =>
                                      formatCurrency(value, 'USD', locale)
                                    )}`
                                  : labels.noWorsened}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  <section className="grid gap-4 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
                    <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm">
                      <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 pb-4">
                        <CardDescription className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          {locale === 'he' ? 'מה חשוב עכשיו' : 'What matters now'}
                        </CardDescription>
                        <CardTitle className="text-lg tracking-tight text-slate-900">
                          {labels.needsAction}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-5">
                        {!actionItems.length ? (
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-4">
                            <p className="text-balance text-sm leading-6 text-slate-600">{labels.noAction}</p>
                          </div>
                        ) : (
                          actionItems.map((item, index) => (
                            <div
                              key={item.position.activationId ?? item.position.id ?? item.position.symbol}
                              className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                                  {index + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-balance font-semibold leading-tight text-slate-800">
                                    {item.position.display || item.position.symbol}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {locale === 'he' ? 'פער מול התחזית' : 'Gap vs projection'}
                                  </p>
                                </div>
                              </div>
                              <Badge className="w-fit bg-rose-100 text-rose-700">
                                {labels.laggingGap}:{' '}
                                {formatSignedValue(item.combined, (value) => formatCurrency(value, 'USD', locale))}
                              </Badge>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm">
                      <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 pb-4">
                        <CardDescription className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          {locale === 'he' ? 'תוספת שקטה' : 'Quiet signal rail'}
                        </CardDescription>
                        <CardTitle className="text-lg tracking-tight text-slate-900">
                          {locale === 'he' ? 'תמונת החלטה מהירה' : 'Quick decision snapshot'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-5">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] p-4 text-center shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {locale === 'he' ? 'פעולות' : 'Actions'}
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{actionItems.length}</p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] p-4 text-center shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {labels.improved}
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-emerald-600">{movers.improved.length}</p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] p-4 text-center shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {labels.worsened}
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-rose-600">{movers.worsened.length}</p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-blue-50)]/60 p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary-500)]" />
                            <div className="space-y-1">
                              <p className="text-balance text-sm font-semibold text-slate-800">
                                {locale === 'he'
                                  ? 'אפשר לסרוק את הדף הזה בלי להרגיש מוצף'
                                  : 'This page stays scan-friendly under pressure'}
                              </p>
                              <p className="text-balance text-sm leading-6 text-slate-600">
                                {locale === 'he'
                                  ? 'הפאנל הזה מרכז את רמת הדחיפות והכיוון השבועי בלי להפריע לזרימת הקריאה.'
                                  : 'The rail centralizes urgency and weekly direction without interrupting the reading flow.'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-4 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            {labels.updated}
                          </p>
                          <p className="mt-2 text-balance text-sm leading-6 text-slate-700">
                            {updatedAtLabel ?? (locale === 'he' ? 'לא זמין' : 'Not available')}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  <section className="grid gap-4 xl:grid-cols-2">
                    <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm">
                      <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 pb-4">
                        <CardDescription className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          {locale === 'he' ? 'שיפור' : 'Improvement'}
                        </CardDescription>
                        <CardTitle className="text-lg tracking-tight text-slate-900">{labels.improved}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-5">
                        {!movers.improved.length ? (
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-4">
                            <p className="text-sm leading-6 text-slate-600">{labels.noImproved}</p>
                          </div>
                        ) : (
                          movers.improved.map((item) => (
                            <div
                              key={item.key}
                              className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                                <span className="text-balance font-medium leading-tight text-slate-800">{item.display}</span>
                              </div>
                              <div className="text-left text-sm text-emerald-700 rtl:text-right">
                                <div>{formatSignedValue(item.changeUsd, (value) => formatCurrency(value, 'USD', locale))}</div>
                                <div className="text-xs">{formatSignedValue(item.changePercent, (value) => formatPercent(value, locale))}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm">
                      <CardHeader className="border-b border-[color:var(--color-slate-200)]/70 pb-4">
                        <CardDescription className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          {locale === 'he' ? 'החמרה' : 'Deterioration'}
                        </CardDescription>
                        <CardTitle className="text-lg tracking-tight text-slate-900">{labels.worsened}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-5">
                        {!movers.worsened.length ? (
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-slate-50)] px-4 py-4">
                            <p className="text-sm leading-6 text-slate-600">{labels.noWorsened}</p>
                          </div>
                        ) : (
                          movers.worsened.map((item) => (
                            <div
                              key={item.key}
                              className="flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <ArrowDownRight className="h-4 w-4 text-rose-600" />
                                <span className="text-balance font-medium leading-tight text-slate-800">{item.display}</span>
                              </div>
                              <div className="text-left text-sm text-rose-700 rtl:text-right">
                                <div>{formatSignedValue(item.changeUsd, (value) => formatCurrency(value, 'USD', locale))}</div>
                                <div className="text-xs">{formatSignedValue(item.changePercent, (value) => formatPercent(value, locale))}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </section>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    </DashboardPageShell>
  );
}
