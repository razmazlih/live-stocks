import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClosePairChart } from '@/components/portfolio/close-pair-chart';
import { buildClosePairProposals } from '@/lib/close-pair-proposals';
import { calculatePositionMetrics } from '@/lib/calculations';
import type { HistoricalPoint, Position } from '@/types';

const capture = vi.hoisted(() => vi.fn());
vi.mock('@/components/charts/sparkline', () => ({ Sparkline: (props: unknown) => { capture(props); return <svg data-testid="pair-line" />; } }));
const metric = (symbol: string, price: number) => calculatePositionMetrics({
  id: symbol, activationId: `active-${symbol}`, symbol, display: symbol, imageUrl: '', entryPrice: 100,
  quantity: 2, entryDate: '2026-01-01', location: 'bank_one',
} satisfies Position, price, 3.5);
const [proposal] = buildClosePairProposals([metric('WIN', 130), metric('LOSS', 80)]);
const history = (prices: number[]): HistoricalPoint[] => prices.map((close, index) => ({timestamp: Date.UTC(2026, 9, index + 1), close}));

describe('combined pair chart', () => {
  it('uses activation histories, shows the combined dollar result and a zero baseline', () => {
    render(<ClosePairChart proposal={proposal} locale="en" sparklineData={{'active-WIN': history([90, 120]), 'active-LOSS': history([95, 90])}} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/Combined profit for WIN and LOSS.*latest \$20.00/);
    expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({baseline: 0, interactive: false, points: [
      {timestamp: Date.UTC(2026, 9, 1), close: -30}, {timestamp: Date.UTC(2026, 9, 2), close: 20},
    ]}));
    expect(screen.getByText(/current remaining quantities/i)).toBeInTheDocument();
    expect(screen.queryByText(/Last close/)).not.toBeInTheDocument();
  });
  it('does not fabricate a chart when either history is missing', () => {
    render(<ClosePairChart proposal={proposal} locale="he" sparklineData={{'active-WIN': history([90, 120])}} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('אין מספיק נתונים היסטוריים משותפים לשתי המניות')).toBeInTheDocument();
  });
  it('labels a historical close separately when it differs from the live proposal', () => {
    render(<ClosePairChart proposal={{...proposal, netProfitUsd: 25}} locale="en" sparklineData={{'active-WIN': history([90, 120]), 'active-LOSS': history([95, 90])}} />);
    expect(screen.getByText(/Last close/)).toHaveTextContent('Last close · Oct 2: +$20.00');
  });

});
