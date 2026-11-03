'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ArrowUpLeft, RefreshCw, Target } from 'lucide-react';

import {
  DashboardEmptyPanel,
  DashboardLoading,
  DashboardSurface,
} from '@/components/dashboard/page-primitives';
import {
  calculateSymbolExceptionAssessment,
  formatCurrency,
  formatPercent,
} from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import type { SymbolExceptionAssessment } from '@/types';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { formatSignedCurrency, getTrendTone } from '@/lib/utils/portfolio-display';

import { buildStockHref, rememberReturnContext } from '@/lib/navigation-context';

type AssessmentSection = 'open' | 'closed' | 'invalid';

function getAssessmentMagnitude(item: SymbolExceptionAssessment) {
  if (item.status === 'open') return Math.abs(item.currentGapUsd ?? item.gapUsd ?? 0);
  if (item.status === 'closed') return Math.abs(item.profitGapUsd);
  return Number.POSITIVE_INFINITY;
}

function getInvalidReason(
  reason: string | undefined,
  labels: {
    invalidLots: string;
    missingTarget: string;
    unknownCalculationIssue: string;
  },
) {
  if (reason === 'missing_lots' || reason === 'invalid_lot_data' || reason === 'unmatched_sell_lot' || reason === 'invalid_lot_type') {
    return labels.invalidLots;
  }
  if (reason === 'invalid_annual_growth_rate') return labels.missingTarget;
  return labels.unknownCalculationIssue;
}

export function TargetsPanel() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const { loading, positions, metrics } = usePortfolioData();

  const assessments = useMemo(() => {
    const positionsBySymbol = new Map<string, typeof positions>();
    const priceBySymbol = new Map<string, number>();

    positions.forEach((position) => {
      const symbol = position.symbol.trim().toUpperCase();
      positionsBySymbol.set(symbol, [...(positionsBySymbol.get(symbol) ?? []), position]);
    });

    metrics.forEach((metric) => {
      const symbol = metric.position.symbol.trim().toUpperCase();
      if (Number.isFinite(metric.currentPrice)) priceBySymbol.set(symbol, metric.currentPrice);
    });

    return Array.from(positionsBySymbol.entries())
      .map(([symbol, symbolPositions]) =>
        calculateSymbolExceptionAssessment(symbolPositions, priceBySymbol.get(symbol), settings.annualGrowthRate),
      )
      .filter((assessment): assessment is SymbolExceptionAssessment => Boolean(assessment))
      .sort((left, right) => getAssessmentMagnitude(right) - getAssessmentMagnitude(left));
  }, [metrics, positions, settings.annualGrowthRate]);

  const sections = useMemo(() => {
    const open = assessments.filter((item) => item.status === 'open');
    return {
      open,
      closed: assessments.filter(
        (item) => item.status === 'closed' && Math.abs(item.profitGapUsd) >= 0.01,
      ),
      invalid: assessments.filter((item) => item.status === 'invalid'),
    };
  }, [assessments]);

  const sectionDetails: Array<{ key: AssessmentSection; title: string; description: string; items: SymbolExceptionAssessment[] }> = [
    { key: 'open', title: t.exceptions.openTitle, description: t.exceptions.openDescription, items: sections.open },
    { key: 'closed', title: t.exceptions.closedTitle, description: t.exceptions.closedDescription, items: sections.closed },
    { key: 'invalid', title: t.exceptions.warningsTitle, description: t.exceptions.warningsDescription, items: sections.invalid },
  ];
  const hasItems = sectionDetails.some((section) => section.items.length > 0);

  return (
          <DashboardSurface>
            {loading ? (
              <DashboardLoading icon={<RefreshCw className="h-5 w-5 animate-spin text-blue-400" />} label={t.exceptions.loading} />
            ) : !hasItems ? (
              <DashboardEmptyPanel>
                <div className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-inner"><Target className="h-6 w-6" /></div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-slate-800">{t.exceptions.emptyTitle}</p>
                  <p className="text-sm text-slate-500">{t.exceptions.emptyDescription}</p>
                </div>
              </DashboardEmptyPanel>
            ) : (
              <div className="space-y-8">
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold text-slate-900">{locale === 'he' ? 'ביצועים מול היעד האישי' : 'Performance against your personal target'}</h2>
                  <p className="text-sm text-slate-500">{t.exceptions.annualTarget}: {formatPercent(settings.annualGrowthRate * 100, locale)} · {locale === 'he' ? 'יעד תשואה אישי, לא תחזית שוק.' : 'A personal return target, not a market forecast.'}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryCard label={t.exceptions.openCount} value={sections.open.length} tone="blue" />
                    <SummaryCard label={t.exceptions.closedCount} value={sections.closed.length} tone="emerald" />
                    <SummaryCard label={t.exceptions.warningCount} value={sections.invalid.length} tone="amber" />
                  </div>
                </section>

                {sectionDetails.map((section) => section.items.length > 0 && (
                  <AssessmentSectionView key={section.key} section={section.key} title={section.title} description={section.description} items={section.items} locale={locale} labels={t.exceptions} />
                ))}
              </div>
            )}
          </DashboardSurface>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'emerald' | 'amber' }) {
  const colors = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
  };
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}><p className="text-sm font-medium opacity-80">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div>;
}

