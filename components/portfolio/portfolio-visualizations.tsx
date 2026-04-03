'use client';

import { ReactNode, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Label,
  Tooltip,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  ReferenceLine,
} from 'recharts';
import type { TooltipProps as RechartsTooltipProps } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency, formatPercent } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const VISUALIZATION_CARD_CLASS =
  'viz-panel viz-panel-strong group rounded-[32px] border-[color:rgba(148,163,184,0.2)] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.08),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] shadow-[0_30px_80px_-42px_rgba(15,23,42,0.42)]';

const VISUALIZATION_HEADER_CLASS =
  'relative space-y-4 border-b border-[color:rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.7))] px-4 py-5 sm:px-5 sm:py-6';

const VISUALIZATION_CONTENT_CLASS = 'relative space-y-5 px-4 py-4 sm:px-5 sm:py-5';

const DARK_CHART_SURFACE_CLASS =
  'viz-chart-surface viz-grid-soft-strong relative overflow-hidden rounded-[30px] border-white/5 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_30px_56px_-38px_rgba(15,23,42,0.72)]';

const HEADER_BADGE_CLASS =
  'viz-chip inline-flex items-center gap-2 border-[color:rgba(148,163,184,0.24)] bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-slate-500)] shadow-sm backdrop-blur';

const COLORS = ['#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f97316', '#ef4444'];

const HOLDING_BUCKET_ACCENTS = {
  short: {
    badge: 'bg-sky-100 text-sky-700 border-sky-200/90',
    dot: 'bg-sky-400',
    glow: 'bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.2),transparent_56%)]',
    progress: 'from-sky-400 via-sky-500 to-blue-500',
  },
  medium: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200/90',
    dot: 'bg-blue-500',
    glow: 'bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_56%)]',
    progress: 'from-blue-500 via-indigo-500 to-cyan-400',
  },
  long: {
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200/90',
    dot: 'bg-indigo-400',
    glow: 'bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_56%)]',
    progress: 'from-indigo-400 via-violet-500 to-sky-400',
  },
} as const;

type TooltipValueType = number | string;

interface ChartTooltipProps extends RechartsTooltipProps<TooltipValueType, string> {
  valueFormatter: (value: number) => string;
  labelFormatter?: (label: TooltipValueType) => string;
}

