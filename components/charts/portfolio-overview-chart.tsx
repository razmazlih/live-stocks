'use client';

import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

interface PortfolioOverviewChartProps {
  data: PortfolioTimelinePoint[];
  summary: PortfolioSummary;
}

type TooltipValueType = number | string;

type ChartPoint = PortfolioTimelinePoint & {
  netValue: number;
  netValueIls: number;
  expectedValueUsd: number;
  expectedValueIls: number;
  forecastValueUsd: number;
  forecastValueIls: number;
  deltaUsd: number;
  deltaIls: number;
  spyValueUsd: number;
  spyValueIls: number;
  trendState: 'loss' | 'under' | 'above';
};

type GradientStop = {
  offset: number;
  color: string;
};

type ChartInteractionMode = 'mouse' | 'touch';

type ChartCoordinate = {
  x: number;
  y: number;
};

type TooltipOverlayPosition = {
  left: number;
  top: number;
  transformOrigin: string;
};

type ChartInteractionState = {
  coordinate: ChartCoordinate;
  index: number;
  label: TooltipValueType;
  mode: ChartInteractionMode;
  point: ChartPoint;
  pointer: ChartCoordinate;
};

type ChartInteractionPayloadEntry = {
  payload?: ChartPoint;
};

type ChartInteractionEventState = {
  activeCoordinate?: Partial<ChartCoordinate>;
  activeLabel?: TooltipValueType;
  activePayload?: ChartInteractionPayloadEntry[];
  activeTooltipIndex?: number | string;
  chartX?: number;
  chartY?: number;
  isTooltipActive?: boolean;
};

const TOOLTIP_CONTAINER_CLASS =
  'viz-tooltip-shell w-[min(18rem,calc(100vw-0.75rem))] max-h-[calc(100%-0.75rem)] max-w-[calc(100vw-0.75rem)] space-y-3 overflow-y-auto rounded-[24px] p-3.5 text-[10px] text-[var(--color-slate-700)] shadow-[0_28px_64px_-32px_rgba(15,23,42,0.46)] sm:w-[264px] sm:max-h-[calc(100%-1rem)] sm:max-w-none sm:p-4 sm:text-[11px]';
const TOOLTIP_EDGE_PADDING = 10;
const TOOLTIP_MOUSE_GAP_X = 18;
const TOOLTIP_MOUSE_GAP_Y = 18;
const TOOLTIP_TOUCH_GAP_X = 28;
const TOOLTIP_TOUCH_GAP_Y = 18;

