import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Position } from '@/types';
const state = vi.hoisted(() => ({ positions: [] as Position[], hasData: true, error: null as string | null }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({ ...state, loading: false, refreshing: false, reload: vi.fn(), lastUpdate: null }) }));
import { PortfolioFeedback } from '@/components/dashboard/portfolio-feedback';

const position = (commissionKnown: boolean): Position => ({ symbol: 'AAPL', display: 'Apple', imageUrl: '', quantity: 2, entryPrice: 100, entryDate: '2026-01-01', location: 'account-one', lots: [{ type: 'BUY', price: 100, quantity: 2, executedAt: '2026-01-01', hasCommission: false, commissionAmount: 0, commissionKnown }] });
beforeEach(() => { state.positions = []; state.hasData = true; state.error = null; });
afterEach(cleanup);

describe('portfolio commission feedback', () => {
  it.each(['he', 'en'] as const)('discloses unknown fees in %s while retaining the portfolio', locale => {
    state.positions = [position(false)];
    render(<PortfolioFeedback locale={locale}><p>Portfolio content</p></PortfolioFeedback>);
    const warning = screen.getByRole('status');
    expect(warning.textContent).toContain('AAPL');
    expect(warning.textContent).toContain(locale === 'he' ? 'לא כוללים את העמלות החסרות' : 'do not include these missing fees');
    expect(screen.getByText('Portfolio content')).toBeInTheDocument();
  });
  it('does not show a missing-fee warning for a confirmed zero commission', () => {
    state.positions = [position(true)];
    render(<PortfolioFeedback locale="he"><p>Portfolio content</p></PortfolioFeedback>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
