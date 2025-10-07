'use client';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  baseline?: number;
  baselineColor?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = '#3B82F6',
  baseline,
  baselineColor = '#94A3B8',
  className = ''
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <div className={className} style={{ width, height }} />;
  }

  const values = typeof baseline === 'number' ? [...data, baseline] : data;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const baselineY = typeof baseline === 'number'
    ? height - ((baseline - min) / range) * height
    : null;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
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
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}
