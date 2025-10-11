'use client';

import { useEffect, useId, useMemo, useState } from 'react';

import { formatCurrency, formatDate, formatNumber } from '@/lib/calculations';
import { HistoricalPoint, Locale, PositionLot, PositionLotType } from '@/types';

interface SparklineProps {
  data: HistoricalPoint[];
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
  lots?: PositionLot[];
  locale: Locale;
  tradeLabels?: Record<PositionLotType, string>;
}

type SparklineSegment = {
  color: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type SparklineMarker = {
  id: string;
  lot: PositionLot;
  x: number;
  y: number;
  color: string;
  title: string;
  lines: string[];
};

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
  annualGrowthRate,
  yearsHeld,
  className = '',
  lots = [],
  locale,
  tradeLabels,
}: SparklineProps) {
  const gradientId = useId();
  const areaGradientId = `${gradientId}-fill`;
  const strokeGradientId = `${gradientId}-stroke`;
  const glowId = `${gradientId}-glow`;
  const isRtl = locale === 'he';

  const normalized = useMemo(() => {
    if (!data || data.length < 2) {
      return null;
    }

    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const closes = sortedData.map((point) => point.close);

    const projectionValues: number[] = [];
    const canProject =
      typeof baseline === 'number' &&
      typeof annualGrowthRate === 'number' &&
      typeof yearsHeld === 'number' &&
      Number.isFinite(annualGrowthRate) &&
      Number.isFinite(yearsHeld) &&
      sortedData.length > 1;

    if (canProject) {
      const growthBase = 1 + annualGrowthRate;
      const isGrowthValid = growthBase > 0;

      if (isGrowthValid) {
        for (let index = 0; index < sortedData.length; index += 1) {
          const progress = index / (sortedData.length - 1);
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
    ];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const startTimestamp = sortedData[0]?.timestamp ?? 0;
    const endTimestamp = sortedData[sortedData.length - 1]?.timestamp ?? startTimestamp;
    const timeRange = Math.max(endTimestamp - startTimestamp, 0);

    const computeX = (timestamp: number, index: number) => {
      if (sortedData.length === 1) {
        return width / 2;
      }

      if (timeRange === 0) {
        return (index / (sortedData.length - 1)) * width;
      }

      return ((timestamp - startTimestamp) / (timeRange || 1)) * width;
    };

    const points = sortedData.map((point, index) => {
      const x = computeX(point.timestamp, index);
      const y = height - ((point.close - min) / range) * height;
      return { x, y };
    });

    const baselineY = typeof baseline === 'number'
      ? height - ((baseline - min) / range) * height
      : null;

    const projectedY = typeof projectedPrice === 'number'
      ? height - ((projectedPrice - min) / range) * height
      : null;

    const projectionPoints = projectionValues.length === sortedData.length
      ? projectionValues.map((value, index) => {
          const referencePoint = points[index];
          const x = referencePoint?.x ?? computeX(sortedData[index]?.timestamp ?? startTimestamp, index);
          const y = height - ((value - min) / range) * height;
          return { x, y };
        })
      : null;

    return {
      points,
      baselineY,
      projectedY,
      projectionPoints,
      closes,
      minValue: min,
      maxValue: max,
      valueRange: range,
      startTimestamp,
      endTimestamp,
    };
  }, [
    data,
    baseline,
    projectedPrice,
    width,
    height,
    annualGrowthRate,
    yearsHeld,
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

  const resolvedTradeLabels = useMemo(
    () => ({
      BUY: tradeLabels?.BUY ?? 'Buy',
      SELL: tradeLabels?.SELL ?? 'Sell',
    }),
    [tradeLabels]
  );

  const markers = useMemo(() => {
    if (!normalized || !lots.length) {
      return [] as SparklineMarker[];
    }

    const sortedLots = [...lots].sort((a, b) => {
      const aTime = new Date(a.executedAt).getTime();
      const bTime = new Date(b.executedAt).getTime();
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0;
      }
      return aTime - bTime;
    });

    const { startTimestamp, endTimestamp, minValue, valueRange } = normalized;
    const safeValueRange = valueRange || 1;
    const timeRange = Math.max(endTimestamp - startTimestamp, 1);

    return sortedLots
      .map((lot, index) => {
        const executedAt = new Date(lot.executedAt).getTime();
        if (!Number.isFinite(executedAt)) {
          return null;
        }

        const price = Number.isFinite(lot.price) ? lot.price : Number.NaN;
        const quantity = Number.isFinite(lot.quantity) ? lot.quantity : Number.NaN;

        if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }

        const clampedTime = Math.min(Math.max(executedAt, startTimestamp), endTimestamp);
        const ratio = timeRange === 0 ? 0 : (clampedTime - startTimestamp) / timeRange;
        const x = ratio * width;
        const rawY = height - ((price - minValue) / safeValueRange) * height;
        const y = Number.isFinite(rawY) ? Math.min(Math.max(rawY, 0), height) : height;

        const label = lot.type === 'SELL' ? resolvedTradeLabels.SELL : resolvedTradeLabels.BUY;
        const quantityText = formatNumber(quantity, locale);
        const priceText = formatCurrency(price, 'USD', locale);
        const dateText = formatDate(lot.executedAt, locale);

        const lines = [label, `${quantityText} × ${priceText}`, dateText];
        const title = `${label} • ${quantityText} × ${priceText} • ${dateText}`;

        return {
          id: lot.id ?? `${lot.type}-${lot.executedAt}-${index}`,
          lot,
          x,
          y,
          color: lot.type === 'SELL' ? '#DC2626' : '#059669',
          title,
          lines,
        } satisfies SparklineMarker;
      })
      .filter((marker): marker is SparklineMarker => marker !== null);
  }, [lots, normalized, width, height, locale, resolvedTradeLabels]);

  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  useEffect(() => {
    if (activeMarkerId && !markers.some((marker) => marker.id === activeMarkerId)) {
      setActiveMarkerId(null);
    }
  }, [markers, activeMarkerId]);

  const activeMarker = useMemo(
    () => markers.find((marker) => marker.id === activeMarkerId) ?? null,
    [markers, activeMarkerId]
  );

  const tooltip = useMemo(() => {
    if (!activeMarker) {
      return null;
    }

    const padding = 12;
    const lineHeight = 16;
    const tooltipWidth = 196;
    const tooltipHeight = padding * 2 + lineHeight * activeMarker.lines.length;

    let x = activeMarker.x + 12;
    if (x + tooltipWidth > width) {
      x = Math.max(activeMarker.x - tooltipWidth - 12, 0);
    }

    let y = activeMarker.y - tooltipHeight - 12;
    if (y < 0) {
      y = Math.min(activeMarker.y + 12, height - tooltipHeight);
      if (y < 0) {
        y = 0;
      }
    }

    if (y + tooltipHeight > height) {
      y = height - tooltipHeight;
    }

    return {
      x,
      y,
      width: tooltipWidth,
      height: tooltipHeight,
      padding,
      lineHeight,
      anchorX: Math.min(Math.max(activeMarker.x, x + 8), x + tooltipWidth - 8),
    };
  }, [activeMarker, width, height]);

  if (!normalized) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-hidden="true"
        preserveAspectRatio="none"
      />
    );
  }

  const { points, baselineY, projectedY, projectionPoints } = normalized;
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
      preserveAspectRatio="none"
      onPointerLeave={() => setActiveMarkerId(null)}
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

      {markers.map((marker) => {
        const isActive = marker.id === activeMarkerId;
        return (
          <g key={marker.id}>
            <circle
              cx={marker.x}
              cy={marker.y}
              r={isActive ? 7.5 : 6.5}
              fill={marker.color}
              opacity={isActive ? 0.28 : 0.16}
              pointerEvents="none"
            />
            <circle
              cx={marker.x}
              cy={marker.y}
              r={4.2}
              fill="#ffffff"
              stroke={marker.color}
              strokeWidth={1.6}
              tabIndex={0}
              role="button"
              aria-label={marker.title}
              onPointerEnter={() => setActiveMarkerId(marker.id)}
              onPointerDown={(event) => {
                event.preventDefault();
                setActiveMarkerId(marker.id);
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                setActiveMarkerId(marker.id);
              }}
              onFocus={() => setActiveMarkerId(marker.id)}
              onBlur={() => setActiveMarkerId(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActiveMarkerId(marker.id);
                }
              }}
            >
              <title>{marker.title}</title>
            </circle>
          </g>
        );
      })}

      {activeMarker && tooltip && (
        <g pointerEvents="none">
          <line
            x1={activeMarker.x}
            y1={activeMarker.y}
            x2={tooltip.anchorX}
            y2={tooltip.y + tooltip.height}
            stroke={activeMarker.color}
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.6}
          />
          <rect
            x={tooltip.x}
            y={tooltip.y}
            width={tooltip.width}
            height={tooltip.height}
            rx={10}
            fill="rgba(15, 23, 42, 0.92)"
            stroke={activeMarker.color}
            strokeWidth={0.8}
          />
          <text
            x={isRtl ? tooltip.x + tooltip.width - tooltip.padding : tooltip.x + tooltip.padding}
            y={tooltip.y + tooltip.padding + 2}
            fill="white"
            fontSize={11}
            fontWeight={500}
            textAnchor={isRtl ? 'end' : 'start'}
            style={{ direction: isRtl ? 'rtl' : 'ltr' }}
          >
            {activeMarker.lines.map((line, index) => (
              <tspan
                key={`${activeMarker.id}-line-${index}`}
                x={isRtl ? tooltip.x + tooltip.width - tooltip.padding : tooltip.x + tooltip.padding}
                dy={index === 0 ? 0 : tooltip.lineHeight}
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}

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
