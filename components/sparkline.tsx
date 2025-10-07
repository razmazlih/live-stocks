'use client';

import { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const hexToRgba = (hex: string, alpha: number) => {
  let sanitized = hex.replace('#', '');

  if (sanitized.length === 3) {
    sanitized = sanitized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function Sparkline({
  data,
  width = 120,
  height = 48,
  color = '#3B82F6',
  className = '',
}: SparklineProps) {
  const gradientId = useId();

  if (!data || data.length < 2) {
    return <div className={className} style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;

    return { x, y };
  });

  const linePath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x},${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;

    return `${path} Q ${controlX},${previous.y} ${point.x},${point.y}`;
  }, '');

  const areaPath = `${linePath} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaFill = hexToRgba(color, 0.18);
  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const y = (height / 4) * (index + 1);
    return { y, key: `grid-${index}` };
  });

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${gradientId}-stroke`} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor={hexToRgba(color, 0.85)} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
        <linearGradient id={`${gradientId}-fill`} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor={areaFill} />
          <stop offset="100%" stopColor={hexToRgba(color, 0.02)} />
        </linearGradient>
      </defs>

      <g opacity={0.6}>
        {gridLines.map((line) => (
          <line
            key={line.key}
            x1={0}
            x2={width}
            y1={line.y}
            y2={line.y}
            stroke="rgba(148, 163, 184, 0.15)"
            strokeWidth={0.5}
          />
        ))}
      </g>

      <path d={areaPath} fill={`url(#${gradientId}-fill)`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={`url(#${gradientId}-stroke)`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={2.6}
        fill={color}
        stroke="white"
        strokeWidth={1}
      />

      <circle
        cx={firstPoint.x}
        cy={firstPoint.y}
        r={1.8}
        fill="white"
        stroke={hexToRgba(color, 0.5)}
        strokeWidth={1}
      />
    </svg>
  );
}
