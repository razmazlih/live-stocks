'use client';

import { useId, useMemo } from 'react';

interface SparklineProps {
  data: number[];
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
  className?: string;
}

export function Sparkline({
  data,
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
  className = ''
}: SparklineProps) {
  const gradientId = useId();
  const areaGradientId = `${gradientId}-fill`;
  const glowId = `${gradientId}-glow`;

  const normalized = useMemo(() => {
    if (!data || data.length < 2) {
      return null;
    }

    const values = [
      ...data,
      ...(typeof baseline === 'number' ? [baseline] : []),
      ...(typeof projectedPrice === 'number' ? [projectedPrice] : []),
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

    return { points, baselineY, projectedY };
  }, [data, baseline, projectedPrice, width, height]);

  if (!normalized) {
    return <div className={className} style={{ width, height }} />;
  }

  const { points, baselineY, projectedY } = normalized;
  const areaPath = [`M 0 ${height}`, ...points.map((point) => `L ${point.x} ${point.y}`), `L ${width} ${height}`, 'Z'].join(' ');
  const lastPoint = points[points.length - 1];

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

  const segments: { color: string; path: string }[] = [];
  let currentSegment: { color: string; path: string } | null = null;

  points.forEach((point, index) => {
    const pointColor = determineColor(data[index]);

    if (!currentSegment) {
      currentSegment = {
        color: pointColor,
        path: `M ${point.x} ${point.y}`,
      };
      return;
    }

    if (currentSegment.color !== pointColor) {
      currentSegment.path = `${currentSegment.path} L ${point.x} ${point.y}`;
      segments.push(currentSegment);

      currentSegment = {
        color: pointColor,
        path: `M ${point.x} ${point.y}`,
      };
      return;
    }

    currentSegment.path = `${currentSegment.path} L ${point.x} ${point.y}`;
  });

  if (currentSegment) {
    segments.push(currentSegment);
  }

  const lastSegmentColor = segments[segments.length - 1]?.color ?? color;

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

      {projectedY !== null && (
        <line
          x1={0}
          y1={projectedY}
          x2={width}
          y2={projectedY}
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

      {segments.map((segment) => (
        <path
          key={segment.path}
          d={segment.path}
          fill="none"
          stroke={segment.color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
        />
      ))}

      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={2.8}
        fill="#ffffff"
        stroke={lastSegmentColor}
        strokeWidth={1.2}
      />
    </svg>
  );
}
