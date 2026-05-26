'use client';

import { useMemo } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';

import { DashboardHero } from '@/components/dashboard/dashboard-hero';
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
        exclude: ['insights'],
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

  return (
    <div className="home-dashboard relative min-h-screen overflow-hidden bg-[var(--color-primary-050)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--color-primary-025)] via-[var(--color-primary-010)] to-[var(--color-primary-005)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(var(--color-primary-400-rgb),0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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

          <main className="mt-10">
            <section className="home-main-surface relative overflow-hidden rounded-3xl border px-4 py-8 shadow-xl glass-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-20 -top-10 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(var(--color-blue-500-rgb),0.16),_transparent_68%)] blur-3xl" />
              <div className="relative z-10 space-y-8">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : (
                  <>
                    <section className="grid gap-4 md:grid-cols-3">
                      <Card className="border-[color:var(--color-primary-100)]">
                        <CardHeader className="pb-2">
                          <CardDescription>{labels.weeklyChange}</CardDescription>
                          <CardTitle className={snapshot.netPnLDeltaUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatSignedValue(snapshot.netPnLDeltaUsd, (value) => formatCurrency(value, 'USD', locale))}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="border-[color:var(--color-primary-100)]">
                        <CardHeader className="pb-2">
                          <CardDescription>{labels.forecastGap}</CardDescription>
                          <CardTitle className={snapshot.forecastGapDeltaUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatSignedValue(snapshot.forecastGapDeltaUsd, (value) => formatCurrency(value, 'USD', locale))}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card className="border-[color:var(--color-primary-100)]">
                        <CardHeader className="pb-2">
                          <CardDescription>{labels.dailyMomentum}</CardDescription>
                          <CardTitle className={snapshot.currentDailyMomentumUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatSignedValue(snapshot.currentDailyMomentumUsd, (value) => formatCurrency(value, 'USD', locale))}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-3">
                      <Card className="lg:col-span-1">
                        <CardHeader>
                          <CardTitle>{labels.weeklySummaryTitle}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-slate-700">
                          {summaryBullets.map((line) => (
                            <p key={line} className="rounded-xl bg-slate-50 px-3 py-2">
                              {line}
                            </p>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="lg:col-span-2">
                        <CardHeader>
                          <CardTitle>{labels.needsAction}</CardTitle>
                          <CardDescription>{labels.whatChanged}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {!actionItems.length ? (
                            <p className="text-sm text-slate-500">{labels.noAction}</p>
                          ) : (
                            actionItems.map((item) => (
                              <div
                                key={item.position.activationId ?? item.position.id ?? item.position.symbol}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                                  <span className="font-semibold text-slate-800">{item.position.display || item.position.symbol}</span>
                                </div>
                                <Badge className="bg-rose-100 text-rose-700">
                                  {labels.laggingGap}:{' '}
                                  {formatSignedValue(item.combined, (value) => formatCurrency(value, 'USD', locale))}
                                </Badge>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>{labels.improved}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {!movers.improved.length ? (
                            <p className="text-sm text-slate-500">{labels.noImproved}</p>
                          ) : (
                            movers.improved.map((item) => (
                              <div
                                key={item.key}
                                className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                                  <span className="font-medium text-slate-800">{item.display}</span>
                                </div>
                                <div className="text-right text-sm text-emerald-700">
                                  <div>{formatSignedValue(item.changeUsd, (value) => formatCurrency(value, 'USD', locale))}</div>
                                  <div className="text-xs">{formatSignedValue(item.changePercent, (value) => formatPercent(value, locale))}</div>
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{labels.worsened}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {!movers.worsened.length ? (
                            <p className="text-sm text-slate-500">{labels.noWorsened}</p>
                          ) : (
                            movers.worsened.map((item) => (
                              <div
                                key={item.key}
                                className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <ArrowDownRight className="h-4 w-4 text-rose-600" />
                                  <span className="font-medium text-slate-800">{item.display}</span>
                                </div>
                                <div className="text-right text-sm text-rose-700">
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
      </div>
    </div>
  );
}
