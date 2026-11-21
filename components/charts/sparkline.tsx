'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';

import { HistoricalPoint, PositionLotType } from '@/types';
import type { HoldingChartReference } from '@/lib/holding-chart-history';

export interface SparklineEvent {
  id: string;
  timestamp: number;
  type: PositionLotType;
  price: number;
  quantity: number;
  typeLabel?: string;
  priceLabel?: string;
  quantityLabel?: string;
}

export interface SparklineHoverPoint {
  price: number;
  timestamp: number;
}

export interface SparklineHoverDetail {
  label: string;
  value: string;
  valueClassName?: string;
}

export interface SparklineHoldingPeriod {
  id: string;
  start: number;
  end: number | null;
  current: boolean;
}

function firstTimestampAfter(timestamps: number[], timestamp: number): number {
  let start = 0;
  let end = timestamps.length;
  while (start < end) {
    const mid = Math.floor((start + end) / 2);
    if (timestamps[mid] <= timestamp) {
      start = mid + 1;
    } else {
      end = mid;
    }
  }
  return start;
}

interface SparklineProps {
  holdingPeriods?: SparklineHoldingPeriod[];
  holdingReferences?: HoldingChartReference[];
  points: HistoricalPoint[];
  width?: number;
  height?: number;
  color?: string;
  baseline?: number;
  baselineColor?: string;
  projectedPrice?: number;
  projectedLineColor?: string;
  requiredExitPrice?: number;
  requiredExitLineColor?: string;
  requiredExitLabel?: string;
  belowEntryColor?: string;
  betweenProjectedColor?: string;
  aboveProjectedColor?: string;
  activeFromTimestamp?: number;
  inactiveBeforeColor?: string;
  annualGrowthRate?: number;
  yearsHeld?: number;
  events?: SparklineEvent[];
  /** Extend the time axis to actual transaction dates without adding price samples. */
  includeEventsInDomain?: boolean;
  className?: string;
  showYAxis?: boolean;
  yAxisWidth?: number;
  priceFormatter?: (value: number) => string;
  timeFormatter?: (timestamp: number) => string;
  hoverDetails?: (point: SparklineHoverPoint) => SparklineHoverDetail[];
  interactive?: boolean;
  onHoverPoint?: (point: SparklineHoverPoint | null) => void;
}

type SparklineSegment = {
  color: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type NormalizedPoint = {
  x: number;
  y: number;
  close: number;
  timestamp: number;
};

type NormalizedEvent = SparklineEvent & {
  x: number;
  y: number;
};

type NormalizedData = {
  points: NormalizedPoint[];
  closes: number[];
  baselineY: number | null;
  projectedY: number | null;
  requiredExitY: number | null;
  projectionPoints: { x: number; y: number }[] | null;
  projectionStartX: number;
  firstTimestamp: number;
  lastTimestamp: number;
  events: NormalizedEvent[];
  min: number;
  max: number;
  range: number;
};

const EVENT_DETAIL_CARD_CLASS = 'rounded-lg border border-slate-200/80 bg-white/75 px-2.5 py-1.5 shadow-sm';

function SparklineEventMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={EVENT_DETAIL_CARD_CLASS}>
      <div className="text-[10px] font-medium tracking-wide text-slate-500">{label}</div>
      <div
        className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[16px] font-semibold leading-none text-slate-800 tabular-nums"
        dir="ltr"
      >
        {value}
      </div>
    </div>
  );
}