function AssessmentSectionView({
  section, title, description, items, locale, labels,
}: {
  section: AssessmentSection;
  title: string;
  description: string;
  items: SymbolExceptionAssessment[];
  locale: 'he' | 'en';
  labels: ReturnType<typeof useTranslation>['t']['exceptions'];
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-xl font-semibold text-slate-900">{title}</h2><p className="text-sm text-slate-500">{description}</p></div>
        <span className="text-sm font-medium text-slate-500">{items.length.toLocaleString(locale)}</span>
      </div>
      <div className="grid gap-3 lg:hidden">
        {items.map((item) => <AssessmentCard key={item.symbol} item={item} section={section} locale={locale} labels={labels} />)}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr>
            <th className="px-4 py-3 text-start">{labels.table.symbol}</th><th className="px-4 py-3 text-start">{labels.table.status}</th>
            {section === 'open' && <><th className="px-4 py-3 text-end">{labels.table.currentPrice}</th><th className="px-4 py-3 text-end">{labels.table.projectedPrice}</th><th className="px-4 py-3 text-end">{labels.table.requiredExitPrice}</th><th className="px-4 py-3 text-end">{labels.table.gap}</th><th className="px-4 py-3 text-end">{labels.table.quantity}</th></>}
            {section === 'closed' && <><th className="px-4 py-3 text-end">{labels.table.realizedPnL}</th><th className="px-4 py-3 text-end">{labels.performanceVsTarget}</th></>}
            {section === 'invalid' && <th className="px-4 py-3 text-start">{labels.warningsTitle}</th>}
            <th className="px-4 py-3 text-end">{labels.table.actions}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">{items.map((item) => <AssessmentRow key={item.symbol} item={item} section={section} locale={locale} labels={labels} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ section, labels }: { section: AssessmentSection; labels: ReturnType<typeof useTranslation>['t']['exceptions'] }) {
  const data = section === 'open' ? [labels.statusOpen, 'bg-blue-50 text-blue-700'] : section === 'closed' ? [labels.statusClosed, 'bg-emerald-50 text-emerald-700'] : [labels.statusWarning, 'bg-amber-50 text-amber-800'];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${data[1]}`}>{data[0]}</span>;
}

function AssessmentCard({ item, section, locale, labels }: { item: SymbolExceptionAssessment; section: AssessmentSection; locale: 'he' | 'en'; labels: ReturnType<typeof useTranslation>['t']['exceptions'] }) {
  // The API's currentGapUsd is a shortfall (target - actual); present actual - target.
  const value = section === 'open' ? item.currentGapUsd === undefined ? undefined : -item.currentGapUsd : item.profitGapUsd;
  const tone = getTrendTone(value ?? 0);
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.display || item.symbol}</p><p className="text-xs text-slate-500">{item.symbol}</p></div><StatusBadge section={section} labels={labels} /></div>
    {section === 'invalid' ? <p className="mt-4 flex gap-2 text-sm text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{getInvalidReason(item.invalidReason, labels)}</p> : <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><Metric label={section === 'open' ? labels.currentPrice : labels.realizedPnL} value={formatMoney(section === 'open' ? item.currentPrice : item.realizedProfitUsd, locale)} /><Metric label={section === 'open' ? labels.requiredExitPrice : labels.performanceVsTarget} value={formatMoney(section === 'open' ? item.requiredExitPrice : item.profitGapUsd, locale)} className={section === 'closed' ? tone.text : undefined} />{section === 'open' && <><Metric label={labels.weightedProjectedPrice} value={formatMoney(item.projectedPrice, locale)} /><Metric label={labels.openQuantity} value={item.openQuantity.toLocaleString(locale)} /><Metric label={labels.performanceVsTarget} value={value === undefined ? '—' : formatSignedCurrency(value, 'USD', locale)} className={tone.text} /></>}</div>}
    <DetailLink symbol={item.symbol} label={labels.viewDetails} variant="card" />
  </article>;
}

function AssessmentRow({ item, section, locale, labels }: { item: SymbolExceptionAssessment; section: AssessmentSection; locale: 'he' | 'en'; labels: ReturnType<typeof useTranslation>['t']['exceptions'] }) {
  // The API's currentGapUsd is a shortfall (target - actual); present actual - target.
  const value = section === 'open' ? item.currentGapUsd === undefined ? undefined : -item.currentGapUsd : item.profitGapUsd;
  const tone = getTrendTone(value ?? 0);
  return <tr className="hover:bg-slate-50/70"><td className="px-4 py-4"><p className="font-semibold text-slate-900">{item.display || item.symbol}</p><p className="text-xs text-slate-500">{item.symbol}</p></td><td className="px-4 py-4"><StatusBadge section={section} labels={labels} /></td>
    {section === 'open' && <><td className="px-4 py-4 text-end tabular-nums">{formatMoney(item.currentPrice, locale)}</td><td className="px-4 py-4 text-end tabular-nums">{formatMoney(item.projectedPrice, locale)}</td><td className="px-4 py-4 text-end font-semibold tabular-nums text-slate-900">{formatMoney(item.requiredExitPrice, locale)}</td><td className={`px-4 py-4 text-end font-semibold tabular-nums ${tone.text}`}><span className="block">{value === undefined ? '—' : formatSignedCurrency(value, 'USD', locale)}</span></td><td className="px-4 py-4 text-end tabular-nums">{item.openQuantity.toLocaleString(locale)}</td></>}
    {section === 'closed' && <><td className="px-4 py-4 text-end tabular-nums">{formatSignedCurrency(item.realizedProfitUsd, 'USD', locale)}</td><td className={`px-4 py-4 text-end font-semibold tabular-nums ${tone.text}`}>{formatSignedCurrency(item.profitGapUsd, 'USD', locale)}</td></>}
    {section === 'invalid' && <td className="px-4 py-4 text-amber-800"><span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{getInvalidReason(item.invalidReason, labels)}</span></td>}
    <td className="px-4 py-4 text-end"><DetailLink symbol={item.symbol} label={labels.viewDetails} variant="row" /></td></tr>;
}

function Metric({ label, value, className = '' }: { label: string; value: string; className?: string }) { return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-0.5 font-semibold tabular-nums ${className || 'text-slate-800'}`}>{value}</p></div>; }
function formatMoney(value: number | undefined, locale: 'he' | 'en') { return value === undefined || !Number.isFinite(value) ? '—' : formatCurrency(value, 'USD', locale); }
function DetailLink({ symbol, label, variant }: { symbol: string; label: string; variant: 'card' | 'row' }) {
  return <Link id={`target-${variant}-${symbol}`} href={buildStockHref(symbol, '/portfolio?view=targets')} onClick={(event) => rememberReturnContext(event.currentTarget.id)} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">{label}<ArrowUpLeft aria-hidden="true" className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" /></Link>;
}
