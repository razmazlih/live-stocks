'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';

import { HistoricalPoint, PositionLotType } from '@/types';

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

interface SparklineProps {
  points: HistoricalPoint[];
  width?: number;
  height?: number;
  color?: string;
  baseline?: number;
  baselineColor?: string;
  projectedPrice?: number;
  projectedLineColor?: string;
  belowEntryColor?: string;
  betweenProjectedColor?: string;
  aboveProjectedColor?: string;
  annualGrowthRate?: number;
  yearsHeld?: number;
  events?: SparklineEvent[];
  className?: string;
  showYAxis?: boolean;
  yAxisWidth?: number;
  priceFormatter?: (value: number) => string;
  timeFormatter?: (timestamp: number) => string;
  interactive?: boolean;
  onHoverPoint?: (point: { price: number; timestamp: number } | null) => void;
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
  projectionPoints: { x: number; y: number }[] | null;
  events: NormalizedEvent[];
  min: number;
  max: number;
  range: number;
};

export function Sparkline({
  points,
  width = 320,
  height = 96,
  color = 'var(--color-primary-500)',
  baseline,
  baselineColor = 'rgba(var(--color-slate-400-rgb), 0.9)',
  projectedPrice,
  projectedLineColor = 'rgba(var(--color-primary-500-rgb), 0.8)',
  belowEntryColor = 'var(--color-red-400)',
  betweenProjectedColor = 'var(--color-primary-500)',
  aboveProjectedColor = 'var(--color-green-400)',
  annualGrowthRate,
  yearsHeld,
  events,
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

    const projectionValues: number[] = [];
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
        for (let index = 0; index < sortedPoints.length; index += 1) {
          const progress = index / (sortedPoints.length - 1);
          const projectedValue = baseline * Math.pow(growthBase, yearsHeld * progress);
          projectionValues.push(projectedValue);
        }
      }
    }

    const values = [
      ...closes,
      ...(typeof baseline === 'number' ? [baseline] : []),
      ...(typeof projectedPrice === 'number' ? [projectedPrice] : []),
      ...projectionValues,
      ...((events ?? [])
        .map((event) => event.price)
        .filter((price): price is number => typeof price === 'number' && Number.isFinite(price))),
    ];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const firstTimestamp = sortedPoints[0]?.timestamp ?? 0;
    const lastTimestamp = sortedPoints[sortedPoints.length - 1]?.timestamp ?? 0;
    const timeRange = Math.max(lastTimestamp - firstTimestamp, 1);

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

    const projectionPoints = projectionValues.length === sortedPoints.length
      ? projectionValues.map((value, index) => {
          const referencePoint = normalizedPoints[index];
          const x = referencePoint?.x ?? 0;
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

        if (event.timestamp <= firstTimestamp) {
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
      projectionPoints,
      events: normalizedEvents,
      min,
      max,
      range,
    } satisfies NormalizedData;
  }, [
    points,
    baseline,
    projectedPrice,
    chartWidth,
    height,
    annualGrowthRate,
    yearsHeld,
    events,
  ]);

  const segments = useMemo(() => {
    if (!normalized || !normalized.points || normalized.points.length < 2) {
      return [] as SparklineSegment[];
    }

    const thresholds = [
      ...(typeof baseline === 'number' ? [baseline] : []),
      ...(typeof projectedPrice === 'number' ? [projectedPrice] : []),
    ];

    const uniqueThresholds = Array.from(new Set(thresholds)).sort((a, b) => a - b);

    const determineColor = (value: number) => {
      if (typeof baseline === 'number' && value < baseline) {
        return belowEntryColor;
      }

      if (typeof projectedPrice === 'number') {
        if (value >= projectedPrice) {
          return aboveProjectedColor;
        }

        return betweenProjectedColor;
      }

      return color;
    };

    const computed: SparklineSegment[] = [];

    for (let index = 1; index < normalized.points.length; index += 1) {
      const startPoint = normalized.points[index - 1];
      const endPoint = normalized.points[index];
      const startValue = normalized.closes[index - 1];
      const endValue = normalized.closes[index];
      const direction = Math.sign(endValue - startValue) || 1;

      const breakpoints = uniqueThresholds
        .map((threshold) => {
          if (endValue === startValue) {
            return null;
          }

          const crosses =
            (startValue < threshold && endValue > threshold) ||
            (startValue > threshold && endValue < threshold);

          if (!crosses) {
            return null;
          }

          const ratio = (threshold - startValue) / (endValue - startValue);

          return {
            ratio,
            threshold,
            point: {
              x: startPoint.x + (endPoint.x - startPoint.x) * ratio,
              y: startPoint.y + (endPoint.y - startPoint.y) * ratio,
            },
          };
        })
        .filter((breakpoint): breakpoint is { ratio: number; threshold: number; point: { x: number; y: number } } =>
          breakpoint !== null && breakpoint.ratio > 0 && breakpoint.ratio < 1,
        )
        .sort((a, b) => a.ratio - b.ratio);

      let segmentStartPoint: { x: number; y: number } = { x: startPoint.x, y: startPoint.y };
      let currentColor = determineColor(startValue);

      breakpoints.forEach((breakpoint) => {
        computed.push({
          color: currentColor,
          start: segmentStartPoint,
          end: breakpoint.point,
        });

        segmentStartPoint = breakpoint.point;
        const epsilon = direction > 0 ? 1e-4 : -1e-4;
        currentColor = determineColor(breakpoint.threshold + epsilon);
      });

      computed.push({
        color: currentColor,
        start: segmentStartPoint,
        end: endPoint,
      });
    }

    return computed;
  }, [
    normalized,
    baseline,
    projectedPrice,
    belowEntryColor,
    betweenProjectedColor,
    aboveProjectedColor,
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
  const projectionPoints = normalized?.projectionPoints ?? null;
  const normalizedEvents = normalized?.events ?? [];

  const effectiveHoveredPoint =
    interactive && hoveredIndex !== null && normalizedPoints.length
      ? normalizedPoints[Math.min(Math.max(hoveredIndex, 0), normalizedPoints.length - 1)]
      : null;
  const hoveredPriceText = effectiveHoveredPoint ? priceFormatter(effectiveHoveredPoint.close) : null;
  const hoveredTimeText = effectiveHoveredPoint ? timeFormatter(effectiveHoveredPoint.timestamp) : null;

  const lastSegmentColor = segments[segments.length - 1]?.color ?? color;
  const projectedLinePath = projectionPoints && projectionPoints.length > 1
    ? projectionPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    : projectedY !== null
      ? `M 0 ${projectedY} L ${chartWidth} ${projectedY}`
      : null;

  const activeEventId = selectedEventId ?? hoveredEventId;
  const activeEvent = normalizedEvents.find((event) => event.id === activeEventId) ?? null;

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
      <div className={`relative ${className}`} style={{ width: '100%', height }}>
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
    ? `${linePath} L ${chartWidth} ${height} L ${firstPoint.x} ${height} Z`
    : '';
  const lastPoint = normalizedPoints[normalizedPoints.length - 1] ?? null;

  return (
    <div className={`relative ${className}`} style={{ width: '100%', height }}>
      <div className="flex h-full w-full">
        <div
          ref={chartRef}
          className="relative h-full min-w-0 flex-1"
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
                x1={0}
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
                d={projectedLinePath}
                fill="none"
                stroke={projectedLineColor}
                strokeWidth={1.1}
                strokeDasharray="4 7"
              />
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

          {interactive && effectiveHoveredPoint && hoveredPriceText && hoveredTimeText ? (
            <div
              className="pointer-events-none absolute z-10 flex flex-col items-center gap-1"
              style={{
                left: Math.min(Math.max(effectiveHoveredPoint.x, 12), chartWidth - 12),
                top: Math.max(effectiveHoveredPoint.y - 56, 8),
              }}
            >
              <div className="rounded-lg bg-[color:var(--color-neutral-white)]/95 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-md ring-1 ring-[color:var(--color-neutral-black)]/5">
                {hoveredPriceText}
              </div>
              <div className="rounded-md bg-overlay-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-100 shadow">
                {hoveredTimeText}
              </div>
            </div>
          ) : null}

          {activeEvent && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-3 rounded-xl bg-[color:var(--color-neutral-white)]/95 px-3 py-2 text-xs shadow-lg ring-1 ring-[color:var(--color-neutral-black)]/5"
              style={{
                left: Math.min(Math.max(activeEvent.x, 60), chartWidth - 60),
                top: Math.max(activeEvent.y - 12, 12),
              }}
            >
              <div className="font-semibold text-slate-800">
                {activeEvent.typeLabel ?? activeEvent.type}
              </div>
              <div className="text-slate-500">
                {new Date(activeEvent.timestamp).toLocaleDateString()}
              </div>
              <div className="mt-1 text-slate-600">
                <span className="font-medium text-slate-800">
                  {activeEvent.priceLabel ?? activeEvent.price.toLocaleString()}
                </span>
                <span className="ml-2">·</span>
                <span>{activeEvent.quantityLabel ?? activeEvent.quantity.toLocaleString()}</span>
              </div>
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
