'use client';

import { useId, useMemo } from 'react';

import { PositionLotType } from '@/types';

export interface SparklineMarker {
  id: string;
  type: PositionLotType;
  timestamp: number;
  price: number;
  label: string;
}

interface SparklineProps {
  data: number[];
  timestamps?: number[];
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
  className?: string;
  markers?: SparklineMarker[];
}

type SparklineSegment = {
  color: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export function Sparkline({
  data,
  timestamps,
  width = 320,
  height = 96,
  color = '#2563EB',
  baseline,
  baselineColor = 'rgba(148, 163, 184, 0.9)',
  projectedPrice,
  projectedLineColor = 'rgba(37, 99, 235, 0.8)',
  belowEntryColor = '#D22E2E',
  betweenProjectedColor = '#2563EB',
  aboveProjectedColor = '#4AA956',
  annualGrowthRate,
  yearsHeld,
  className = '',
  markers = [],
}: SparklineProps) {
  const gradientId = useId();
  const areaGradientId = `${gradientId}-fill`;
  const strokeGradientId = `${gradientId}-stroke`;
  const glowId = `${gradientId}-glow`;

  const normalized = useMemo(() => {
    if (!data || data.length < 2) {
      return null;
    }

    const projectionValues: number[] = [];
    const canProject =
      typeof baseline === 'number' &&
      typeof annualGrowthRate === 'number' &&
      typeof yearsHeld === 'number' &&
      Number.isFinite(annualGrowthRate) &&
      Number.isFinite(yearsHeld) &&
      data.length > 1;

    if (canProject) {
      const growthBase = 1 + annualGrowthRate;
      const isGrowthValid = growthBase > 0;

      if (isGrowthValid) {
        for (let index = 0; index < data.length; index += 1) {
          const progress = index / (data.length - 1);
          const projectedValue = baseline * Math.pow(growthBase, yearsHeld * progress);
          projectionValues.push(projectedValue);
        }
      }
    }

    const values = [
      ...data,
      ...(typeof baseline === 'number' ? [baseline] : []),
      ...(typeof projectedPrice === 'number' ? [projectedPrice] : []),
      ...projectionValues,
      ...markers.map((marker) => marker.price),
    ];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return { x, y };
    });

    const baselineY = typeof baseline === 'number'
      ? height - ((baseline - min) / range) * height
      : null;

    const projectedY = typeof projectedPrice === 'number'
      ? height - ((projectedPrice - min) / range) * height
      : null;

    const projectionPoints = projectionValues.length === data.length
      ? projectionValues.map((value, index) => {
          const x = (index / (data.length - 1)) * width;
          const y = height - ((value - min) / range) * height;
          return { x, y };
        })
      : null;

    const toY = (value: number) => height - ((value - min) / range) * height;

    return { points, baselineY, projectedY, projectionPoints, toY };
  }, [
    data,
    baseline,
    projectedPrice,
    width,
    height,
    annualGrowthRate,
    yearsHeld,
    markers,
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
      const startValue = data[index - 1];
      const endValue = data[index];
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

      let segmentStartPoint = startPoint;
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
    data,
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
      const startOffset = clampOffset(segment.start.x / width);
      const endOffset = clampOffset(segment.end.x / width);

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
  }, [segments, normalized, color, width]);

  const markerElements = useMemo(() => {
    if (!normalized || !normalized.points || normalized.points.length === 0) {
      return null;
    }

    const points = normalized.points;
    const timestampList = timestamps && timestamps.length === points.length ? timestamps : null;

    if (!timestampList || timestampList.length === 0) {
      return null;
    }

    const computeX = (target: number) => {
      const len = timestampList.length;

      if (len === 1) {
        return points[0].x;
      }

      if (target <= timestampList[0]) {
        return points[0].x;
      }

      if (target >= timestampList[len - 1]) {
        return points[len - 1].x;
      }

      let rightIndex = timestampList.findIndex((value) => value >= target);

      if (rightIndex === -1) {
        return points[len - 1].x;
      }

      if (timestampList[rightIndex] === target) {
        return points[rightIndex].x;
      }

      const leftIndex = Math.max(0, rightIndex - 1);
      const leftTimestamp = timestampList[leftIndex];
      const rightTimestamp = timestampList[rightIndex];
      const leftPoint = points[leftIndex];
      const rightPoint = points[rightIndex];

      if (rightTimestamp === leftTimestamp) {
        return rightPoint.x;
      }

      const ratio = (target - leftTimestamp) / (rightTimestamp - leftTimestamp);

      return leftPoint.x + (rightPoint.x - leftPoint.x) * ratio;
    };

    return markers
      .map((marker) => {
        if (!Number.isFinite(marker.price) || !Number.isFinite(marker.timestamp)) {
          return null;
        }

        const x = computeX(marker.timestamp);
        const y = normalized.toY(marker.price);
        const isBuy = marker.type === 'BUY';
        const fillColor = isBuy ? 'rgba(16, 185, 129, 0.18)' : 'rgba(248, 113, 113, 0.18)';
        const strokeColor = isBuy ? '#059669' : '#DC2626';

        return (
          <g key={marker.id}>
            <circle cx={x} cy={y} r={6} fill={fillColor} stroke="none" />
            <circle cx={x} cy={y} r={3.5} fill="#ffffff" stroke={strokeColor} strokeWidth={1.5} />
            <title>{marker.label}</title>
          </g>
        );
      })
      .filter((element): element is JSX.Element => element !== null);
  }, [markers, normalized, timestamps]);

  if (!normalized) {
    return <div className={className} style={{ width, height }} />;
  }

  const { points, baselineY, projectedY, projectionPoints, toY } = normalized;
  const areaPath = [`M 0 ${height}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${width} ${height}`, 'Z'].join(' ');
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const lastPoint = points[points.length - 1];

  const lastSegmentColor = segments[segments.length - 1]?.color ?? color;
  const projectedLinePath = projectionPoints && projectionPoints.length > 1
    ? projectionPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    : projectedY !== null
      ? `M 0 ${projectedY} L ${width} ${projectedY}`
      : null;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lastSegmentColor} stopOpacity={0.35} />
          <stop offset="100%" stopColor={lastSegmentColor} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={strokeGradientId} x1="0" x2={width} y1="0" y2="0" gradientUnits="userSpaceOnUse">
          {gradientStops.map((stop, index) => (
            <stop key={`${stop.offset}-${stop.color}-${index}`} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
          ))}
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g opacity={0.08}>
        <line x1="0" y1={height} x2={width} y2={height} stroke={color} strokeWidth="1" strokeDasharray="2 4" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth="1" strokeDasharray="2 4" />
      </g>

      {baselineY !== null && (
        <line
          x1={0}
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke={baselineColor}
          strokeWidth="1"
          strokeDasharray="4 3"
        />
      )}

      {projectedLinePath && (
        <path
          d={projectedLinePath}
          fill="none"
          stroke={projectedLineColor}
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      )}

      <path
        d={areaPath}
        fill={`url(#${areaGradientId})`}
        opacity={0.6}
      />

      <path
        d={linePath}
        fill="none"
        stroke={`url(#${strokeGradientId})`}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />

      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={2.8}
        fill="#ffffff"
        stroke={lastSegmentColor}
        strokeWidth={1.2}
      />

      {markerElements}
    </svg>
  );
}