export function Sparkline({
  points,
  holdingPeriods,
  holdingReferences,
  width = 320,
  height = 96,
  color = 'var(--color-primary-500)',
  baseline,
  baselineColor = 'rgba(var(--color-slate-400-rgb), 0.9)',
  projectedPrice,
  projectedLineColor = 'rgba(var(--color-primary-500-rgb), 0.8)',
  requiredExitPrice,
  requiredExitLineColor = 'var(--color-violet-500)',
  requiredExitLabel,
  belowEntryColor = 'var(--color-red-400)',
  betweenProjectedColor = 'var(--color-primary-500)',
  aboveProjectedColor = 'var(--color-green-400)',
  activeFromTimestamp,
  inactiveBeforeColor = 'var(--color-slate-400)',
  annualGrowthRate,
  yearsHeld,
  events,
  includeEventsInDomain = false,
  className = '',
  showYAxis = false,
  yAxisWidth = 64,
  priceFormatter = (value: number) =>
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value),
  timeFormatter = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  hoverDetails,
  interactive = false,
  onHoverPoint,
}: SparklineProps) {
  const gradientId = useId();
  const areaGradientId = `${gradientId}-fill-color`;
  const areaMaskId = `${gradientId}-fill-mask`;
  const areaOpacityGradientId = `${gradientId}-fill-opacity`;
  const strokeGradientId = `${gradientId}-stroke`;

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const element = chartRef.current;

    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = element.getBoundingClientRect().width;

      if (nextWidth > 0) {
        setMeasuredWidth(nextWidth);
      }
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const nextWidth = entry.contentRect.width;

        if (nextWidth > 0) {
          setMeasuredWidth(nextWidth);
        }
      });
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const fallbackWidth = Math.max(1, width - (showYAxis ? Math.max(0, yAxisWidth) : 0));
  const chartWidth = Math.max(1, measuredWidth ?? fallbackWidth);

  const normalized = useMemo<NormalizedData | null>(() => {
    if (!points || points.length < 2) {
      return null;
    }

    const sortedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const closes = sortedPoints.map((point) => point.close);

    const eventTimestamps = includeEventsInDomain
      ? (events ?? []).filter((event) => Number.isFinite(event.timestamp) && Number.isFinite(event.price)).map((event) => event.timestamp)
      : [];
    const firstTimestamp = Math.min(sortedPoints[0]?.timestamp ?? 0, ...eventTimestamps);
    const lastTimestamp = Math.max(sortedPoints[sortedPoints.length - 1]?.timestamp ?? 0, ...eventTimestamps);
    const timeRange = Math.max(lastTimestamp - firstTimestamp, 1);
    const entryTimestamp =
      typeof activeFromTimestamp === 'number' && Number.isFinite(activeFromTimestamp)
        ? activeFromTimestamp
        : firstTimestamp;
    const projectionVisibleStart = Math.min(Math.max(entryTimestamp, firstTimestamp), lastTimestamp);

    const projectionValues: Array<{ timestamp: number; value: number }> = [];
    const canProject =
      typeof baseline === 'number' &&
      typeof annualGrowthRate === 'number' &&
      typeof yearsHeld === 'number' &&
      Number.isFinite(annualGrowthRate) &&
      Number.isFinite(yearsHeld) &&
      sortedPoints.length > 1;

    if (canProject) {
      const growthBase = 1 + annualGrowthRate;
      const isGrowthValid = growthBase > 0;

      if (isGrowthValid) {
        const projectionDuration = Math.max(lastTimestamp - entryTimestamp, 1);

        if (entryTimestamp > firstTimestamp && entryTimestamp < lastTimestamp) {
          projectionValues.push({ timestamp: entryTimestamp, value: baseline });
        }

        for (const point of sortedPoints) {
          if (point.timestamp < projectionVisibleStart) {
            continue;
          }

          const progress = Math.max(0, (point.timestamp - entryTimestamp) / projectionDuration);
          const projectedValue = baseline * Math.pow(growthBase, yearsHeld * progress);
          projectionValues.push({
            timestamp: point.timestamp,
            value: projectedValue,
          });
        }
      }
    }

    const values = [
      ...closes,
      ...(typeof baseline === 'number' ? [baseline] : []),
      ...(typeof projectedPrice === 'number' ? [projectedPrice] : []),
      ...(typeof requiredExitPrice === 'number' ? [requiredExitPrice] : []),
      ...projectionValues.map((point) => point.value),
      ...((events ?? [])
        .map((event) => event.price)
        .filter((price): price is number => typeof price === 'number' && Number.isFinite(price))),
    ];
    const padding = holdingPeriods ? Math.max(Math.max(...values) - Math.min(...values), 1) * 0.08 : 0;
    const min = Math.min(...values) - padding;
    const max = Math.max(...values) + padding;
    const range = max - min || 1;

    const normalizedPoints: NormalizedPoint[] = sortedPoints.map((point) => {
      const relativeTime = (point.timestamp - firstTimestamp) / timeRange;
      const x = relativeTime * chartWidth;
      const y = height - ((point.close - min) / range) * height;
      return { x, y, close: point.close, timestamp: point.timestamp };
    });

    const baselineY = typeof baseline === 'number'
      ? height - ((baseline - min) / range) * height
      : null;

    const projectedY = typeof projectedPrice === 'number'
      ? height - ((projectedPrice - min) / range) * height
      : null;
    const requiredExitY = typeof requiredExitPrice === 'number'
      ? height - ((requiredExitPrice - min) / range) * height
      : null;

    const projectionStartX = ((projectionVisibleStart - firstTimestamp) / timeRange) * chartWidth;

    const projectionPoints = projectionValues.length > 1
      ? projectionValues.map(({ timestamp, value }) => {
          const x = ((timestamp - firstTimestamp) / timeRange) * chartWidth;
          const y = height - ((value - min) / range) * height;
          return { x, y };
        })
      : null;

    const normalizedEvents: NormalizedEvent[] = (events ?? [])
      .map((event) => {
        if (!Number.isFinite(event.price) || !Number.isFinite(event.timestamp)) {
          return null;
        }

        let x = normalizedPoints[0]?.x ?? 0;

        if (includeEventsInDomain) {
          x = ((event.timestamp - firstTimestamp) / timeRange) * chartWidth;
        } else if (event.timestamp <= firstTimestamp) {
          x = normalizedPoints[0]?.x ?? 0;
        } else if (event.timestamp >= lastTimestamp) {
          x = normalizedPoints[normalizedPoints.length - 1]?.x ?? chartWidth;
        } else {
          const index = sortedPoints.findIndex((point) => point.timestamp >= event.timestamp);

          if (index <= 0) {
            x = normalizedPoints[Math.max(index, 0)]?.x ?? 0;
          } else {
            const previousPoint = sortedPoints[index - 1];
            const nextPoint = sortedPoints[index];
            const previousNormalized = normalizedPoints[index - 1];
            const nextNormalized = normalizedPoints[index];
            const denominator = (nextPoint.timestamp - previousPoint.timestamp) || 1;
            const ratio = (event.timestamp - previousPoint.timestamp) / denominator;
            x = (previousNormalized?.x ?? 0) + ((nextNormalized?.x ?? 0) - (previousNormalized?.x ?? 0)) * ratio;
          }
        }

        const y = height - ((event.price - min) / range) * height;

        return {
          ...event,
          x,
          y: Math.min(Math.max(y, 4), height - 4),
        } satisfies NormalizedEvent;
      })
      .filter((event): event is NormalizedEvent => event !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      points: normalizedPoints,
      closes,
      baselineY,
      projectedY,
      requiredExitY,
      projectionPoints,
      projectionStartX,
      firstTimestamp,
      lastTimestamp,
      events: normalizedEvents,
      min,
      max,
      range,
    } satisfies NormalizedData;
  }, [
    points,
    baseline,
    projectedPrice,
    requiredExitPrice,
    chartWidth,
    height,
    annualGrowthRate,
    yearsHeld,
    events,
    includeEventsInDomain,
    holdingPeriods,
    activeFromTimestamp,
  ]);

  const segments = useMemo(() => {
    if (!normalized || !normalized.points || normalized.points.length < 2) {
      return [] as SparklineSegment[];
    }

    const references = holdingReferences ? [...holdingReferences].sort((a, b) => a.timestamp - b.timestamp) : undefined;
    const referenceTimes = references?.map(reference => reference.timestamp);
    const searchableReferences = referenceTimes?.every(Number.isFinite);
    const referenceAt = (timestamp: number) => {
      if (holdingPeriods && !holdingPeriods.some((period) => timestamp >= period.start && (period.end === null || timestamp < period.end))) return null;
      if (references) {
        // Use only the latest known reference, never a later purchase or target.
        if (referenceTimes && searchableReferences && Number.isFinite(timestamp)) {
          return references[firstTimestampAfter(referenceTimes, timestamp) - 1] ?? null;
        }
        let reference: HoldingChartReference | null = null;
        for (const candidate of references) {
          if (candidate.timestamp > timestamp) break;
          reference = candidate;
        }
        return reference;
      }
      if (!holdingPeriods && typeof activeFromTimestamp === 'number' && timestamp < activeFromTimestamp) return null;
      return { baseline: baseline ?? null, target: projectedPrice ?? null };
    };
    const computed: SparklineSegment[] = [];
    const boundaries = [
      ...(holdingPeriods?.flatMap((period) => [period.start, ...(period.end === null ? [] : [period.end])]) ?? []),
      ...(references?.map((reference) => reference.timestamp) ?? []),
      ...(typeof activeFromTimestamp === 'number' ? [activeFromTimestamp] : []),
    ].filter(Number.isFinite).sort((a, b) => a - b);
    for (let index = 1; index < normalized.points.length; index += 1) {
      const start = normalized.points[index - 1];
      const end = normalized.points[index];
      const duration = end.timestamp - start.timestamp || 1;
      const timeRatios = [0];
      if (!Number.isNaN(start.timestamp) && !Number.isNaN(end.timestamp)) {
        let boundary = firstTimestampAfter(boundaries, start.timestamp);
        while (boundary < boundaries.length && boundaries[boundary] < end.timestamp) {
          timeRatios.push((boundaries[boundary] - start.timestamp) / duration);
          boundary += 1;
        }
      }
      timeRatios.push(1);
      const cuts = [...new Set(timeRatios)].sort((a, b) => a - b);
      const valueAt = (ratio: number) => start.close + (end.close - start.close) * ratio;
      const pointAt = (ratio: number) => ({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
      for (let part = 1; part < cuts.length; part += 1) {
        const left = cuts[part - 1];
        const right = cuts[part];
        const reference = referenceAt(start.timestamp + duration * (left + right) / 2);
        const thresholds = [reference?.baseline, reference?.target].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        const priceCuts = end.close === start.close ? [] : thresholds.map((value) => (value - start.close) / (end.close - start.close)).filter((ratio) => ratio > left && ratio < right);
        const pieces = [left, ...new Set(priceCuts), right].sort((a, b) => a - b);
        for (let piece = 1; piece < pieces.length; piece += 1) {
          const from = pieces[piece - 1];
          const to = pieces[piece];
          const value = valueAt((from + to) / 2);
          const segmentColor = !reference || (references && reference.baseline === null) ? inactiveBeforeColor
            : reference.baseline !== null && value < reference.baseline ? belowEntryColor
            : reference.target !== null ? value >= reference.target ? aboveProjectedColor : betweenProjectedColor
            : color;
          computed.push({ color: segmentColor, start: pointAt(from), end: pointAt(to) });
        }
      }
    }

    return computed;
  }, [
    normalized,
    holdingPeriods,
    holdingReferences,
    baseline,
    projectedPrice,
    belowEntryColor,
    betweenProjectedColor,
    aboveProjectedColor,
    activeFromTimestamp,
    inactiveBeforeColor,
    color,
  ]);

  const gradientStops = useMemo(() => {
    if (!segments.length || !normalized) {
      return [
        { offset: 0, color },
        { offset: 1, color },
      ];
    }

    const clampOffset = (offset: number) => Math.min(1, Math.max(0, offset));
    const stops: { offset: number; color: string }[] = [];

    segments.forEach((segment, index) => {
      const startOffset = clampOffset(segment.start.x / chartWidth);
      const endOffset = clampOffset(segment.end.x / chartWidth);

      if (index === 0) {
        stops.push({ offset: startOffset, color: segment.color });
      } else {
        const previousColor = segments[index - 1]?.color ?? segment.color;
        stops.push({ offset: startOffset, color: previousColor });
        stops.push({ offset: startOffset, color: segment.color });
      }

      stops.push({ offset: endOffset, color: segment.color });

      if (index === segments.length - 1 && endOffset < 1) {
        stops.push({ offset: 1, color: segment.color });
      }
    });

    return stops;
  }, [segments, normalized, color, chartWidth]);

  const axisTicks = useMemo(() => {
    if (!showYAxis || !normalized) {
      return [] as { value: number; y: number }[];
    }

    const { min, max, range } = normalized;

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [];
    }

    const tickCount = 4;

    if (range === 0) {
      const mid = height / 2;
      return [{ value: min, y: mid }];
    }

    const ticks = Array.from({ length: tickCount }, (_, index) => {
      const ratio = index / (tickCount - 1);
      const value = max - range * ratio;
      const y = height - ((value - min) / range) * height;
      return { value, y };
    });

    return ticks.filter((tick, index) => {
      const firstIndex = ticks.findIndex((item) => Math.abs(item.value - tick.value) < 1e-6);
      return firstIndex === index;
    });
  }, [showYAxis, normalized, height]);

  const parseHexToRgba = useMemo(() => {
    const cache = new Map<string, string>();
    return (hex: string, alpha: number) => {
      const cacheKey = `${hex}-${alpha}`;
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!;
      }

      if (typeof hex !== 'string') {
        return `rgba(var(--color-slate-400-rgb), ${alpha})`;
      }

      let normalized = hex.trim();
      if (normalized.startsWith('var(')) {
        const inner = normalized.slice(4, -1).trim();
        const rgbReference = inner.endsWith('-rgb') ? inner : `${inner}-rgb`;
        const value = `rgba(var(${rgbReference}), ${alpha})`;
        cache.set(cacheKey, value);
        return value;
      }

      if (normalized.startsWith('#')) {
        normalized = normalized.slice(1);
      }

      if (normalized.length === 3) {
        normalized = normalized
          .split('')
          .map((char) => char + char)
          .join('');
      }

      if (normalized.length !== 6) {
        return `rgba(var(--color-slate-400-rgb), ${alpha})`;
      }

      const bigint = Number.parseInt(normalized, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      const value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      cache.set(cacheKey, value);
      return value;
    };
  }, []);

  const axisBackground = useMemo(
    () => `linear-gradient(180deg, ${parseHexToRgba(color, 0.14)} 0%, ${parseHexToRgba(color, 0.05)} 100%)`,
    [color, parseHexToRgba]
  );
  const axisBorderColor = useMemo(() => parseHexToRgba(color, 0.2), [color, parseHexToRgba]);
  const axisTickColor = useMemo(() => parseHexToRgba(color, 0.82), [color, parseHexToRgba]);

  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const handleWrapperLeave = () => {
    setHoveredEventId(null);
    setHoveredIndex(null);
  };

  const renderSkeleton = (
    <div
      ref={chartRef}
      className="relative h-full w-full"
      onPointerLeave={handleWrapperLeave}
      onTouchCancel={handleWrapperLeave}
      onTouchEnd={handleWrapperLeave}
    />
  );

  const normalizedPoints = normalized?.points ?? [];
  const baselineY = normalized?.baselineY ?? null;
  const projectedY = normalized?.projectedY ?? null;
  const requiredExitY = normalized?.requiredExitY ?? null;
  const projectionPoints = normalized?.projectionPoints ?? null;
  const normalizedEvents = normalized?.events ?? [];

  const effectiveHoveredPoint =
    interactive && hoveredIndex !== null && normalizedPoints.length
      ? normalizedPoints[Math.min(Math.max(hoveredIndex, 0), normalizedPoints.length - 1)]
      : null;
  const hoveredPriceText = effectiveHoveredPoint ? priceFormatter(effectiveHoveredPoint.close) : null;
  const hoveredTimeText = effectiveHoveredPoint ? timeFormatter(effectiveHoveredPoint.timestamp) : null;
  const hoveredDetailRows = effectiveHoveredPoint && hoverDetails
    ? hoverDetails({
        price: effectiveHoveredPoint.close,
        timestamp: effectiveHoveredPoint.timestamp,
      })
    : [];

  const lastSegmentColor = segments[segments.length - 1]?.color ?? color;
  const projectedLinePath = projectionPoints && projectionPoints.length > 1
    ? projectionPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    : projectedY !== null
      ? `M ${normalized?.projectionStartX ?? 0} ${projectedY} L ${chartWidth} ${projectedY}`
      : null;
  const hasExitTargetGap = projectedY !== null && requiredExitY !== null;
  const exitGapStartX = Math.max(normalized?.projectionStartX ?? 0, chartWidth * 0.74);
  const exitGapTop = hasExitTargetGap ? Math.min(projectedY, requiredExitY) : 0;
  const exitGapHeight = hasExitTargetGap ? Math.abs(projectedY - requiredExitY) : 0;
  const exitGapAmount = typeof projectedPrice === 'number' && typeof requiredExitPrice === 'number'
    ? requiredExitPrice - projectedPrice
    : null;

  const activeEventId = selectedEventId ?? hoveredEventId;
  const activeEvent = normalizedEvents.find((event) => event.id === activeEventId) ?? null;
  const activeEventTone = activeEvent?.type === 'BUY'
    ? {
        badge: 'border-emerald-300/80 bg-emerald-50/95 text-emerald-700',
        border: 'border-emerald-200/90',
      }
    : {
        badge: 'border-rose-300/80 bg-rose-50/95 text-rose-700',
        border: 'border-rose-200/90',
      };
  const eventTooltipWidth = 224;
  const eventTooltipHeight = 124;
  const eventTooltipOffset = 10;
  const eventTooltipLeft = activeEvent
    ? Math.min(
        Math.max(activeEvent.x - (eventTooltipWidth / 2), 8),
        Math.max(chartWidth - eventTooltipWidth - 8, 8)
      )
    : 0;
  const eventTooltipTop = -(eventTooltipHeight + eventTooltipOffset);
  const latestClose = normalizedPoints[normalizedPoints.length - 1]?.close ?? null;
  const isSellEvent = activeEvent?.type === 'SELL';
  const buyReferencePrice = activeEvent?.type === 'BUY'
    ? activeEvent.price
    : (typeof baseline === 'number' ? baseline : null);
  const comparisonPrice = isSellEvent
    ? (activeEvent?.price ?? null)
    : latestClose;
  const changeFromEvent = holdingPeriods ? null : buyReferencePrice !== null && comparisonPrice !== null && activeEvent
    ? {
        amount: (comparisonPrice - buyReferencePrice) * activeEvent.quantity,
        percent: buyReferencePrice !== 0
          ? ((comparisonPrice - buyReferencePrice) / buyReferencePrice) * 100
          : null,
      }
    : null;
  const changeToneClass = (changeFromEvent?.amount ?? 0) >= 0
    ? 'text-emerald-700'
    : 'text-rose-700';
  const changeAmountText = changeFromEvent
    ? new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'USD',
        signDisplay: 'always',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(changeFromEvent.amount)
    : null;
  const changePercentText = changeFromEvent && changeFromEvent.percent !== null
    ? new Intl.NumberFormat('he-IL', {
        signDisplay: 'always',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(changeFromEvent.percent)
    : null;

  const handleWrapperClick = () => {
    setSelectedEventId(null);
  };

  const updateHoverFromClientX = (clientX: number) => {
    if (!interactive || !normalized) {
      return;
    }

    const element = chartRef.current;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const clampedX = Math.min(Math.max(relativeX, 0), chartWidth);

    let nearestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    normalized.points.forEach((point, index) => {
      const distance = Math.abs(point.x - clampedX);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    if (hoveredIndex !== nearestIndex) {
      setHoveredIndex(nearestIndex);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateHoverFromClientX(event.clientX);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }

    updateHoverFromClientX(event.clientX);
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }

    const touch = event.touches[0];
    if (touch) {
      updateHoverFromClientX(touch.clientX);
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }

    const touch = event.touches[0];
    if (touch) {
      updateHoverFromClientX(touch.clientX);
    }
  };

  useEffect(() => {
    if (!interactive || !onHoverPoint) {
      return;
    }

    if (!effectiveHoveredPoint) {
      onHoverPoint(null);
      return;
    }

    onHoverPoint({ price: effectiveHoveredPoint.close, timestamp: effectiveHoveredPoint.timestamp });
  }, [interactive, effectiveHoveredPoint, onHoverPoint]);

  useEffect(() => {
    if (!interactive && onHoverPoint) {
      onHoverPoint(null);
    }
  }, [interactive, onHoverPoint]);

  if (!normalized) {
    return (
      <div className={`relative ${className}`} style={{ width: '100%', height: className.split(' ').includes('h-full') ? '100%' : height }}>
        <div className="flex h-full w-full">
          {renderSkeleton}
          {showYAxis ? (
            <div
              className="hidden h-full flex-shrink-0 sm:block"
              style={{
                width: Math.max(0, yAxisWidth),
                background: axisBackground,
                borderLeft: `1px solid ${axisBorderColor}`,
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  const createSmoothPath = (pathPoints: NormalizedPoint[]) => {
    if (pathPoints.length < 2) {
      return '';
    }

    if (pathPoints.length === 2) {
      return `M ${pathPoints[0].x} ${pathPoints[0].y} L ${pathPoints[1].x} ${pathPoints[1].y}`;
    }

    let path = `M ${pathPoints[0].x} ${pathPoints[0].y}`;

    for (let index = 0; index < pathPoints.length - 1; index += 1) {
      const current = pathPoints[index];
      const next = pathPoints[index + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
    }

    const lastPoint = pathPoints[pathPoints.length - 1];
    path += ` T ${lastPoint.x} ${lastPoint.y}`;
    return path;
  };

  const linePath = createSmoothPath(normalizedPoints);
  const firstPoint = normalizedPoints[0] ?? null;
  const areaPath = firstPoint
    ? `${linePath} L ${includeEventsInDomain ? normalizedPoints[normalizedPoints.length - 1]?.x ?? chartWidth : chartWidth} ${height} L ${firstPoint.x} ${height} Z`
    : '';
  const lastPoint = normalizedPoints[normalizedPoints.length - 1] ?? null;

  return (
    <div className={`relative ${className}`} style={{ width: '100%', height: className.split(' ').includes('h-full') ? '100%' : height }}>
      <div className="flex h-full w-full">
          <div
            ref={chartRef}
            className="relative h-full min-w-0 flex-1 overflow-visible"
          onPointerLeave={handleWrapperLeave}
          onTouchCancel={handleWrapperLeave}
          onTouchEnd={handleWrapperLeave}
          onClick={handleWrapperClick}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          role="presentation"
        >
          <svg
            width={chartWidth}
            height={height}
            className="h-full w-full"
            viewBox={`0 0 ${chartWidth} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={areaGradientId}
                x1={0}
                x2={chartWidth}
                y1={0}
                y2={0}
                gradientUnits="userSpaceOnUse"
              >
                {gradientStops.map((stop, index) => (
                  <stop
                    key={`${stop.offset}-${stop.color}-${index}`}
                    offset={`${stop.offset * 100}%`}
                    stopColor={stop.color}
                  />
                ))}
              </linearGradient>
              <linearGradient
                id={areaOpacityGradientId}
                x1={0}
                x2={0}
                y1={0}
                y2={height}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="var(--color-neutral-white)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-neutral-white)" stopOpacity={0} />
              </linearGradient>
              <mask id={areaMaskId} maskUnits="userSpaceOnUse">
                <rect width={chartWidth} height={height} fill={`url(#${areaOpacityGradientId})`} />
              </mask>
              <linearGradient id={strokeGradientId} x1="0" x2={chartWidth} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                {gradientStops.map((stop, index) => (
                  <stop key={`${stop.offset}-${stop.color}-${index}`} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>

            {normalized && holdingPeriods?.map((period) => {
              const duration = Math.max(normalized.lastTimestamp - normalized.firstTimestamp, 1);
              const x = Math.max(0, (period.start - normalized.firstTimestamp) / duration * chartWidth);
              const end = Math.min(chartWidth, ((period.end ?? normalized.lastTimestamp) - normalized.firstTimestamp) / duration * chartWidth);
              if (end < x || x > chartWidth) return null;
              return <g key={period.id} data-testid="holding-period-band">
                <rect x={x} y={0} width={Math.max(end - x, 2)} height={height} fill={period.current ? '#2563eb' : '#64748b'} opacity={period.current ? 0.055 : 0.035} />
                <rect x={x} y={height - 4} width={Math.max(end - x, 2)} height={4} rx={2} fill={period.current ? '#2563eb' : '#94a3b8'} />
                {period.start >= normalized.firstTimestamp ? <line x1={x} x2={x} y1={0} y2={height} stroke={period.current ? '#2563eb' : '#94a3b8'} strokeDasharray="3 5" opacity={0.4} /> : null}
              </g>;
            })}

            {!showYAxis ? (
              <g opacity={0.08}>
                <line x1="0" y1={height} x2={chartWidth} y2={height} stroke={color} strokeWidth="1" strokeDasharray="2 7" />
                <line x1="0" y1={height / 2} x2={chartWidth} y2={height / 2} stroke={color} strokeWidth="1" strokeDasharray="2 7" />
              </g>
            ) : null}

            {showYAxis
              ? axisTicks.map((tick, index) => (
                  <line
                    key={`axis-${index}`}
                    x1={0}
                    x2={chartWidth}
                    y1={tick.y}
                    y2={tick.y}
                    stroke="rgba(var(--color-slate-400-rgb), 0.2)"
                    strokeWidth="1"
                    strokeDasharray="2 7"
                  />
                ))
              : null}

            {baselineY !== null && (
              <line
                x1={holdingPeriods ? normalized?.projectionStartX ?? 0 : 0}
                y1={baselineY}
                x2={chartWidth}
                y2={baselineY}
                stroke={baselineColor}
                strokeWidth="1"
                strokeDasharray="3 6"
              />
            )}

            {projectedLinePath && (
              <path
                data-testid="sparkline-projected-line"
                d={projectedLinePath}
                fill="none"
                stroke={projectedLineColor}
                strokeWidth={1.1}
                strokeDasharray="4 7"
              />
            )}

            {hasExitTargetGap && (
              <>
                <rect
                  data-testid="sparkline-required-exit-gap"
                  x={exitGapStartX}
                  y={exitGapTop}
                  width={Math.max(chartWidth - exitGapStartX, 0)}
                  height={exitGapHeight}
                  fill={requiredExitLineColor}
                  opacity={0.1}
                />
                <line
                  data-testid="sparkline-required-exit-line"
                  x1={normalized?.projectionStartX ?? 0}
                  y1={requiredExitY}
                  x2={chartWidth}
                  y2={requiredExitY}
                  stroke={requiredExitLineColor}
                  strokeWidth={1.35}
                  strokeDasharray="2 4"
                />
                <line
                  x1={chartWidth - 5}
                  y1={projectedY}
                  x2={chartWidth - 5}
                  y2={requiredExitY}
                  stroke={requiredExitLineColor}
                  strokeWidth={1.2}
                />
                <circle cx={chartWidth - 5} cy={projectedY} r={1.7} fill={requiredExitLineColor} />
                <circle cx={chartWidth - 5} cy={requiredExitY} r={1.7} fill={requiredExitLineColor} />
              </>
            )}

            <path
              d={areaPath}
              fill={`url(#${areaGradientId})`}
              mask={`url(#${areaMaskId})`}
              opacity={0.34}
            />

            <path
              d={linePath}
              fill="none"
              stroke={`url(#${strokeGradientId})`}
              strokeWidth={2.35}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d={linePath}
              fill="none"
              stroke="rgba(var(--color-neutral-white-rgb), 0.28)"
              strokeWidth={0.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.52}
            />

              {interactive && effectiveHoveredPoint ? (
                <>
                  <line
                    x1={effectiveHoveredPoint.x}
                    y1={0}
                    x2={effectiveHoveredPoint.x}
                    y2={height}
                    stroke="rgba(var(--color-primary-900-rgb), 0.25)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  <circle
                    cx={effectiveHoveredPoint.x}
                    cy={effectiveHoveredPoint.y}
                    r={4.2}
                    fill="var(--color-neutral-white)"
                    stroke={color}
                    strokeWidth={1.4}
                  />
                </>
              ) : null}

            {lastPoint ? (
              <>
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r={5.8}
                  fill={lastSegmentColor}
                  opacity={0.12}
                />
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r={3.2}
                  fill="var(--color-neutral-white)"
                  stroke={lastSegmentColor}
                  strokeWidth={1.35}
                />
              </>
            ) : null}

            {normalizedEvents.map((event) => {
                const isActive = activeEventId === event.id;
                const tone = event.type === 'BUY'
                  ? { fill: 'var(--color-green-050)', stroke: 'var(--color-green-600)' }
                  : { fill: 'var(--color-red-050)', stroke: 'var(--color-red-600)' };
                const labelPrice = event.priceLabel ?? event.price.toLocaleString();

                return (
                  <circle
                    key={event.id}
                    cx={event.x}
                    cy={event.y}
                    r={isActive ? 3.9 : 2.8}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={isActive ? 1.5 : 1.05}
                    tabIndex={0}
                    role="button"
                    aria-label={`${event.typeLabel ?? event.type} at ${labelPrice}`}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      setHoveredEventId(event.id);
                    }}
                    onMouseLeave={(e) => {
                      e.stopPropagation();
                      setHoveredEventId((current) => (current === event.id ? null : current));
                    }}
                    onFocus={() => setHoveredEventId(event.id)}
                    onBlur={() => setHoveredEventId((current) => (current === event.id ? null : current))}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEventId((current) => (current === event.id ? null : event.id));
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setSelectedEventId((current) => (current === event.id ? null : event.id));
                    }}
                  />
                );
              })}
          </svg>

          {hasExitTargetGap && requiredExitLabel && exitGapAmount !== null ? (
            <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-violet-200/80 bg-white/90 px-2 py-1 text-[10px] font-semibold text-[var(--violet-text)] shadow-sm backdrop-blur-sm [direction:ltr] tabular-nums">
              {requiredExitLabel} · Δ {exitGapAmount > 0 ? '+' : ''}{priceFormatter(exitGapAmount)}
            </div>
          ) : null}

          {interactive && effectiveHoveredPoint && hoveredPriceText && hoveredTimeText ? (
            <div
              className="pointer-events-none absolute z-10 flex min-w-[176px] flex-col items-stretch gap-1"
              style={{
                left: Math.min(Math.max(effectiveHoveredPoint.x, 12), chartWidth - 12),
                top: Math.max(effectiveHoveredPoint.y - 56, 8),
                transform: 'translateX(-50%)',
              }}
            >
              <div className="rounded-xl bg-white/95 p-2.5 text-xs text-slate-700 shadow-lg ring-1 ring-[color:var(--color-neutral-black)]/5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-500">מחיר</span>
                  <span className="font-semibold text-slate-900 tabular-nums" dir="ltr">{hoveredPriceText}</span>
                </div>
                {hoveredDetailRows.map((row) => (
                  <div key={row.label} className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-500">{row.label}</span>
                    <span className={`font-semibold tabular-nums ${row.valueClassName ?? 'text-slate-900'}`} dir="ltr">
                      {row.value}
                    </span>
                  </div>
                ))}
                <div className="mt-2 rounded-md bg-overlay-slate-900 px-2 py-0.5 text-center text-[10px] font-medium text-slate-100 shadow">
                  {hoveredTimeText}
                </div>
              </div>
            </div>
          ) : null}

          {activeEvent && (
            <div
              className={`pointer-events-none absolute z-30 w-[224px] rounded-2xl border bg-white/72 px-3 py-2.5 text-xs text-slate-700 shadow-lg backdrop-blur-md ${activeEventTone?.border ?? 'border-slate-200/90'}`}
              style={{
                left: eventTooltipLeft,
                top: eventTooltipTop,
              }}
              dir="rtl"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold leading-none ${activeEventTone?.badge ?? 'border-slate-300 bg-slate-100 text-slate-700'}`}>
                  {activeEvent.typeLabel ?? activeEvent.type}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {new Date(activeEvent.timestamp).toLocaleDateString('he-IL')}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <SparklineEventMetric
                  label="מחיר"
                  value={activeEvent.priceLabel ?? activeEvent.price.toLocaleString()}
                />
                <SparklineEventMetric
                  label="כמות"
                  value={activeEvent.quantityLabel ?? activeEvent.quantity.toLocaleString()}
                />
              </div>
              {changeFromEvent && (
                <div className={`mt-2 ${EVENT_DETAIL_CARD_CLASS}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-600">שינוי באחוזים</span>
                    <span className={`text-[12px] font-semibold tabular-nums ${changeToneClass}`} dir="ltr">
                      {changePercentText}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-600">
                      {isSellEvent ? 'רווח/הפסד במכירה' : 'שינוי בכסף'}
                    </span>
                    <span className={`text-[12px] font-semibold tabular-nums ${changeToneClass}`} dir="ltr">
                      {changeAmountText}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showYAxis && axisTicks.length ? (
          <div
            className="hidden h-full flex-shrink-0 flex-col justify-between px-2 py-2 text-[11px] font-medium sm:flex"
            style={{
              width: Math.max(0, yAxisWidth),
              background: axisBackground,
              borderLeft: `1px solid ${axisBorderColor}`,
            }}
          >
            {axisTicks.map((tick, index) => (
              <span
                key={`axis-label-${index}`}
                className="text-right tabular-nums"
                style={{ color: axisTickColor }}
              >
                {priceFormatter(tick.value)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
