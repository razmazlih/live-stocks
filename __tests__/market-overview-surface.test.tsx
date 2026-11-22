import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MarketOverviewSurface } from '@/components/portfolio/market-overview-surface';
import type { MarketOverview } from '@/lib/market-overview';
import type { PortfolioSummary, Position } from '@/types';

const summary: PortfolioSummary = {
  totalCurrentPnLUsd: 125, totalCurrentPnLIls: 500, totalProjectedPnLUsd: 80, totalProjectedPnLIls: 320,
  totalCombinedUsd: 0, totalCombinedIls: 0, totalRealizedProfitUsd: 0, totalRealizedProfitIls: 0,
  totalTaxesPaidUsd: 0, totalTaxesPaidIls: 0, totalNetPnLUsd: 120, totalNetPnLIls: 480, totalValue: 1000,
  totalCost: 900, usdToIlsRate: 4,
};
const market: MarketOverview = {
  phase: 'regular', sessionDate: '2026-11-20', closeDate: '2026-11-19', nextTransition: null,
  asOf: Date.parse('2026-11-20T15:30:00Z'), regularCloseAt: Date.parse('2026-11-19T21:00:00Z'),
  closeConfirmed: true, closingProvisional: false, closingSummary: { ...summary, totalNetPnLUsd: 55, totalNetPnLIls: 220 },
  extendedEligible: 3, extendedCovered: 2,
  extended: [
    { symbol: 'NVDA', percent: -4, price: 96, asOf: Date.parse('2026-11-20T11:00:00Z') },
    { symbol: 'AAPL', percent: 2, price: 102, asOf: Date.parse('2026-11-20T11:00:00Z') },
  ],
  daily: {
    amountUsd: -8, amountIls: -32, fxDate: '2026-11-20', percent: -0.8, provisional: false, coveredPositions: 2, totalPositions: 2,
    contributors: [{ symbol: 'NVDA', amountUsd: -10, amountIls: -40 }, { symbol: 'AAPL', amountUsd: 2, amountIls: 8 }],
    sourceContributors: [{ sourceId: 'one', amountUsd: -8, amountIls: -32 }], missingSources: [], missingSymbols: [],
  },
};
const props = { summary, positions: [] as Position[], currency: 'USD', locale: 'en', options: { includeFees: true, includeTaxes: true }, sourceName: () => 'Bank One' } as const;
describe('session-aware overview', () => {
  it('leads with measured daily movement and opens symbol and source attribution from the keyboard', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MarketOverviewSurface {...props} marketOverview={market} />);
    expect(screen.getByText('Your loss today').compareDocumentPosition(screen.getByText('Above cumulative target')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const trigger = screen.getByRole('button', {name: 'Explore daily change'});
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = within(screen.getByRole('dialog', {name: 'Daily change breakdown'}));
    expect(dialog.getByText('NVDA').closest('li')).toHaveTextContent('-$10.00');
    expect(dialog.getByText('Bank One').closest('li')).toHaveTextContent('-$8.00');
    rerender(<MarketOverviewSurface {...props} marketOverview={{ ...market, phase: 'post' }} />);
    expect(screen.getByRole('dialog', { name: 'Daily change breakdown' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
  it('dates a prior close fallback at the open and keeps fresh intraday labels separate', () => {
    const { rerender } = render(<MarketOverviewSurface {...props} marketOverview={{
      ...market, sessionDate: '2026-11-19', daily: { ...market.daily, previousSession: true },
    }} />);
    expect(screen.getByRole('heading', { name: 'Last trading day result' }).parentElement).toHaveTextContent('Nov 19, 2026');
    expect(screen.queryByRole('heading', { name: 'Your loss today' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Below cumulative target/ })).toHaveTextContent('$25.00');
    expect(screen.getByText('Latest available holdings value')).toBeVisible();
    rerender(<MarketOverviewSurface {...props} marketOverview={{ ...market, daily: { ...market.daily, delayed: true } }} />);
    expect(screen.getByRole('heading', { name: 'Your loss today' })).toBeVisible();
    expect(screen.getByText(/Delayed prices/)).toBeVisible();
  });
  it('shows a dated close and one mover, with the full signed ranking on request', async () => {
    const user = userEvent.setup();
    render(<MarketOverviewSurface {...props} marketOverview={{ ...market, phase: 'pre' }} />);
    expect(screen.getByRole('link', {name: /Below cumulative target/})).toHaveTextContent('$25.00');
    expect(screen.getByText('Quotes available for 2 of 3 stocks')).toBeInTheDocument();
    expect(screen.getByText('NVDA')).toBeVisible();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'View ranked moves'}));
    expect(within(screen.getByRole('dialog')).getByText('AAPL').closest('li')).toHaveTextContent('+2.00%');
  });
  it('restores target priority at close and labels partial figures in Hebrew', () => {
    render(<MarketOverviewSurface {...props} locale="he" currency="ILS" marketOverview={{
      ...market, phase: 'closed', daily: { ...market.daily, coveredPositions: 1, provisional: true, percent: null },
    }} />);
    const region = screen.getByRole('region', {name: 'תמונת מצב התיק'});
    expect(region).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('מתחת ליעד המצטבר').compareDocumentPosition(screen.getByText('שינוי בהחזקות הזמינות')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('מבוסס על 1 מתוך 2 החזקות')).toBeInTheDocument();
    expect(screen.queryByText('התנועה הבולטת מאז הסגירה')).not.toBeInTheDocument();
  });
  it('keeps zero distinct from unavailable marks and indicates coverage for flat extended quotes', () => {
    render(<MarketOverviewSurface {...props} marketOverview={{ ...market, phase: 'overnight',
      closeConfirmed: false, closingSummary: null, extended: [], extendedCovered: 2 }} />);
    expect(screen.getByText(/Close awaiting confirmation/)).toBeInTheDocument();
    expect(screen.getByText('Available quotes show no change since close.')).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /Above cumulative target/})).not.toBeInTheDocument();
  });
});