const trendStateColors: Record<ChartPoint['trendState'], string> = {
  loss: 'var(--color-red-450)',
  under: 'var(--color-primary-300)',
  above: 'var(--color-green-500)',
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeTooltipIndex = (value: unknown): number | null => {
  if (Number.isInteger(value)) {
    return value as number;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
};

const hasNativeEvent = (value: unknown): value is { nativeEvent?: unknown } =>
  typeof value === 'object' && value !== null && 'nativeEvent' in value;

const unwrapNativeEvent = (value: unknown) => (hasNativeEvent(value) ? value.nativeEvent ?? value : value);

const hasClientPoint = (value: unknown): value is { clientX: number; clientY: number } =>
  typeof value === 'object' &&
  value !== null &&
  isFiniteNumber((value as { clientX?: unknown }).clientX) &&
  isFiniteNumber((value as { clientY?: unknown }).clientY);

const getFirstTouchPoint = (value: unknown): { clientX: number; clientY: number } | null => {
  if (!value || typeof value !== 'object' || !('length' in value)) {
    return null;
  }

  const touch = (value as ArrayLike<unknown>)[0];
  return hasClientPoint(touch) ? touch : null;
};

const getClientPointFromEvent = (value: unknown): { clientX: number; clientY: number } | null => {
  const event = unwrapNativeEvent(value);

  if (hasClientPoint(event)) {
    return event;
  }

  if (typeof event !== 'object' || event === null) {
    return null;
  }

  return (
    getFirstTouchPoint((event as { changedTouches?: unknown }).changedTouches) ??
    getFirstTouchPoint((event as { touches?: unknown }).touches)
  );
};

const isTouchLikeEvent = (value: unknown) => {
  const event = unwrapNativeEvent(value);

  if (typeof event !== 'object' || event === null) {
    return false;
  }

  if (
    getFirstTouchPoint((event as { changedTouches?: unknown }).changedTouches) ||
    getFirstTouchPoint((event as { touches?: unknown }).touches)
  ) {
    return true;
  }

  return 'identifier' in event && !('button' in event);
};

const resolveTooltipOverlayPosition = ({
  containerHeight,
  containerWidth,
  mode,
  overlayHeight,
  overlayWidth,
  pointer,
}: {
  containerHeight: number;
  containerWidth: number;
  mode: ChartInteractionMode;
  overlayHeight: number;
  overlayWidth: number;
  pointer: ChartCoordinate;
}): TooltipOverlayPosition => {
  const gapX = mode === 'touch' ? TOOLTIP_TOUCH_GAP_X : TOOLTIP_MOUSE_GAP_X;
  const gapY = mode === 'touch' ? TOOLTIP_TOUCH_GAP_Y : TOOLTIP_MOUSE_GAP_Y;
  const preferRight = pointer.x <= containerWidth / 2;
  const preferAbove = pointer.y >= overlayHeight + gapY + TOOLTIP_EDGE_PADDING;
  const horizontalDirections: Array<'left' | 'right'> = preferRight ? ['right', 'left'] : ['left', 'right'];
  const verticalDirections: Array<'above' | 'below'> = preferAbove ? ['above', 'below'] : ['below', 'above'];

  const buildCandidate = (horizontal: 'left' | 'right', vertical: 'above' | 'below') => {
    const left = horizontal === 'right' ? pointer.x + gapX : pointer.x - overlayWidth - gapX;
    const top = vertical === 'above' ? pointer.y - overlayHeight - gapY : pointer.y + gapY;

    return {
      left,
      top,
      transformOrigin: `${horizontal === 'right' ? 'left' : 'right'} ${
        vertical === 'above' ? 'bottom' : 'top'
      }`,
    };
  };

  const candidates = horizontalDirections.flatMap((horizontal) =>
    verticalDirections.map((vertical) => buildCandidate(horizontal, vertical))
  );

  const fitsWithinBounds = (candidate: TooltipOverlayPosition) =>
    candidate.left >= TOOLTIP_EDGE_PADDING &&
    candidate.top >= TOOLTIP_EDGE_PADDING &&
    candidate.left + overlayWidth <= containerWidth - TOOLTIP_EDGE_PADDING &&
    candidate.top + overlayHeight <= containerHeight - TOOLTIP_EDGE_PADDING;

  const chosen = candidates.find(fitsWithinBounds) ?? candidates[0];
  const maxLeft = Math.max(TOOLTIP_EDGE_PADDING, containerWidth - overlayWidth - TOOLTIP_EDGE_PADDING);
  const maxTop = Math.max(TOOLTIP_EDGE_PADDING, containerHeight - overlayHeight - TOOLTIP_EDGE_PADDING);

  return {
    ...chosen,
    left: clampValue(chosen.left, TOOLTIP_EDGE_PADDING, maxLeft),
    top: clampValue(chosen.top, TOOLTIP_EDGE_PADDING, maxTop),
  };
};

const resolveTrendState = (
  netValue: number,
  forecastValue: number
): ChartPoint['trendState'] => {
  if (!Number.isFinite(netValue) || !Number.isFinite(forecastValue)) {
    return 'above';
  }

  if (netValue <= 0) {
    return 'loss';
  }

  if (netValue < forecastValue) {
    return 'under';
  }

  return 'above';
};

const ActiveNetLineDot = ({
  cx,
  cy,
  isActive,
  payload,
}: {
  cx?: number;
  cy?: number;
  isActive?: boolean;
  payload?: ChartPoint;
}) => {
  if (!isActive || typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }

  const point = payload as ChartPoint | undefined;
  const color = point ? trendStateColors[point.trendState] : trendStateColors.above;

  return (
    <g>
      <circle cx={cx} cy={cy} r={22} fill={color} fillOpacity={0.12} />
      <circle cx={cx} cy={cy} r={11} fill={color} fillOpacity={0.16} />
      <circle cx={cx} cy={cy} r={6.25} strokeWidth={2.25} stroke={color} fill="var(--color-neutral-white)" />
      <circle cx={cx} cy={cy} r={2} fill={color} />
    </g>
  );
};

interface ChartTooltipProps {
  label?: TooltipValueType;
  point: ChartPoint;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  labelFormatter: (label: TooltipValueType) => string;
  labels: {
    at: string;
    net: string;
    forecast: string;
    change: string;
    projection: string;
    usd: string;
    ils: string;
  };
}

const formatSignedCurrency = (value: number, formatter: (value: number) => string) => {
  if (value === 0) {
    return formatter(0);
  }

  const formatted = formatter(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

const resolveForecastGapVisuals = (
  value: number
): { text: string; badge: string; border: string; background: string; icon: JSX.Element } => {
  if (value > 0) {
    return {
      text: 'text-emerald-600',
      badge: 'bg-emerald-100/90 text-emerald-700 ring-1 ring-inset ring-emerald-200/80',
      border: 'border-emerald-200/80',
      background: 'from-emerald-500/16 via-emerald-400/8 to-white',
      icon: <ArrowUpRight className="h-4 w-4" />,
    };
  }

  if (value < 0) {
    return {
      text: 'text-rose-600',
      badge: 'bg-rose-100/90 text-rose-700 ring-1 ring-inset ring-rose-200/80',
      border: 'border-rose-200/80',
      background: 'from-rose-500/16 via-rose-400/8 to-white',
      icon: <ArrowDownRight className="h-4 w-4" />,
    };
  }

  return {
    text: 'text-slate-600',
    badge: 'bg-slate-100/95 text-slate-700 ring-1 ring-inset ring-slate-200/80',
    border: 'border-slate-200/80',
    background: 'from-slate-500/8 via-slate-300/6 to-white',
    icon: <Minus className="h-4 w-4" />,
  };
};

const ChartTooltip = ({
  label,
  point,
  formatUsd,
  formatIls,
  labelFormatter,
  labels,
}: ChartTooltipProps) => {
  const changeUsd = point.deltaUsd;
  const changeIls = point.deltaIls;
  const projectionGapUsd = point.netValue - point.expectedValueUsd;
  const projectionGapIls = point.netValueIls - point.expectedValueIls;
  const forecastUsd = point.forecastValueUsd ?? point.expectedValueUsd;
  const forecastIls = point.forecastValueIls ?? point.expectedValueIls;

  const projectionClass = projectionGapUsd > 0 ? 'text-emerald-600' : projectionGapUsd < 0 ? 'text-rose-600' : 'text-slate-600';
  const projectionCardClass =
    projectionGapUsd > 0
      ? 'border-emerald-200/75 bg-emerald-50/60'
      : projectionGapUsd < 0
      ? 'border-rose-200/75 bg-rose-50/60'
      : 'border-slate-200/80 bg-slate-50/70';

  const netUsd = point.netValue;
  const netIls = point.netValueIls;

  const changeClass = changeUsd > 0 ? 'text-emerald-600' : changeUsd < 0 ? 'text-rose-600' : 'text-slate-600';

  return (
    <div className={TOOLTIP_CONTAINER_CLASS} dir="auto">
      <div className="viz-panel rounded-[20px] border-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-start">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400 sm:text-[10px]">{labels.at}</p>
            <p className="mt-1 break-words text-[11px] font-semibold leading-tight text-slate-800 sm:text-[13px]">
              {labelFormatter(label ?? '')}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border border-white/70 px-2.5 py-1 text-[10px] font-semibold shadow-sm ${
              changeUsd > 0
                ? 'bg-emerald-50 text-emerald-700'
                : changeUsd < 0
                ? 'bg-rose-50 text-rose-700'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <span className="[unicode-bidi:isolate]" dir="ltr">
              {formatSignedCurrency(changeUsd, formatUsd)}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-2.5">
        <div className="viz-panel min-w-0 overflow-hidden rounded-[18px] border-sky-100/90 px-3 py-2.5 shadow-[0_18px_30px_-28px_rgba(14,165,233,0.55)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-700 sm:text-[10px]">{labels.net}</p>
            <p className="break-words text-right text-[12px] font-semibold leading-tight text-slate-900 [unicode-bidi:isolate] sm:text-[14px]" dir="ltr">{formatUsd(netUsd)}</p>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 [unicode-bidi:isolate]" dir="ltr">{formatIls(netIls)}</p>
        </div>

        <div className="viz-panel min-w-0 overflow-hidden rounded-[18px] border-amber-200/85 px-3 py-2.5 shadow-[0_18px_30px_-28px_rgba(245,158,11,0.5)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-700 sm:text-[10px]">{labels.forecast}</p>
            <p className="break-words text-right text-[12px] font-semibold leading-tight text-slate-900 [unicode-bidi:isolate] sm:text-[14px]" dir="ltr">{formatUsd(forecastUsd)}</p>
          </div>
          <p className="mt-1 text-[10px] text-slate-500 [unicode-bidi:isolate]" dir="ltr">{formatIls(forecastIls)}</p>
        </div>

        <div className={`viz-panel rounded-[18px] border px-3 py-2.5 shadow-[0_20px_34px_-30px_rgba(15,23,42,0.45)] ${projectionCardClass}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[10px]">{labels.projection}</p>
            <p className={`break-words text-right text-[12px] font-semibold [unicode-bidi:isolate] sm:text-[13px] ${projectionClass}`} dir="ltr">
              {formatSignedCurrency(projectionGapUsd, formatUsd)}
            </p>
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-[10px] font-medium text-slate-500">{labels.ils}</span>
            <span className={`min-w-0 break-words text-right text-[10px] font-semibold [unicode-bidi:isolate] ${projectionClass}`} dir="ltr">
              {formatSignedCurrency(projectionGapIls, formatIls)}
            </span>
          </div>
          <div className="mt-2 border-t border-black/5 pt-2">
            <p className="flex items-start justify-between gap-2 text-[10px] text-slate-500">
              <span className="font-medium">{labels.change}</span>
              <span className={`font-semibold [unicode-bidi:isolate] ${changeClass}`} dir="ltr">
                {formatSignedCurrency(changeUsd, formatUsd)}
              </span>
            </p>
            <p className="mt-1 flex items-start justify-between gap-2 text-[10px] text-slate-500">
              <span className="font-medium">{labels.ils}</span>
              <span className={`font-semibold [unicode-bidi:isolate] ${changeClass}`} dir="ltr">
                {formatSignedCurrency(changeIls, formatIls)}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export function PortfolioOverviewChart({ data, summary }: PortfolioOverviewChartProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const isMobile = useIsMobile();
  const chartSurfaceRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const touchInteractionRef = useRef(false);
  const [activeInteraction, setActiveInteraction] = useState<ChartInteractionState | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipOverlayPosition | null>(null);
  const isRtl = locale === 'he';
  const contentAlignClass = isRtl ? 'text-right' : 'text-left';
  const withRtlMark = (value: TooltipValueType) => {
    const text = value?.toString?.() ?? '';
    return isRtl ? `\u200F${text}` : text;
  };
  const gradientReactId = useId();
  const netLineGradientId = useMemo(
    () => `portfolio-overview-gradient-${gradientReactId.replace(/[:]/g, '-')}`,
    [gradientReactId]
  );
  const netAreaGradientId = useMemo(
    () => `portfolio-overview-area-${gradientReactId.replace(/[:]/g, '-')}`,
    [gradientReactId]
  );

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const usdFormatter = (value: number) => formatCurrency(value, 'USD', locale);
  const ilsFormatter = (value: number) => formatCurrency(value, 'ILS', locale);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [localeCode]
  );
  const tooltipDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [localeCode]
  );
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [localeCode]
  );

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!data.length) {
      return [];
    }

    const sortedPoints = [...data].sort((a, b) => a.timestamp - b.timestamp);

    return sortedPoints.map((point, index) => {
      const netValue =
        typeof point.netPnLUsd === 'number' ? point.netPnLUsd : point.totalPnLUsd ?? 0;
      const netValueIls =
        typeof point.netPnLIls === 'number'
          ? point.netPnLIls
          : netValue * summary.usdToIlsRate;
      const expectedValueUsd =
        typeof point.expectedNetPnLUsd === 'number'
          ? point.expectedNetPnLUsd
          : netValue;
      const expectedValueIls =
        typeof point.expectedNetPnLIls === 'number'
          ? point.expectedNetPnLIls
          : expectedValueUsd * summary.usdToIlsRate;
      const forecastValueUsd = expectedValueUsd;
      const forecastValueIls = expectedValueIls;
      const previousPoint = index > 0 ? sortedPoints[index - 1] : undefined;
      const previousNetUsd = previousPoint
        ? typeof previousPoint.netPnLUsd === 'number'
          ? previousPoint.netPnLUsd
          : previousPoint.totalPnLUsd ?? netValue
        : netValue;
      const deltaUsd = netValue - previousNetUsd;
      const deltaIls = deltaUsd * summary.usdToIlsRate;

      const spyValueUsd = point.spyNetPnLUsd ?? 0;
      const spyValueIls = point.spyNetPnLIls ?? (spyValueUsd * summary.usdToIlsRate);

      const forecastBaselineUsd = Number.isFinite(forecastValueUsd)
        ? forecastValueUsd
        : expectedValueUsd;
      const trendState = resolveTrendState(netValue, forecastBaselineUsd);

      return {
        ...point,
        netValue,
        netValueIls,
        expectedValueUsd,
        expectedValueIls,
        forecastValueUsd,
        forecastValueIls,
        deltaUsd,
        deltaIls,
        spyValueUsd,
        spyValueIls,
        trendState,
      };
    });
  }, [data, summary.usdToIlsRate]);

  const netLineGradientStops = useMemo<GradientStop[]>(() => {
    if (chartPoints.length === 0) {
      return [];
    }

    if (chartPoints.length === 1) {
      const color = trendStateColors[chartPoints[0].trendState];
      return [
        { offset: 0, color },
        { offset: 100, color },
      ];
    }

    const firstPoint = chartPoints[0];
    const lastPoint = chartPoints[chartPoints.length - 1];
    const minTimestamp = firstPoint.timestamp;
    const maxTimestamp = lastPoint.timestamp;
    const range = maxTimestamp - minTimestamp || 1;

    const interpolate = (start: number, end: number, alpha: number) => start + (end - start) * alpha;
    const clampOffset = (timestamp: number) => {
      const normalized = ((timestamp - minTimestamp) / range) * 100;
      const clamped = Math.max(0, Math.min(100, normalized));
      const precise = Number.isFinite(clamped) ? Number(clamped.toFixed(3)) : 0;
      return precise;
    };

    const classifyAt = (prev: ChartPoint, current: ChartPoint, alpha: number) => {
      const boundedAlpha = Math.max(0, Math.min(1, alpha));
      const netValue = interpolate(prev.netValue, current.netValue, boundedAlpha);
      const forecastValue = interpolate(prev.forecastValueUsd, current.forecastValueUsd, boundedAlpha);
      return resolveTrendState(netValue, forecastValue);
    };

    const appendStop = (stops: GradientStop[], timestamp: number, color: string) => {
      const offset = clampOffset(timestamp);
      const lastStop = stops[stops.length - 1];

      if (lastStop && lastStop.offset === offset) {
        if (lastStop.color !== color) {
          stops.push({ offset, color });
        }
        return;
      }

      stops.push({ offset, color });
    };

    const stops: GradientStop[] = [];
    let activeColor = trendStateColors[firstPoint.trendState];
    appendStop(stops, minTimestamp, activeColor);

    for (let index = 1; index < chartPoints.length; index += 1) {
      const prev = chartPoints[index - 1];
      const current = chartPoints[index];
      const segmentDuration = current.timestamp - prev.timestamp;
      const candidateEvents: number[] = [];

      const netDelta = current.netValue - prev.netValue;
      if (netDelta !== 0) {
        const zeroAlpha = (0 - prev.netValue) / netDelta;
        if (zeroAlpha > 0 && zeroAlpha < 1) {
          candidateEvents.push(zeroAlpha);
        }
      }

      const forecastDelta =
        current.netValue - current.forecastValueUsd - (prev.netValue - prev.forecastValueUsd);
      if (forecastDelta !== 0) {
        const prevGap = prev.netValue - prev.forecastValueUsd;
        const forecastAlpha = -prevGap / forecastDelta;
        if (forecastAlpha > 0 && forecastAlpha < 1) {
          candidateEvents.push(forecastAlpha);
        }
      }

      candidateEvents
        .sort((a, b) => a - b)
        .forEach((eventAlpha) => {
          const beforeState = classifyAt(prev, current, Math.max(eventAlpha - 1e-4, 0));
          const afterState = classifyAt(prev, current, Math.min(eventAlpha + 1e-4, 1));

          if (beforeState === afterState) {
            return;
          }

          const eventTimestamp = prev.timestamp + segmentDuration * eventAlpha;
          appendStop(stops, eventTimestamp, activeColor);

          activeColor = trendStateColors[afterState];
          appendStop(stops, eventTimestamp, activeColor);
        });

      const currentColor = trendStateColors[current.trendState];
      if (currentColor !== activeColor) {
        appendStop(stops, current.timestamp, activeColor);
        activeColor = currentColor;
        appendStop(stops, current.timestamp, activeColor);
      }
    }

    appendStop(stops, maxTimestamp, activeColor);

    if (stops[0]?.offset !== 0) {
      stops.unshift({ offset: 0, color: stops[0]?.color ?? activeColor });
    }

    if (stops[stops.length - 1]?.offset !== 100) {
      stops.push({ offset: 100, color: stops[stops.length - 1]?.color ?? activeColor });
    }

    return stops;
  }, [chartPoints]);

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (!chartPoints.length) {
      return undefined;
    }

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    chartPoints.forEach((point) => {
      minValue = Math.min(
        minValue,
        point.netValue,
        point.expectedValueUsd,
        point.forecastValueUsd,
        point.totalPnLUsd,
        point.spyValueUsd
      );
      maxValue = Math.max(
        maxValue,
        point.netValue,
        point.expectedValueUsd,
        point.forecastValueUsd,
        point.totalPnLUsd,
        point.spyValueUsd
      );
    });

    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return undefined;
    }

    if (minValue === maxValue) {
      const pad = Math.max(Math.abs(minValue) * 0.25, 1);
      return [minValue - pad, maxValue + pad];
    }

    const pad = (maxValue - minValue) * 0.12;
    return [minValue - pad, maxValue + pad];
  }, [chartPoints]);

  const trendPoint = chartPoints[chartPoints.length - 1];
  const openPnLUsd = summary.totalCurrentPnLUsd - summary.totalRealizedProfitUsd;
  const openPnLIls = summary.totalCurrentPnLIls - summary.totalRealizedProfitIls;
  const realizedPnLUsd = summary.totalRealizedProfitUsd;
  const realizedPnLIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;
  const netPnLUsd = summary.totalNetPnLUsd;
  const netPnLIls = summary.totalNetPnLIls;
  const projectedPnLUsd = summary.totalProjectedPnLUsd;
  const projectedPnLIls = summary.totalProjectedPnLIls;
  const netForecastGapUsd = netPnLUsd - projectedPnLUsd;
  const netForecastGapIls = netPnLIls - projectedPnLIls;
  const forecastGapVisuals = resolveForecastGapVisuals(netForecastGapUsd);

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!chartPoints.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return chartPoints.reduce(
      (acc, point) => {
        if (!acc.bestPoint || point.netValue > acc.bestPoint.netValue) {
          acc.bestPoint = point;
        }

        if (!acc.worstPoint || point.netValue < acc.worstPoint.netValue) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as ChartPoint | null, worstPoint: null as ChartPoint | null }
    );
  }, [chartPoints]);

  const trendTone = trendPoint?.netValue ?? netPnLUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass =
    trendTone > 0
      ? 'bg-emerald-50 text-emerald-600'
      : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValueUsd = bestPoint ? usdFormatter(bestPoint.netValue) : '—';
  const formattedBestValueIls = bestPoint ? ilsFormatter(bestPoint.netValueIls) : '—';
  const formattedWorstValueUsd = worstPoint ? usdFormatter(worstPoint.netValue) : '—';
  const formattedWorstValueIls = worstPoint ? ilsFormatter(worstPoint.netValueIls) : '—';
  const timelineRangeLabel =
    chartPoints.length > 1
      ? withRtlMark(
          `${dateFormatter.format(new Date(chartPoints[0].timestamp))} - ${dateFormatter.format(
            new Date(chartPoints[chartPoints.length - 1].timestamp)
          )}`
        )
      : chartPoints.length === 1
      ? withRtlMark(dateFormatter.format(new Date(chartPoints[0].timestamp)))
      : '—';
  const observationCountLabel = locale === 'he' ? `${chartPoints.length} נקודות` : `${chartPoints.length} points`;
  const chartSectionEyebrow = locale === 'he' ? 'מסלול ביצועים' : 'Performance track';
  const chartSectionDescription =
    locale === 'he'
      ? 'קרא את הקו המרכזי מול תחזית היעד והמדד להשוואה, עם דגש על נקודות המעבר.'
      : 'Read the live net curve against the forecast path and the benchmark, with emphasis on transition zones.';
  const chartLegendDescription =
    locale === 'he'
      ? 'צבע הקו הראשי מסמן הפסד, פיגור מול התחזית או ביצוע מעליה.'
      : 'The live line color signals loss, under-forecast performance, or outperformance.';
  const chartMargins = useMemo(
    () =>
      isMobile
        ? { top: 76, right: 8, left: 2, bottom: 20 }
        : { top: 88, right: 22, left: 10, bottom: 26 },
    [isMobile]
  );
  const tooltipLabels = useMemo(
    () => ({
      at: t.dashboard.timelineTooltipMoment,
      net: t.dashboard.netPnL,
      forecast: t.dashboard.timelineTooltipForecast,
      change: t.dashboard.timelineTooltipChange,
      projection: t.dashboard.timelineTooltipProjection,
      usd: t.dashboard.usdLabel,
      ils: t.dashboard.ilsLabel,
    }),
    [t]
  );
  const tooltipLabelFormatter = (value: TooltipValueType) => {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      return withRtlMark(tooltipDateFormatter.format(new Date(numericValue)));
    }

    return withRtlMark(value);
  };
  const formatCompactSignedValue = (value: number) => {
    const formatted = compactFormatter.format(Math.abs(value));

    if (value > 0) {
      return `+${formatted}`;
    }

    if (value < 0) {
      return `-${formatted}`;
    }

    return compactFormatter.format(0);
  };
  const heroSummaryCards = [
    {
      key: 'current',
      label: t.dashboard.currentPnL,
      usd: usdFormatter(openPnLUsd),
      ils: ilsFormatter(openPnLIls),
      labelClass: 'text-sky-700',
      valueClass: 'text-slate-950',
      borderClass: 'border-sky-100/85',
      surfaceClass: 'from-sky-500/14 via-white to-white',
    },
    {
      key: 'realized',
      label: t.dashboard.realizedPnL,
      usd: usdFormatter(realizedPnLUsd),
      ils: ilsFormatter(realizedPnLIls),
      labelClass: 'text-emerald-700',
      valueClass: 'text-slate-950',
      borderClass: 'border-emerald-100/85',
      surfaceClass: 'from-emerald-500/14 via-white to-white',
    },
    {
      key: 'taxes',
      label: t.dashboard.taxesPaid,
      usd: usdFormatter(taxesUsd * -1),
      ils: ilsFormatter(taxesIls * -1),
      labelClass: 'text-rose-700',
      valueClass: 'text-rose-700',
      borderClass: 'border-rose-100/85',
      surfaceClass: 'from-rose-500/14 via-white to-white',
    },
    {
      key: 'projected',
      label: t.dashboard.projectedPnL,
      usd: usdFormatter(projectedPnLUsd),
      ils: ilsFormatter(projectedPnLIls),
      labelClass: 'text-amber-700',
      valueClass: 'text-slate-950',
      borderClass: 'border-amber-100/85',
      surfaceClass: 'from-amber-500/14 via-white to-white',
    },
    {
      key: 'best',
      label: t.dashboard.bestPnL,
      usd: formattedBestValueUsd,
      ils: formattedBestValueIls,
      meta: formattedBestDate,
      labelClass: 'text-emerald-700',
      valueClass: 'text-slate-950',
      borderClass: 'border-emerald-100/85',
      surfaceClass: 'from-emerald-500/12 via-white to-white',
    },
    {
      key: 'worst',
      label: t.dashboard.worstPnL,
      usd: formattedWorstValueUsd,
      ils: formattedWorstValueIls,
      meta: formattedWorstDate,
      labelClass: 'text-rose-700',
      valueClass: 'text-slate-950',
      borderClass: 'border-rose-100/85',
      surfaceClass: 'from-rose-500/12 via-white to-white',
    },
  ];
  const chartSnapshotCards = [
    {
      key: 'live-net',
      label: t.dashboard.netPnL,
      value: formatCompactSignedValue(netPnLUsd),
      secondary: ilsFormatter(netPnLIls),
      toneClass:
        trendTone > 0 ? 'text-emerald-100' : trendTone < 0 ? 'text-rose-100' : 'text-slate-100',
      chipClass:
        trendTone > 0
          ? 'bg-emerald-400'
          : trendTone < 0
          ? 'bg-rose-400'
          : 'bg-slate-300',
    },
    {
      key: 'forecast',
      label: t.dashboard.projectedPnL,
      value: formatCompactSignedValue(projectedPnLUsd),
      secondary: ilsFormatter(projectedPnLIls),
      toneClass: 'text-amber-100',
      chipClass: 'bg-amber-400',
    },
    {
      key: 'benchmark',
      label: 'S&P 500',
      value: formatCompactSignedValue(trendPoint?.spyValueUsd ?? 0),
      secondary: ilsFormatter(trendPoint?.spyValueIls ?? 0),
      toneClass: 'text-slate-100',
      chipClass: 'bg-slate-300',
    },
  ];
  const legendItems = [
    {
      key: 'loss',
      label: t.dashboard.timelineLegendActualLoss,
      description: locale === 'he' ? 'נטו מתחת לאפס' : 'Net below zero',
      preview: <span className="block h-2 w-10 rounded-full bg-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.35)]" />,
    },
    {
      key: 'under',
      label: t.dashboard.timelineLegendActualUnder,
      description: locale === 'he' ? 'חיובי אך מתחת לתחזית' : 'Positive but below forecast',
      preview: <span className="block h-2 w-10 rounded-full bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.35)]" />,
    },
    {
      key: 'above',
      label: t.dashboard.timelineLegendActualAbove,
      description: locale === 'he' ? 'נטו מעל התחזית' : 'Net above forecast',
      preview: <span className="block h-2 w-10 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.35)]" />,
    },
    {
      key: 'forecast',
      label: t.dashboard.timelineLegendForecast,
      description: locale === 'he' ? 'מסלול היעד' : 'Target path',
      preview: <span className="block h-[7px] w-10 rounded-full border-2 border-dashed border-amber-400" />,
    },
    {
      key: 'spy',
      label: 'S&P 500',
      description: locale === 'he' ? 'מדד השוואה' : 'Benchmark',
      preview: <span className="block h-[7px] w-10 rounded-full border-2 border-dashed border-slate-300" />,
    },
  ];
  const hideActiveInteraction = useCallback(() => {
    touchInteractionRef.current = false;
    setActiveInteraction(null);
    setTooltipPosition(null);
  }, []);
  const syncActiveInteraction = useCallback(
    (
      nextState: ChartInteractionEventState,
      event: unknown,
      mode: ChartInteractionMode
    ) => {
      const nextIndex = normalizeTooltipIndex(nextState.activeTooltipIndex);
      const payloadPoint =
        nextState.activePayload?.find((entry) => entry && entry.payload)?.payload ?? null;
      const point =
        payloadPoint ??
        (nextIndex !== null && nextIndex >= 0 && nextIndex < chartPoints.length
          ? chartPoints[nextIndex]
          : null);
      const coordinateX = nextState.activeCoordinate?.x ?? nextState.chartX;
      const coordinateY = nextState.activeCoordinate?.y ?? nextState.chartY;

      if (
        !point ||
        nextIndex === null ||
        !isFiniteNumber(coordinateX) ||
        !isFiniteNumber(coordinateY) ||
        nextState.isTooltipActive === false
      ) {
        setActiveInteraction(null);
        setTooltipPosition(null);
        return;
      }

      const surfaceBounds = chartSurfaceRef.current?.getBoundingClientRect();
      const clientPoint = getClientPointFromEvent(event);
      const pointer =
        surfaceBounds && clientPoint
          ? {
              x: clampValue(clientPoint.clientX - surfaceBounds.left, 0, surfaceBounds.width),
              y: clampValue(clientPoint.clientY - surfaceBounds.top, 0, surfaceBounds.height),
            }
          : {
              x: coordinateX,
              y: coordinateY,
            };

      setActiveInteraction({
        coordinate: { x: coordinateX, y: coordinateY },
        index: nextIndex,
        label: nextState.activeLabel ?? point.timestamp,
        mode,
        point,
        pointer: mode === 'touch' ? pointer : { x: coordinateX, y: coordinateY },
      });
    },
    [chartPoints]
  );
  const syncTouchInteractionFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!chartPoints.length) {
        return;
      }

      const surfaceBounds = chartSurfaceRef.current?.getBoundingClientRect();
      if (!surfaceBounds || !surfaceBounds.width || !surfaceBounds.height) {
        return;
      }

      const pointerX = clampValue(clientX - surfaceBounds.left, 0, surfaceBounds.width);
      const pointerY = clampValue(clientY - surfaceBounds.top, 0, surfaceBounds.height);
      const firstTimestamp = chartPoints[0]?.timestamp ?? 0;
      const lastTimestamp = chartPoints[chartPoints.length - 1]?.timestamp ?? firstTimestamp;
      const timeRange = Math.max(lastTimestamp - firstTimestamp, 1);
      const targetTimestamp = firstTimestamp + (pointerX / surfaceBounds.width) * timeRange;

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      chartPoints.forEach((point, index) => {
        const distance = Math.abs(point.timestamp - targetTimestamp);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      const point = chartPoints[nearestIndex];

      if (!point) {
        return;
      }

      setActiveInteraction({
        coordinate: { x: pointerX, y: pointerY },
        index: nearestIndex,
        label: point.timestamp,
        mode: 'touch',
        point,
        pointer: { x: pointerX, y: pointerY },
      });
    },
    [chartPoints]
  );
  const handleChartPointerMove = useCallback(
    (nextState: ChartInteractionEventState, event: unknown) => {
      const mode: ChartInteractionMode =
        touchInteractionRef.current || isTouchLikeEvent(event) ? 'touch' : 'mouse';
      syncActiveInteraction(nextState, event, mode);
    },
    [syncActiveInteraction]
  );
  const handleChartPointerDown = useCallback(
    (nextState: ChartInteractionEventState, event: unknown) => {
      if (!isTouchLikeEvent(event)) {
        return;
      }

      touchInteractionRef.current = true;
      syncActiveInteraction(nextState, event, 'touch');
    },
    [syncActiveInteraction]
  );
  const handleChartPointerUp = useCallback(
    (_nextState: ChartInteractionEventState, event: unknown) => {
      if (touchInteractionRef.current || isTouchLikeEvent(event)) {
        hideActiveInteraction();
      }
    },
    [hideActiveInteraction]
  );
  const handleChartSurfaceTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) {
        return;
      }

      touchInteractionRef.current = true;
      syncTouchInteractionFromClientPoint(touch.clientX, touch.clientY);
    },
    [syncTouchInteractionFromClientPoint]
  );
  const handleChartSurfaceTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (!touch) {
        return;
      }

      touchInteractionRef.current = true;
      syncTouchInteractionFromClientPoint(touch.clientX, touch.clientY);
    },
    [syncTouchInteractionFromClientPoint]
  );
  const renderNetLineDot = useCallback(
    (props: { cx?: number; cy?: number; index?: number; payload?: ChartPoint }) => {
      const key = props.payload?.timestamp ?? props.index ?? 'active';

      return (
        <ActiveNetLineDot
          key={`net-line-dot-${key}`}
          cx={props.cx}
          cy={props.cy}
          isActive={props.index === activeInteraction?.index}
          payload={props.payload}
        />
      );
    },
    [activeInteraction?.index]
  );

  useEffect(() => {
    if (!activeInteraction) {
      return;
    }

    const surfaceElement = chartSurfaceRef.current;
    const tooltipElement = tooltipRef.current;

    if (!surfaceElement || !tooltipElement) {
      return;
    }

    const surfaceBounds = surfaceElement.getBoundingClientRect();
    const tooltipBounds = tooltipElement.getBoundingClientRect();

    if (!surfaceBounds.width || !surfaceBounds.height || !tooltipBounds.width || !tooltipBounds.height) {
      return;
    }

    const nextTooltipPosition = resolveTooltipOverlayPosition({
      containerHeight: surfaceBounds.height,
      containerWidth: surfaceBounds.width,
      mode: activeInteraction.mode,
      overlayHeight: tooltipBounds.height,
      overlayWidth: tooltipBounds.width,
      pointer: activeInteraction.mode === 'touch' ? activeInteraction.pointer : activeInteraction.coordinate,
    });

    const frame = window.requestAnimationFrame(() => {
      setTooltipPosition(nextTooltipPosition);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeInteraction]);

  return (
    <Card className="viz-panel viz-panel-strong relative isolate z-[11] min-w-0 overflow-hidden rounded-[34px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] shadow-[0_34px_72px_-40px_rgba(15,23,42,0.34)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.1),transparent_28%)]" />
      <CardHeader className="relative overflow-hidden border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))] px-6 py-6 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(14,165,233,0),rgba(14,165,233,0.7),rgba(52,211,153,0.6),rgba(14,165,233,0))]" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className={`max-w-3xl space-y-3 ${contentAlignClass}`}>
            <span className="viz-chip viz-chip-blue inline-flex w-fit items-center gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 shadow-[0_16px_26px_-24px_rgba(14,165,233,0.75)]">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              {locale === 'he' ? 'הקשר התיק' : 'Portfolio context'}
            </span>
            <div className="space-y-2">
              <CardTitle className="text-balance text-[clamp(1.35rem,2vw,1.75rem)] font-black tracking-tight text-slate-950">
                {t.dashboard.portfolioOverviewTitle}
              </CardTitle>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">{t.dashboard.portfolioOverviewDescription}</p>
            </div>
          </div>

          <div className={`flex flex-wrap gap-2.5 ${isRtl ? 'xl:justify-start' : 'xl:justify-end'}`}>
            <span className={`viz-chip inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold shadow-sm ${badgeClass}`}>
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              {toneClass === 'text-emerald-600'
                ? t.dashboard.positiveTrend
                : toneClass === 'text-rose-600'
                ? t.dashboard.negativeTrend
                : t.dashboard.neutralTrend}
            </span>
            <span className="viz-chip inline-flex items-center rounded-full px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm [unicode-bidi:isolate]" dir="auto">
              {timelineRangeLabel}
            </span>
            <span className="viz-chip hidden items-center rounded-full px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm sm:inline-flex">
              {observationCountLabel}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative min-w-0 px-4 pb-4 pt-5 sm:px-6 sm:pb-6">
        <div className="space-y-6">
          <div className="viz-panel viz-panel-strong relative overflow-hidden rounded-[32px] border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.82),rgba(248,250,252,0.98))] p-4 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.34)] sm:p-6">
            <div className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full bg-sky-200/35 blur-3xl" />
            <div className="pointer-events-none absolute -right-8 bottom-0 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="relative flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
              <div className={`space-y-4 ${contentAlignClass}`}>
                <div className={`viz-chip inline-flex items-center gap-2 self-start px-3 py-1.5 text-xs font-semibold shadow-sm ${badgeClass}`}>
                  <span className="h-2.5 w-2.5 rounded-full bg-current" />
                  {toneClass === 'text-emerald-600'
                    ? t.dashboard.positiveTrend
                    : toneClass === 'text-rose-600'
                    ? t.dashboard.negativeTrend
                    : t.dashboard.neutralTrend}
                </div>

                <div className="viz-panel overflow-hidden rounded-[28px] border-slate-200/85 bg-[linear-gradient(155deg,rgba(255,255,255,0.94),rgba(241,245,249,0.94))] p-4 shadow-[0_26px_48px_-34px_rgba(15,23,42,0.4)] sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t.dashboard.netPnL}</p>
                  <p className={`mt-3 text-[clamp(1.75rem,9vw,3rem)] font-black leading-none tracking-tight [unicode-bidi:isolate] ${toneClass}`} dir="ltr">
                    {usdFormatter(netPnLUsd)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-500 [unicode-bidi:isolate]" dir="ltr">{ilsFormatter(netPnLIls)}</p>

                  <div className={`mt-4 rounded-[24px] border bg-gradient-to-br ${forecastGapVisuals.background} p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:mt-5 sm:p-4 ${forecastGapVisuals.border}`}>
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold shadow-sm ${forecastGapVisuals.badge}`}
                        aria-hidden="true"
                      >
                        {forecastGapVisuals.icon}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t.dashboard.forecastGap}
                        </p>
                        <p className={`text-lg font-bold tracking-tight [unicode-bidi:isolate] sm:text-xl ${forecastGapVisuals.text}`} dir="ltr">
                          {formatSignedCurrency(netForecastGapUsd, usdFormatter)}
                        </p>
                        <p className="text-xs leading-5 text-slate-600">
                          {t.dashboard.forecastGapSecondary(formatSignedCurrency(netForecastGapIls, ilsFormatter))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {heroSummaryCards.map((card) => (
                    <div
                      key={card.key}
                      className={`viz-panel relative overflow-hidden rounded-[24px] border bg-gradient-to-br p-4 shadow-[0_20px_38px_-30px_rgba(15,23,42,0.34)] ${card.borderClass} ${card.surfaceClass} ${contentAlignClass}`}
                    >
                      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.88),rgba(255,255,255,0))]" />
                      <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${card.labelClass}`}>{card.label}</p>
                      <p className={`mt-3 text-lg font-black tracking-tight [unicode-bidi:isolate] ${card.valueClass}`} dir="ltr">{card.usd}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500 [unicode-bidi:isolate]" dir="ltr">{card.ils}</p>
                      {card.meta ? (
                        <span className="viz-chip mt-3 inline-flex px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm [unicode-bidi:isolate]" dir="auto">
                          {card.meta}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className={`viz-panel rounded-[24px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.92))] p-4 text-sm text-slate-600 shadow-[0_20px_34px_-32px_rgba(15,23,42,0.28)] ${contentAlignClass}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {t.dashboard.portfolioOverviewFootnote}
                  </p>
                  <p className="mt-3 leading-7">
                    {t.dashboard.portfolioOverviewSummary(
                      usdFormatter(openPnLUsd),
                      usdFormatter(realizedPnLUsd),
                      usdFormatter(Math.abs(taxesUsd))
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="viz-panel viz-panel-strong rounded-[32px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_28px_60px_-40px_rgba(15,23,42,0.28)] sm:p-5">
            <div className="flex h-full flex-col gap-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,auto)] xl:items-end">
                <div className={`space-y-2 ${contentAlignClass}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {chartSectionEyebrow}
                  </p>
                  <h3 className="text-[clamp(1.2rem,1.8vw,1.5rem)] font-black tracking-tight text-slate-950">
                    {locale === 'he' ? 'לוח המסלול של התיק' : 'Portfolio trajectory board'}
                  </h3>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">{chartSectionDescription}</p>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-3">
                  {chartSnapshotCards.map((card) => (
                    <div
                      key={card.key}
                      className={`rounded-[20px] border border-slate-800/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(30,41,59,0.92))] px-3.5 py-3 shadow-[0_22px_40px_-30px_rgba(15,23,42,0.8)] ${contentAlignClass}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${card.chipClass}`} />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{card.label}</p>
                      </div>
                      <p className={`mt-3 text-base font-black tracking-tight [unicode-bidi:isolate] ${card.toneClass}`} dir="ltr">{card.value}</p>
                      <p className="mt-1 text-[11px] text-slate-400 [unicode-bidi:isolate]" dir="ltr">{card.secondary}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="viz-panel space-y-3 rounded-[24px] border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_20px_38px_-34px_rgba(15,23,42,0.26)]">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {locale === 'he' ? 'מקרא' : 'Legend'}
                  </p>
                  <p className="text-xs text-slate-500">{chartLegendDescription}</p>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
                  {legendItems.map((item) => (
                    <div
                      key={item.key}
                      className={`viz-panel flex items-start gap-3 rounded-[18px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,0.96))] px-3 py-3 shadow-[0_18px_30px_-32px_rgba(15,23,42,0.32)] ${contentAlignClass}`}
                    >
                      <div className="mt-1 shrink-0">{item.preview}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={chartSurfaceRef}
                className="relative h-[19rem] overflow-hidden rounded-[30px] border border-[color:rgba(148,163,184,0.24)] bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.32),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(167,243,208,0.22),transparent_30%),linear-gradient(180deg,rgba(248,250,252,0.99),rgba(241,245,249,0.96))] shadow-[0_28px_58px_-40px_rgba(15,23,42,0.52)] sm:h-[24rem] lg:h-[28rem]"
                onTouchStart={handleChartSurfaceTouchStart}
                onTouchMove={handleChartSurfaceTouchMove}
                onTouchCancel={hideActiveInteraction}
                onTouchEnd={hideActiveInteraction}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_28%)]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,rgba(241,245,249,0),rgba(226,232,240,0.52))]" />
                <div className="pointer-events-none absolute left-2.5 right-2.5 top-2.5 z-10 flex flex-col gap-2 lg:left-4 lg:right-4 lg:top-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className={`max-w-xl rounded-[20px] border border-white/70 bg-white/74 px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-3 ${contentAlignClass}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                      {locale === 'he' ? 'מסך הקריאה' : 'Reading panel'}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-900 sm:mt-1.5 sm:text-sm">{t.dashboard.portfolioOverviewTitle}</p>
                    <p className="mt-1 hidden text-[11px] leading-5 text-slate-600 sm:text-xs sm:leading-6 md:block">{chartSectionDescription}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <span className="rounded-full border border-white/75 bg-white/76 px-3 py-1.5 text-[11px] font-semibold text-slate-700 backdrop-blur-sm [unicode-bidi:isolate]" dir="auto">
                      {timelineRangeLabel}
                    </span>
                    <span className="hidden rounded-full border border-white/75 bg-white/76 px-3 py-1.5 text-[11px] font-semibold text-slate-700 backdrop-blur-sm sm:inline-flex">
                      {observationCountLabel}
                    </span>
                  </div>
                </div>

                {activeInteraction ? (
                  <div className="pointer-events-none absolute inset-0 z-20">
                    <div
                      ref={tooltipRef}
                      className="absolute transition-[opacity,transform] duration-100 ease-out"
                      style={{
                        left: tooltipPosition?.left ?? 0,
                        opacity: tooltipPosition ? 1 : 0,
                        top: tooltipPosition?.top ?? 0,
                        transformOrigin: tooltipPosition?.transformOrigin ?? 'left top',
                      }}
                    >
                      <ChartTooltip
                        point={activeInteraction.point}
                        label={activeInteraction.label}
                        formatUsd={usdFormatter}
                        formatIls={ilsFormatter}
                        labelFormatter={tooltipLabelFormatter}
                        labels={tooltipLabels}
                      />
                    </div>
                  </div>
                ) : null}

                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartPoints}
                    margin={chartMargins}
                    onMouseDown={handleChartPointerDown}
                    onMouseEnter={handleChartPointerMove}
                    onMouseLeave={hideActiveInteraction}
                    onMouseMove={handleChartPointerMove}
                    onMouseUp={handleChartPointerUp}
                  >
                    <defs>
                      <linearGradient id={netLineGradientId} x1="0" y1="0" x2="1" y2="0">
                        {netLineGradientStops.length === 0 ? (
                          <stop offset="0%" stopColor={trendStateColors.above} />
                        ) : (
                          netLineGradientStops.map((stop, index) => {
                            const offset = `${Number.isFinite(stop.offset) ? stop.offset.toFixed(3) : '0'}%`;

                            if (index === 0) {
                              return (
                                <stop
                                  key={`net-line-stop-${index}-start`}
                                  offset={offset}
                                  stopColor={stop.color}
                                />
                              );
                            }

                            const previousColor = netLineGradientStops[index - 1]?.color ?? stop.color;

                            return (
                              <Fragment key={`net-line-stop-${index}`}>
                                <stop offset={offset} stopColor={previousColor} />
                                <stop offset={offset} stopColor={stop.color} />
                              </Fragment>
                            );
                          })
                        )}
                      </linearGradient>
                      <linearGradient id={netAreaGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(56,189,248,0.28)" />
                        <stop offset="50%" stopColor="rgba(59,130,246,0.12)" />
                        <stop offset="100%" stopColor="rgba(15,23,42,0)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 8" stroke="rgba(148,163,184,0.34)" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      tickFormatter={(value: number) => withRtlMark(dateFormatter.format(new Date(value)))}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={14}
                      minTickGap={isMobile ? 22 : 34}
                      tick={{ fill: 'rgba(71,85,105,0.82)', fontSize: isMobile ? 10 : 11, fontWeight: 700 }}
                    />
                    <YAxis
                      orientation="right"
                      tickFormatter={(value) => compactFormatter.format(value)}
                      tickLine={false}
                      axisLine={false}
                      width={isMobile ? 52 : 70}
                      tick={{ fill: 'rgba(71,85,105,0.78)', fontSize: isMobile ? 10 : 11, fontWeight: 700 }}
                      {...(yDomain ? { domain: yDomain } : {})}
                    />
                    <Tooltip
                      content={() => null}
                      cursor={false}
                      isAnimationActive={false}
                      wrapperStyle={{ display: 'none' }}
                    />
                    <ReferenceLine y={0} stroke="rgba(100,116,139,0.52)" strokeDasharray="5 7" strokeWidth={1.5} />
                    {activeInteraction ? (
                      <ReferenceLine
                        x={activeInteraction.point.timestamp}
                        stroke="rgba(255,255,255,0.26)"
                        strokeDasharray="4 7"
                        strokeWidth={1.5}
                      />
                    ) : null}
                    <Area
                      type="monotone"
                      dataKey="netValue"
                      baseValue={0}
                      stroke="none"
                      fill={`url(#${netAreaGradientId})`}
                      fillOpacity={1}
                      isAnimationActive={false}
                      activeDot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="netValue"
                      stroke={`url(#${netLineGradientId})`}
                      strokeWidth={3.5}
                      dot={renderNetLineDot}
                      activeDot={false}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecastValueUsd"
                      stroke="#fbbf24"
                      strokeWidth={2.25}
                      strokeDasharray="7 7"
                      dot={false}
                      activeDot={false}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="spyValueUsd"
                      stroke="rgba(226,232,240,0.78)"
                      strokeWidth={1.75}
                      strokeDasharray="5 6"
                      dot={false}
                      activeDot={false}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 z-10 flex flex-col gap-2 text-[11px] text-slate-600 md:bottom-4 md:left-4 md:right-4 md:flex-row md:items-end md:justify-between">
                  <div className={`hidden max-w-xl rounded-full border border-white/75 bg-white/78 px-3 py-2 backdrop-blur-sm sm:block sm:px-3.5 ${contentAlignClass}`}>
                    {chartLegendDescription}
                  </div>
                  <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/75 bg-white/78 px-3 py-2 font-semibold text-slate-700 backdrop-blur-sm sm:px-3.5 md:self-auto">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                    <span className="[unicode-bidi:isolate]" dir="ltr">
                      {formatSignedCurrency(trendPoint?.deltaUsd ?? 0, usdFormatter)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