const ChartTooltip = ({ active, payload, label, valueFormatter, labelFormatter }: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const resolvedLabel = labelFormatter ? labelFormatter(label ?? '') : label;

  return (
    <div className="viz-tooltip-shell w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-[1.55rem] border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] text-sm text-slate-100 shadow-[0_32px_70px_-28px_rgba(2,6,23,0.78)] backdrop-blur-xl sm:w-[19rem]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.9),rgba(34,197,94,0.4),rgba(56,189,248,0))]" />
      {resolvedLabel && (
        <div className="border-b border-white/10 bg-[linear-gradient(90deg,rgba(37,99,235,0.22),rgba(15,23,42,0.08))] px-3.5 py-2.5 sm:px-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">{resolvedLabel}</p>
        </div>
      )}
      <div className="space-y-2 px-3.5 py-3 sm:px-4 sm:py-3.5">
        {payload.map((item) => {
          if (!item || item.value === undefined || item.value === null) {
            return null;
          }

          const numericValue = typeof item.value === 'number' ? item.value : Number(item.value);

          return (
            <div
              key={item.dataKey?.toString()}
              className="flex items-center gap-2.5 rounded-[1rem] border border-white/8 bg-white/6 px-2.5 py-2 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[rgba(15,23,42,0.45)]"
                style={{ background: item.color ?? 'var(--fallback-color, var(--color-primary-500))' }}
              />
              <span className="min-w-0 flex-1 text-[11px] font-semibold text-slate-100 sm:text-sm">
                {item.name}
              </span>
              <span className="ml-auto shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-semibold text-sky-100 sm:text-xs">
                {valueFormatter(numericValue)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="relative flex min-h-44 flex-col items-center justify-center gap-3 overflow-hidden rounded-[1.8rem] border border-dashed border-[color:rgba(148,163,184,0.28)] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] px-5 py-9 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:min-h-48 sm:px-6 sm:py-10">
    <div className="pointer-events-none absolute -top-10 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.18),transparent_70%)] blur-2xl" />
    <div className="relative flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-white/80 bg-white text-[var(--color-primary-700)] shadow-[0_18px_38px_-26px_rgba(37,99,235,0.55)]">
      {icon}
    </div>
    <div className="relative space-y-1">
      <p className="text-balance text-sm font-semibold text-[var(--color-primary-900)]">{title}</p>
      <p className="text-balance text-sm leading-6 text-[var(--color-slate-500)]">{description}</p>
    </div>
  </div>
);

const HOLDING_VALUE_MAX_FONT_PX = 36;
const HOLDING_VALUE_MIN_FONT_PX = 8;

const FittedSingleLineValue = ({ value }: { value: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const fitText = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) {
      return;
    }

    const availableWidth = Math.max(0, container.clientWidth - 1);
    if (availableWidth <= 0) {
      return;
    }

    text.style.fontSize = `${HOLDING_VALUE_MAX_FONT_PX}px`;

    let low = HOLDING_VALUE_MIN_FONT_PX;
    let high = HOLDING_VALUE_MAX_FONT_PX;
    let best = HOLDING_VALUE_MIN_FONT_PX;

    for (let i = 0; i < 16; i += 1) {
      const mid = (low + high) / 2;
      text.style.fontSize = `${mid}px`;

      if (text.scrollWidth <= availableWidth) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    const nextFontSizePx = Math.round(best * 100) / 100;
    text.style.fontSize = `${nextFontSizePx}px`;
    const overflowRatio = text.scrollWidth > availableWidth ? availableWidth / text.scrollWidth : 1;
    const nextScaleX = Math.min(1, Math.round(overflowRatio * 1000) / 1000);
    text.style.transform = nextScaleX < 1 ? `scaleX(${nextScaleX})` : '';
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      fitText();
    });

    const resizeObserver = new ResizeObserver(() => {
      fitText();
    });

    resizeObserver.observe(container);
    resizeObserver.observe(text);

    let disposed = false;
    const fontSet = document.fonts;
    if (fontSet) {
      fontSet.ready.then(() => {
        if (!disposed) {
          fitText();
        }
      });
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [fitText, value]);

  return (
    <div ref={containerRef} className="mt-3 w-full overflow-hidden">
      <span
        ref={textRef}
        dir="ltr"
        className="block origin-left whitespace-nowrap tabular-nums text-[36px] font-black leading-none tracking-tight text-[var(--color-primary-900)] [unicode-bidi:isolate]"
      >
        {value}
      </span>
    </div>
  );
};

export function PortfolioVisualizations({ metrics, summary }: PortfolioVisualizationsProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';
  const withRtlMark = (value: TooltipValueType) => {
    const text = value?.toString?.() ?? '';
    return isRtl ? `\u200F${text}` : text;
  };

  const allocationData = useMemo(() => {
    if (!summary) {
      return [];
    }

    return buildPortfolioAllocation(metrics, summary.usdToIlsRate).map((item) => ({
      ...item,
      value: settings.currency === 'ILS' ? item.valueIls : item.valueUsd,
    }));
  }, [metrics, settings.currency, summary]);

  const pnlData = useMemo(() => {
    const activeMetrics = metrics.filter((metric) => metric.position.quantity !== 0);
    if (!activeMetrics.length) {
      return [];
    }

    const rate = summary?.usdToIlsRate ?? 0;
    const toDisplay = settings.currency === 'ILS'
      ? (value: number) => value * rate
      : (value: number) => value;

    return buildPortfolioPnL(activeMetrics).map((item) => ({
      ...item,
      currentPnLDisplay: toDisplay(item.currentPnLUsd),
      projectedPnLDisplay: toDisplay(item.projectedPnLUsd),
    }));
  }, [metrics, settings.currency, summary?.usdToIlsRate]);

  const currency = settings.currency;
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const formatValue = (value: number) => formatCurrency(value, currency, locale);
  const currencySymbol = currency === 'ILS' ? '₪' : '$';
  const formatNumberOnly = (value: number) =>
    new Intl.NumberFormat(localeCode, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const normalizeBidiMarks = (text: string) => text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  const compactNumber = new Intl.NumberFormat(localeCode, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const splitHoldingLabel = useCallback((value: string) => {
    const normalized = value.trim();
    if (normalized.length <= 14 || !normalized.includes(' ')) {
      return [normalized];
    }

    const words = normalized.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      if (!currentLine) {
        currentLine = word;
        return;
      }

      const candidate = `${currentLine} ${word}`;
      if (candidate.length <= 14 || lines.length === 1) {
        currentLine = candidate;
        return;
      }

      lines.push(currentLine);
      currentLine = word;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.slice(0, 2);
  }, []);
  const renderHoldingPeriodTick = useCallback(
    ({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value?: string } }) => {
      const label = payload?.value?.toString?.() ?? '';
      const lines = splitHoldingLabel(label);

      return (
        <text
          x={x}
          y={y}
          fill="rgba(248,250,252,0.94)"
          fontSize={12}
          fontWeight={700}
          textAnchor="end"
          dominantBaseline="middle"
          direction={isRtl ? 'rtl' : 'ltr'}
          style={{ unicodeBidi: 'isolate' }}
        >
          {lines.map((line, index) => (
            <tspan key={`${label}-${index}`} x={x} dy={index === 0 ? (lines.length > 1 ? '-0.45em' : '0') : '1.15em'}>
              {isRtl ? `\u200F${line}` : line}
            </tspan>
          ))}
        </text>
      );
    },
    [isRtl, splitHoldingLabel]
  );

  const topMovers = useMemo(() => {
    if (!summary) {
      return { gainers: [], losers: [] };
    }

    const conversionRate = settings.currency === 'ILS' ? summary.usdToIlsRate : 1;

    const entries = metrics
      .filter((metric) => typeof metric.dailyChange === 'number' && metric.position.quantity > 0)
      .map((metric) => {
        const changeUsd = (metric.dailyChange ?? 0) * metric.position.quantity;
        return {
          symbol: metric.position.symbol,
          display: metric.position.display,
          changeValue: changeUsd * conversionRate,
          changePercent: metric.dailyChangePercent,
        };
      });

    const gainers = entries
      .filter((item) => item.changeValue > 0)
      .sort((a, b) => b.changeValue - a.changeValue)
      .slice(0, 3);

    const losers = entries
      .filter((item) => item.changeValue < 0)
      .sort((a, b) => a.changeValue - b.changeValue)
      .slice(0, 3);

    return { gainers, losers };
  }, [metrics, settings.currency, summary]);

  const holdingPeriodData = useMemo(() => {
    if (!summary) {
      return [];
    }

    const conversionRate = settings.currency === 'ILS' ? summary.usdToIlsRate : 1;

    const buckets = [
      { key: 'short', label: t.dashboard.holdingPeriodShort, min: 0, max: 1 },
      { key: 'medium', label: t.dashboard.holdingPeriodMedium, min: 1, max: 3 },
      { key: 'long', label: t.dashboard.holdingPeriodLong, min: 3, max: Number.POSITIVE_INFINITY },
    ] as const;

    const totals = buckets.map((bucket) => {
      const bucketValueUsd = metrics
        .filter(
          (metric) =>
            metric.position.quantity > 0 &&
            metric.yearsHeld >= bucket.min &&
            metric.yearsHeld < bucket.max
        )
        .reduce((sum, metric) => sum + metric.currentValue, 0);

      const bucketValue = bucketValueUsd * conversionRate;

      return {
        key: bucket.key,
        label: bucket.label,
        value: bucketValue,
      };
    });

    const totalValue = totals.reduce((acc, item) => acc + item.value, 0);

    return totals.map((item) => ({
      ...item,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
    }));
  }, [metrics, settings.currency, summary, t]);

  const pieTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const barTooltipFormatter = (value: number) => formatValue(value ?? 0);

  const totalAllocationValue = useMemo(
    () => allocationData.reduce((sum, item) => sum + item.value, 0),
    [allocationData]
  );

  const allocationLegendData = useMemo(
    () =>
      allocationData.map((item) => ({
        ...item,
        percentage: totalAllocationValue > 0 ? (item.value / totalAllocationValue) * 100 : 0,
      })),
    [allocationData, totalAllocationValue]
  );

  const pnlSnapshot = useMemo(() => {
    const totals = pnlData.reduce(
      (acc, item) => {
        acc.current += item.currentPnLDisplay;
        acc.projected += item.projectedPnLDisplay;
        return acc;
      },
      { current: 0, projected: 0 }
    );

    const currentPositive = pnlData.filter((item) => item.currentPnLDisplay >= 0).length;
    const projectedPositive = pnlData.filter((item) => item.projectedPnLDisplay >= 0).length;

    return {
      ...totals,
      currentPositive,
      projectedPositive,
      total: pnlData.length,
    };
  }, [pnlData]);

  const pnlDomain = useMemo(() => {
    if (pnlData.length === 0) {
      return [-1, 1] as [number, number];
    }

    const maxAbs = pnlData.reduce((max, item) => {
      const currentAbs = Math.abs(item.currentPnLDisplay);
      const projectedAbs = Math.abs(item.projectedPnLDisplay);
      return Math.max(max, currentAbs, projectedAbs);
    }, 0);

    const padded = Math.max(maxAbs * 1.18, 1);
    return [-padded, padded] as [number, number];
  }, [pnlData]);

  const topAllocation = allocationLegendData[0] ?? null;

  if (!metrics.length || !summary) {
    return null;
  }

  const hasMovers = topMovers.gainers.length > 0 || topMovers.losers.length > 0;
  const hasHoldingData = holdingPeriodData.some((item) => item.value > 0);
  const holdingPeriodTotal = holdingPeriodData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:gap-8">
      <Card className={VISUALIZATION_CARD_CLASS}>
        <CardHeader className={VISUALIZATION_HEADER_CLASS}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.85),rgba(16,185,129,0.48),rgba(56,189,248,0))]" />
          <div className="pointer-events-none absolute -right-12 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.16),transparent_68%)] blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <span className={HEADER_BADGE_CLASS}>{locale === 'he' ? 'מובילי יום' : 'Daily leaders'}</span>
              <div className="space-y-1">
                <CardTitle className="text-balance text-xl font-black tracking-tight text-[var(--color-primary-900)]">
                  {t.dashboard.topMoversTitle}
                </CardTitle>
                <p className="max-w-2xl text-balance text-sm leading-6 text-[var(--color-slate-500)]">{t.dashboard.topMoversDescription}</p>
              </div>
            </div>
            <div className="grid min-w-[12rem] gap-2 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-emerald-200/75 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.94))] px-3 py-2.5 shadow-[0_18px_30px_-28px_rgba(16,185,129,0.65)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{t.dashboard.topMoversPositiveLabel}</p>
                <p className="mt-1 text-2xl font-black text-emerald-700">{topMovers.gainers.length}</p>
              </div>
              <div className="rounded-[1.25rem] border border-rose-200/75 bg-[linear-gradient(180deg,rgba(255,241,242,0.95),rgba(255,255,255,0.94))] px-3 py-2.5 shadow-[0_18px_30px_-28px_rgba(244,63,94,0.65)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700">{t.dashboard.topMoversNegativeLabel}</p>
                <p className="mt-1 text-2xl font-black text-rose-700">{topMovers.losers.length}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className={VISUALIZATION_CONTENT_CLASS}>
          {!hasMovers ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.topMoversEmpty}
              description={t.dashboard.topMoversNoData}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="relative overflow-hidden rounded-[1.85rem] border border-emerald-200/75 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.96))] p-4 shadow-[0_28px_48px_-36px_rgba(16,185,129,0.52)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">{t.dashboard.topMoversGainers}</p>
                    <p className="mt-1 text-sm text-emerald-900/70">
                      {locale === 'he'
                        ? 'הפוזיציות עם התאוצה החיובית החזקה ביותר כרגע.'
                        : 'The positions showing the strongest upside momentum right now.'}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-emerald-200/80 bg-white/85 text-emerald-700 shadow-sm">
                    <ArrowUpRight className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {topMovers.gainers.map((item, index) => (
                    <div
                      key={`gainer-${item.symbol}-${index}`}
                      className="viz-panel group rounded-[1.45rem] border-white/85 bg-white/86 p-3.5 shadow-[0_18px_38px_-32px_rgba(16,185,129,0.42)] backdrop-blur sm:p-4"
                    >
                      <div
                        className={`pointer-events-none absolute inset-y-0 w-20 bg-[linear-gradient(90deg,rgba(16,185,129,0.12),transparent)] ${isRtl ? 'right-0 scale-x-[-1]' : 'left-0'}`}
                      />
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className={`flex min-w-0 items-start gap-3 ${isRtl ? 'flex-row-reverse text-right' : ''}`}>
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-emerald-50 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-emerald-100">
                            <span className="text-sm font-black">{index + 1}</span>
                          </div>
                          <div className={`min-w-0 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                            <p className="text-balance text-[1.02rem] font-bold leading-tight tracking-tight text-[var(--color-primary-900)] sm:text-[1.14rem]">{item.display}</p>
                            <div className={`mt-2 flex flex-wrap items-center gap-2 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                              <span className="viz-chip viz-chip-emerald px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{item.symbol}</span>
                              {typeof item.changePercent === 'number' && Number.isFinite(item.changePercent) && (
                                <span className="viz-chip px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                  {formatPercent(item.changePercent, locale)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`flex items-center justify-between gap-3 rounded-[1rem] bg-white/70 px-3 py-2 sm:min-w-[8rem] sm:bg-transparent sm:px-0 sm:py-0 ${isRtl ? 'text-right sm:text-right' : 'sm:text-right'}`}>
                          <p dir="ltr" className="text-[1.08rem] font-black tracking-tight text-emerald-700">{formatValue(item.changeValue)}</p>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700/75">{t.dashboard.topMoversPositiveLabel}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {topMovers.gainers.length === 0 && (
                    <div className="rounded-[1.35rem] border border-dashed border-emerald-200/85 bg-white/80 px-4 py-4 text-center text-sm text-emerald-800/70">
                      {t.dashboard.topMoversNoData}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[1.85rem] border border-rose-200/75 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_35%),linear-gradient(180deg,rgba(255,241,242,0.94),rgba(255,255,255,0.96))] p-4 shadow-[0_28px_48px_-36px_rgba(244,63,94,0.48)] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700">{t.dashboard.topMoversLosers}</p>
                    <p className="mt-1 text-sm text-rose-900/70">
                      {locale === 'he'
                        ? 'הפוזיציות שמראות חולשה יומית ודורשות תשומת לב.'
                        : 'The positions showing daily weakness and demanding attention.'}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-rose-200/80 bg-white/85 text-rose-700 shadow-sm">
                    <ArrowDownRight className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {topMovers.losers.map((item, index) => (
                    <div
                      key={`loser-${item.symbol}-${index}`}
                      className="viz-panel group rounded-[1.45rem] border-white/85 bg-white/86 p-3.5 shadow-[0_18px_38px_-32px_rgba(244,63,94,0.42)] backdrop-blur sm:p-4"
                    >
                      <div
                        className={`pointer-events-none absolute inset-y-0 w-20 bg-[linear-gradient(90deg,rgba(244,63,94,0.12),transparent)] ${isRtl ? 'right-0 scale-x-[-1]' : 'left-0'}`}
                      />
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className={`flex min-w-0 items-start gap-3 ${isRtl ? 'flex-row-reverse text-right' : ''}`}>
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-rose-50 text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-rose-100">
                            <span className="text-sm font-black">{index + 1}</span>
                          </div>
                          <div className={`min-w-0 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                            <p className="text-balance text-[1.02rem] font-bold leading-tight tracking-tight text-[var(--color-primary-900)] sm:text-[1.14rem]">{item.display}</p>
                            <div className={`mt-2 flex flex-wrap items-center gap-2 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                              <span className="viz-chip viz-chip-rose px-2.5 py-1 text-[11px] font-semibold text-rose-700">{item.symbol}</span>
                              {typeof item.changePercent === 'number' && Number.isFinite(item.changePercent) && (
                                <span className="viz-chip px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                  {formatPercent(item.changePercent, locale)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`flex items-center justify-between gap-3 rounded-[1rem] bg-white/70 px-3 py-2 sm:min-w-[8rem] sm:bg-transparent sm:px-0 sm:py-0 ${isRtl ? 'text-right sm:text-right' : 'sm:text-right'}`}>
                          <p dir="ltr" className="text-[1.08rem] font-black tracking-tight text-rose-700">{formatValue(item.changeValue)}</p>
                          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700/75">{t.dashboard.topMoversNegativeLabel}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {topMovers.losers.length === 0 && (
                    <div className="rounded-[1.35rem] border border-dashed border-rose-200/85 bg-white/80 px-4 py-4 text-center text-sm text-rose-800/70">
                      {t.dashboard.topMoversNoData}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={VISUALIZATION_CARD_CLASS}>
        <CardHeader className={VISUALIZATION_HEADER_CLASS}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.86),rgba(99,102,241,0.52),rgba(56,189,248,0))]" />
          <div className="pointer-events-none absolute -right-16 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.16),transparent_68%)] blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <span className={HEADER_BADGE_CLASS}>{locale === 'he' ? 'מחזור חיי החזקה' : 'Holding lifecycle'}</span>
              <div className="space-y-1">
                <CardTitle className="text-balance text-xl font-black tracking-tight text-[var(--color-primary-900)]">
                  {t.dashboard.holdingPeriodTitle}
                </CardTitle>
                <p className="max-w-2xl text-balance text-sm leading-6 text-[var(--color-slate-500)]">{t.dashboard.holdingPeriodDescription}</p>
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-blue-100/90 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(255,255,255,0.94))] px-3.5 py-2.5 shadow-[0_18px_34px_-28px_rgba(59,130,246,0.55)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">{locale === 'he' ? 'סה"כ ערך' : 'Total value'}</p>
              <p className="mt-1 text-lg font-black tracking-tight text-[var(--color-primary-900)]">{formatValue(holdingPeriodTotal)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className={VISUALIZATION_CONTENT_CLASS}>
          {!hasHoldingData ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.emptyChart}
              description={t.dashboard.holdingPeriodDescription}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_minmax(18rem,0.84fr)] xl:items-start">
              <div className={`${DARK_CHART_SURFACE_CLASS} h-[clamp(18rem,32vw,22rem)] w-full`}>
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.55),rgba(255,255,255,0))]" />
                <div className="pointer-events-none absolute inset-x-6 bottom-6 h-24 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.12),transparent_70%)] blur-3xl" />
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holdingPeriodData} layout="vertical" barCategoryGap="26%" margin={{ top: 14, right: 20, bottom: 8, left: 6 }}>
                    <defs>
                      <linearGradient id="holdingPeriodGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={1} />
                        <stop offset="55%" stopColor="#3b82f6" stopOpacity={0.92} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.82} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.18)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => compactNumber.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(226,232,240,0.88)', fontSize: 11, fontWeight: 600 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={148}
                      tickMargin={10}
                      interval={0}
                      tick={renderHoldingPeriodTick}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                      content={
                        <ChartTooltip
                          valueFormatter={barTooltipFormatter}
                          labelFormatter={withRtlMark}
                        />
                      }
                    />
                    <Bar dataKey="value" fill="url(#holdingPeriodGradient)" radius={[999, 999, 999, 999]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-3">
                {holdingPeriodData.map((bucket) => {
                  const formattedNumber = normalizeBidiMarks(formatNumberOnly(bucket.value));
                  const formattedValue = `${currencySymbol}${formattedNumber}`;
                  const accent = HOLDING_BUCKET_ACCENTS[bucket.key];

                  return (
                    <div
                      key={bucket.key}
                      className="viz-panel relative rounded-[1.55rem] border-[color:rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-4 shadow-[0_22px_38px_-32px_rgba(15,23,42,0.34)]"
                    >
                      <div className={`pointer-events-none absolute inset-0 opacity-100 ${accent.glow}`} />
                      <div className="relative flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${accent.dot} ring-4 ring-white`} />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">{bucket.label}</p>
                          </div>
                          <FittedSingleLineValue value={formattedValue} />
                        </div>
                        <span className={`viz-chip inline-flex px-2.5 py-1 text-[11px] font-semibold ${accent.badge}`}>
                          {formatPercent(bucket.percentage, locale)}
                        </span>
                      </div>
                      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-[color:rgba(226,232,240,0.8)]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${accent.progress}`}
                          style={{ width: `${Math.min(Math.max(bucket.percentage, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={VISUALIZATION_CARD_CLASS}>
        <CardHeader className={VISUALIZATION_HEADER_CLASS}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.8),rgba(16,185,129,0.52),rgba(56,189,248,0))]" />
          <div className="pointer-events-none absolute -right-16 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.16),transparent_68%)] blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <span className={HEADER_BADGE_CLASS}>{locale === 'he' ? 'מנוע רווח והפסד' : 'PnL engine'}</span>
              <div className="space-y-1">
                <CardTitle className="text-balance text-xl font-black tracking-tight text-[var(--color-primary-900)]">
                  {t.dashboard.pnlChart}
                </CardTitle>
                <p className="max-w-2xl text-balance text-sm leading-6 text-[var(--color-slate-500)]">{t.dashboard.pnlDescription}</p>
              </div>
            </div>
            <div className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[color:rgba(148,163,184,0.2)] bg-white/92 px-3 py-1.5 text-xs font-semibold leading-tight text-[var(--color-slate-600)] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[var(--color-primary-500)] ring-4 ring-[rgba(59,130,246,0.16)]" />
              {t.dashboard.current}
              <span className="mx-1 h-3 w-px bg-[color:rgba(148,163,184,0.32)]" />
              <span className="h-2 w-2 rounded-full bg-[var(--color-green-500)] ring-4 ring-[rgba(16,185,129,0.14)]" />
              {t.dashboard.projected}
            </div>
          </div>
        </CardHeader>
        <CardContent className={`${VISUALIZATION_CONTENT_CLASS} space-y-4`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-[1.45rem] border border-emerald-200/80 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_32%),linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.94))] p-4 shadow-[0_22px_38px_-32px_rgba(16,185,129,0.58)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">{t.dashboard.current}</p>
              <p className="mt-2 text-[1.65rem] font-black tracking-tight text-emerald-700">{formatValue(pnlSnapshot.current)}</p>
              <p className="mt-2 inline-flex rounded-full border border-white/85 bg-white/88 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
                {pnlSnapshot.currentPositive}/{pnlSnapshot.total}
              </p>
            </div>
            <div className="relative overflow-hidden rounded-[1.45rem] border border-sky-200/80 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%),linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.94))] p-4 shadow-[0_22px_38px_-32px_rgba(59,130,246,0.5)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700">{t.dashboard.projected}</p>
              <p className="mt-2 text-[1.65rem] font-black tracking-tight text-sky-700">{formatValue(pnlSnapshot.projected)}</p>
              <p className="mt-2 inline-flex rounded-full border border-white/85 bg-white/88 px-2.5 py-1 text-[11px] font-semibold text-sky-700 shadow-sm">
                {pnlSnapshot.projectedPositive}/{pnlSnapshot.total}
              </p>
            </div>
          </div>
          {pnlData.length === 0 ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.emptyChart}
              description={t.dashboard.pnlDescription}
            />
          ) : (
            <div className={`${DARK_CHART_SURFACE_CLASS} h-[clamp(19rem,32vw,23rem)]`}>
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.62),rgba(255,255,255,0))]" />
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pnlData} barGap={6} barCategoryGap="20%" margin={{ top: 16, right: 8, left: 0, bottom: 10 }}>
                  <defs>
                    <linearGradient id="pnlCurrentGainGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.58} />
                    </linearGradient>
                    <linearGradient id="pnlCurrentLossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.95} />
                      <stop offset="95%" stopColor="#fb7185" stopOpacity={0.56} />
                    </linearGradient>
                    <linearGradient id="pnlProjectedGainGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.96} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.62} />
                    </linearGradient>
                    <linearGradient id="pnlProjectedLossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.96} />
                      <stop offset="95%" stopColor="#fdba74" stopOpacity={0.58} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 6" stroke="rgba(148,163,184,0.18)" />
                  <ReferenceLine y={0} stroke="rgba(226,232,240,0.3)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="symbol"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={36}
                    tick={{ fill: 'rgba(248,250,252,0.92)', fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis
                    domain={pnlDomain}
                    tickFormatter={(value) => compactNumber.format(value)}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: 'rgba(226,232,240,0.84)', fontSize: 11, fontWeight: 600 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                    content={<ChartTooltip valueFormatter={barTooltipFormatter} />}
                  />
                  <Bar
                    dataKey="currentPnLDisplay"
                    name={t.dashboard.current}
                    radius={[10, 10, 6, 6]}
                    maxBarSize={20}
                  >
                    {pnlData.map((entry, index) => (
                      <Cell
                        key={`current-bar-${entry.symbol}-${index}`}
                        fill={entry.currentPnLDisplay >= 0 ? 'url(#pnlCurrentGainGradient)' : 'url(#pnlCurrentLossGradient)'}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="projectedPnLDisplay"
                    name={t.dashboard.projected}
                    radius={[10, 10, 6, 6]}
                    maxBarSize={20}
                  >
                    {pnlData.map((entry, index) => (
                      <Cell
                        key={`projected-bar-${entry.symbol}-${index}`}
                        fill={
                          entry.projectedPnLDisplay >= 0
                            ? 'url(#pnlProjectedGainGradient)'
                            : 'url(#pnlProjectedLossGradient)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={VISUALIZATION_CARD_CLASS}>
        <CardHeader className={VISUALIZATION_HEADER_CLASS}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.88),rgba(245,158,11,0.42),rgba(56,189,248,0))]" />
          <div className="pointer-events-none absolute -right-16 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.14),transparent_68%)] blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <span className={HEADER_BADGE_CLASS}>{locale === 'he' ? 'קומפוזיציית תיק' : 'Portfolio composition'}</span>
              <div className="space-y-1">
                <CardTitle className="text-balance text-xl font-black tracking-tight text-[var(--color-primary-900)]">
                  {t.dashboard.allocationChart}
                </CardTitle>
                <p className="max-w-2xl text-balance text-sm leading-6 text-[var(--color-slate-500)]">{t.dashboard.allocationDescription}</p>
              </div>
            </div>
            {topAllocation ? (
              <div className="rounded-[1.25rem] border border-[color:rgba(148,163,184,0.2)] bg-white/90 px-3.5 py-2.5 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">{locale === 'he' ? 'אחזקה דומיננטית' : 'Top allocation'}</p>
                <p className="mt-1 text-sm font-black tracking-tight text-[var(--color-primary-900)]">{topAllocation.display}</p>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={VISUALIZATION_CONTENT_CLASS}>
          {allocationData.length === 0 ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.emptyChart}
              description={t.dashboard.allocationDescription}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.02fr)_minmax(16rem,0.98fr)] lg:items-start 2xl:gap-6">
              <div className={`${DARK_CHART_SURFACE_CLASS} min-h-[22rem]`}>
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.62),rgba(255,255,255,0))]" />
                <div className="mx-auto flex h-[clamp(18rem,30vw,24rem)] w-full max-w-[25rem] items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {allocationData.map((entry, index) => {
                          const gradientId = `allocationGradient-${entry.symbol}-${index}`;
                          return (
                            <linearGradient
                              key={gradientId}
                              id={gradientId}
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="100%"
                            >
                              <stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={1} />
                              <stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.68} />
                            </linearGradient>
                          );
                        })}
                      </defs>
                      <Pie
                        data={allocationData}
                        dataKey="value"
                        nameKey="display"
                        innerRadius="56%"
                        outerRadius="82%"
                        paddingAngle={3}
                        cornerRadius={11}
                        startAngle={90}
                        endAngle={-270}
                        stroke="rgba(15,23,42,0.45)"
                        strokeWidth={3}
                      >
                        {allocationData.map((entry, index) => {
                          const gradientId = `allocationGradient-${entry.symbol}-${index}`;
                          return <Cell key={gradientId} fill={`url(#${gradientId})`} />;
                        })}
                        <Label
                          position="center"
                          content={() => (
                            <text
                              x="50%"
                              y="50%"
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x="50%"
                                dy="-0.45em"
                                className="fill-slate-100 text-[15px] font-semibold"
                                direction="ltr"
                                style={{ unicodeBidi: 'isolate' }}
                              >
                                {formatValue(totalAllocationValue)}
                              </tspan>
                              <tspan
                                x="50%"
                                dy="1.65em"
                                className="fill-slate-400 text-[11px] font-semibold"
                                direction={isRtl ? 'rtl' : 'ltr'}
                                style={{ unicodeBidi: 'isolate' }}
                              >
                                {t.dashboard.allocationChart}
                              </tspan>
                            </text>
                          )}
                        />
                      </Pie>
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                        content={
                          <ChartTooltip
                            valueFormatter={pieTooltipFormatter}
                            labelFormatter={withRtlMark}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {allocationLegendData.map((entry, index) => (
                  <div
                    key={`allocation-legend-${entry.symbol}-${index}`}
                    className="viz-panel group rounded-[1.45rem] border-[color:rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-3.5 py-3.5 shadow-[0_20px_34px_-30px_rgba(15,23,42,0.3)]"
                  >
                    <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.68),rgba(56,189,248,0))]" />
                    <div className={`flex min-w-0 items-start gap-3 ${isRtl ? 'flex-row-reverse text-right' : ''}`}>
                      <div className="mt-0.5 flex flex-col items-center gap-2">
                        <span className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white" style={{ background: COLORS[index % COLORS.length] }} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-slate-400)]">#{index + 1}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                          <div className="min-w-0">
                            <p className="text-balance text-sm font-bold leading-tight text-[var(--color-primary-900)]">{entry.display}</p>
                            <div className={`mt-1.5 flex flex-wrap items-center gap-2 ${isRtl ? 'justify-end' : 'justify-start'}`}>
                              <span className="viz-chip px-2.5 py-1 text-[11px] font-semibold text-[var(--color-slate-600)]">
                                {entry.symbol}
                              </span>
                              <span className="viz-chip viz-chip-blue px-2.5 py-1 text-[11px] font-semibold text-[var(--color-primary-700)]">
                                {formatPercent(entry.percentage, locale)}
                              </span>
                            </div>
                          </div>
                          <div className={`min-w-0 ${isRtl ? 'text-right sm:text-right' : 'sm:text-right'}`}>
                            <p dir="ltr" className="text-sm font-black tracking-tight text-[var(--color-primary-800)]">{formatValue(entry.value)}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:rgba(226,232,240,0.8)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(Math.max(entry.percentage, 0), 100)}%`,
                              background: `linear-gradient(90deg, ${COLORS[index % COLORS.length]}, rgba(15,23,42,0.75))`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
