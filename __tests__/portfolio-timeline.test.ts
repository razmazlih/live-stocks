import { describe, expect, it } from 'vitest';

import { aggregatePortfolioTimeline } from '@/hooks/use-portfolio-data';
import { PortfolioTimelinePoint } from '@/types';

const DAY = 24 * 60 * 60 * 1000;

const createPoint = (
  timestamp: number,
  overrides: Partial<PortfolioTimelinePoint>
): PortfolioTimelinePoint => ({
  timestamp,
  totalPnLUsd: 0,
  totalPnLIls: 0,
  netPnLUsd: 0,
  netPnLIls: 0,
  expectedNetPnLUsd: 0,
  expectedNetPnLIls: 0,
  ...overrides,
});

describe('aggregatePortfolioTimeline', () => {
  it('carries realized gains across fully closed and reopened positions', () => {
    const day1 = new Date('2024-01-01').getTime();
    const day2 = day1 + DAY;
    const day3 = day2 + DAY;

    const firstActivation: PortfolioTimelinePoint[] = [
      createPoint(day1, {
        totalPnLUsd: 10,
        netPnLUsd: 10,
        expectedNetPnLUsd: 12,
      }),
      createPoint(day2, {
        totalPnLUsd: 0,
        netPnLUsd: 30,
        expectedNetPnLUsd: 32,
      }),
    ];

    const secondActivation: PortfolioTimelinePoint[] = [
      createPoint(day3, {
        totalPnLUsd: 5,
        netPnLUsd: 5,
        expectedNetPnLUsd: 6,
      }),
    ];

    const aggregated = aggregatePortfolioTimeline([
      { timeline: firstActivation },
      { timeline: secondActivation },
    ]);

    expect(aggregated).toHaveLength(3);
    expect(aggregated[0]).toMatchObject({ timestamp: day1, totalPnLUsd: 10, netPnLUsd: 10 });
    expect(aggregated[1]).toMatchObject({ timestamp: day2, totalPnLUsd: 0, netPnLUsd: 30 });
    expect(aggregated[2]).toMatchObject({ timestamp: day3, totalPnLUsd: 5, netPnLUsd: 35 });
  });

  it('returns an empty timeline when there are no results', () => {
    expect(aggregatePortfolioTimeline([])).toEqual([]);
  });
});

