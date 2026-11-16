
vi.mock('@/hooks/use-investment-sources', () => {
  const sources = [
    { id: 'bank_one', name: 'ONE ZERO', archivedAt: null, createdAt: '2026-01-01' },
    { id: 'bank_two', name: 'Pepper', archivedAt: null, createdAt: '2026-01-02' },
  ];
  return { useInvestmentSources: () => ({ sources, activeSources: sources, loading: false, error: null,
    sourceName: (id: string) => sources.find(source => source.id === id)?.name ?? 'Unavailable source',
    resolveLocation: (id: string) => id, createSource: vi.fn(),
  }) };
});
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClosePairProposals } from '@/components/portfolio/close-pair-proposals';
import { toast } from 'sonner';
import { calculatePositionMetrics } from '@/lib/calculations';
import type { Position } from '@/types';

const context = vi.hoisted(() => ({ locale: 'en', settings: {annualGrowthRate: 0} }));
const fixturePolicy = vi.hoisted(() => ({ minLossUsd: 0, maxLosers: 1 }));
// Keep the small accounting fixtures; engine policy thresholds are tested separately.
vi.mock('@/lib/close-pair-proposals', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/close-pair-proposals')>();
  return { ...original, buildClosePairProposals: (...args: Parameters<typeof original.buildClosePairProposals>) => original.buildClosePairProposals(args[0], args[1], args[2], args[3], args[4], { ...args[5], ...fixturePolicy }) };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/context', () => ({ useApp: () => context }));
const metric = (symbol: string, price: number) => calculatePositionMetrics({
  id: symbol, symbol, display: symbol, imageUrl: '', entryPrice: 100,
  quantity: 2, entryDate: '2026-01-01', location: 'bank_one',
} satisfies Position, price, 3.5);

describe('close pair disclosure', () => {
  it('shows every ticker and every full quantity in a multi-loser group', async () => {
    context.locale = 'en';
    fixturePolicy.maxLosers = 3;
    const user = userEvent.setup();
    render(<ClosePairProposals metrics={[metric('WIN', 160), metric('LOSS', 80), metric('MORE', 80)]} />);
    const toggle = screen.getByRole('button', { name: /Expand WIN \+ LOSS \+ MORE details/ });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(toggle);
    expect(screen.getAllByText('All 2 shares')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /^MORE/ })).toBeVisible();
    expect(screen.getByText('+$40.00')).toBeInTheDocument();
    const selector = screen.getByRole('combobox', { name: 'Losing stocks per proposal' });
    expect(selector).toHaveValue('3');
    fixturePolicy.maxLosers = 1;
    await user.selectOptions(selector, '1');
    expect(screen.getByRole('button', { name: /Expand WIN \+ LOSS details/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Expand WIN \+ LOSS \+ MORE details/ })).not.toBeInTheDocument();
  });

  beforeEach(() => { context.settings.annualGrowthRate = 0; fixturePolicy.maxLosers = 1; });
  it('always shows the ideas and count without a collapsible section', () => {
    context.locale = 'en';
    render(<ClosePairProposals metrics={[metric('WIN', 130), metric('LOSS', 80)]} />);
    expect(screen.getByRole('heading', { name: 'Full-position exit ideas' }).closest('details')).toBeNull();
    expect(screen.getByLabelText('Idea count')).toHaveTextContent('1');
    expect(screen.getByRole('button', {name: 'Copy prompt for AI review'})).toBeVisible();
    expect(screen.getByTestId('close-pair-preview')).toBeVisible();
  });

  it('keeps individual pair details collapsed, opens with the keyboard and hides links when collapsed', async () => {
    context.locale = 'en';
    const user = userEvent.setup();
    render(<ClosePairProposals metrics={[metric('WIN', 130), metric('LOSS', 80)]} />);
    const toggle = screen.getByRole('button', { name: /Expand WIN \+ LOSS details/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('close-pair-preview')).toHaveTextContent(/WIN.*LOSS/);
    expect(screen.getByTestId('close-pair-preview')).toHaveTextContent('+$20.00');
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!.split(' ')[0])!;
    expect(panel).toHaveAttribute('inert');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('inert');
    expect(screen.getByText('+$20.00')).toBeInTheDocument();
    expect(screen.getAllByText(/All 2 shares/)).toHaveLength(2);
    expect(screen.getByText(/USD simulation/)).toHaveTextContent('Tax, exit fees and price changes are excluded');
    expect(screen.getByRole('link', { name: /^WIN/ })).toHaveAttribute('href', expect.stringContaining('/stock/WIN'));
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(panel).toHaveAttribute('inert');
    expect(screen.getByTestId('close-pair-preview')).toHaveTextContent('+$20.00');
  });

  it('excludes the CAPR pair when prior partial-sale losses outweigh current profits', () => {
    context.locale = 'en';
    const capr: Position = { ...metric('CAPR', 10).position, quantity: 22, entryPrice: 20.3, entryDate: '2026-07-17', lots: [
      { type: 'BUY', quantity: 44, price: 20.3, executedAt: '2026-07-17', hasCommission: false, commissionAmount: 0 },
      { type: 'SELL', quantity: 22, price: 3.87, executedAt: '2026-08-03', hasCommission: false, commissionAmount: 0 },
    ] };
    const cme: Position = { ...metric('CME', 316.9).position, quantity: 5, entryPrice: 261.07, entryDate: '2026-08-05' };
    const caprOpenSlice = { ...capr, lots: [{ ...capr.lots![0], quantity: 22 }] };
    const metrics = [calculatePositionMetrics(cme, 316.9, 3.5), calculatePositionMetrics(caprOpenSlice, 10, 3.5)];
    render(<ClosePairProposals metrics={metrics} positions={[cme, capr]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No qualifying exit groups');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('explains and exports realized plus unrealized results without adding old proceeds to new cash', async () => {
    context.locale = 'en';
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const loss: Position = { ...metric('LOSS', 90).position, lots: [
      { type: 'BUY', quantity: 1, price: 100, executedAt: '2025-01-01', hasCommission: false, commissionAmount: 0 },
      { type: 'SELL', quantity: 1, price: 70, executedAt: '2025-02-01', hasCommission: false, commissionAmount: 0 },
      { type: 'BUY', quantity: 2, price: 100, executedAt: '2026-01-01', hasCommission: false, commissionAmount: 0 },
    ] };
    const win = metric('WIN', 140);
    render(<ClosePairProposals metrics={[win, calculatePositionMetrics({ ...loss, lots: loss.lots!.slice(-1) }, 90, 3.5)]} positions={[win.position, loss]} />);
    await user.click(screen.getByRole('button', { name: 'Expand WIN + LOSS details' }));
    expect(screen.getAllByText(/Previously realized/)).toHaveLength(2);
    const lossCard = screen.getByRole('link', { name: /^LOSS/ }).closest('li')!;
    expect(within(lossCard).getByText('Previously realized')).not.toBeVisible();
    await user.click(within(lossCard).getByText('Profit & target breakdown'));
    expect(within(lossCard).getByText('Previously realized')).toBeVisible();
    expect(screen.getByRole('link', { name: /^LOSS/ }).closest('li')).toHaveTextContent('-$30.00');
    expect(screen.getByRole('link', { name: /^LOSS/ }).closest('li')).toHaveTextContent('-$20.00');
    await user.click(screen.getByRole('button', { name: 'Copy prompt for AI review' }));
    const prompt = write.mock.calls[0][0];
    const snapshot = JSON.parse(prompt.slice(prompt.indexOf('{')));
    expect(snapshot.pairs[0]).toMatchObject({combinedProfitUsd: 30, combinedRealizedProfitUsd: -30, combinedUnrealizedProfitUsd: 60, estimatedProceedsUsd: 460});
    expect(snapshot.pairs[0].legs[1]).toMatchObject({realizedProfitUsd: -30, unrealizedProfitUsd: -20, cumulativeProfitUsd: -50});
  });

  it('explains the filters when there is no profitable group', () => {
    context.locale = 'en';
    render(<ClosePairProposals metrics={[metric('WIN', 110), metric('LOSS', 80)]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No qualifying exit groups');
    expect(screen.getByText(/Loss filter:/)).toHaveTextContent('at least 5% and $50');
    expect(screen.getByText(/Loss filter:/)).toHaveTextContent('up to 24 eligible stocks');
    expect(screen.getByText(/Loss filter:/)).toHaveTextContent('does not guarantee the best combination');
    expect(screen.queryByRole('button', { name: 'Copy prompt for AI review' })).not.toBeInTheDocument();
  });

  it('shows Hebrew full-close wording and an explicit dollar calculation', async () => {
    context.locale = 'he';
    const user = userEvent.setup();
    render(<ClosePairProposals metrics={[metric('WIN', 130), metric('LOSS', 80)]} />);
    await user.click(screen.getByRole('button', { name: /פתיחת פרטי WIN \+ LOSS/ }));
    expect(screen.getByText(/הדמיה בדולרים/)).toBeInTheDocument();
    expect(screen.getAllByText(/כל 2 המניות/)).toHaveLength(2);
  });
  it('copies exactly the non-overlapping displayed pairs without opening details', async () => {
    context.locale = 'en';
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ClosePairProposals metrics={[metric('WIN', 130), metric('LOSS', 80), metric('OTHER', 95)]} />);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const toggle = screen.getByRole('button', { name: /Expand WIN \+ LOSS details/ });
    await user.click(screen.getByRole('button', { name: 'Copy prompt for AI review' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const prompt = write.mock.calls[0][0];
    const snapshot = JSON.parse(prompt.slice(prompt.indexOf('{')));
    expect(snapshot.pairs).toHaveLength(1);
    expect(snapshot.pairs[0].legs.map((leg: {symbol: string}) => leg.symbol)).toEqual(['WIN', 'LOSS']);
    expect(snapshot.pairs[0]).toMatchObject({combinedProfitUsd: 20, personalTargetProfitUsd: 0, surplusAboveTargetUsd: 20, annualPersonalReturnRate: 0});
    expect(prompt).toContain('not a market forecast');
    expect(snapshot.pairs[0].legs[0]).toMatchObject({quantity: 2, referencePriceUsd: 130, remainingFifoCostUsd: 200});
    expect(prompt).toContain('The document generation time is not a quote timestamp');
    expect(prompt).not.toContain('bank_one');
    expect(toast.success).toHaveBeenCalled();
  });

  it('reports clipboard errors and allows retry', async () => {
    context.locale = 'en';
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Blocked')).mockResolvedValue();
    render(<ClosePairProposals metrics={[metric('WIN', 130), metric('LOSS', 80)]} />);
    const copy = screen.getByRole('button', { name: 'Copy prompt for AI review' });
    await user.click(copy);
    expect(toast.error).toHaveBeenCalledWith('Copy failed. Please try again.');
    expect(copy).toBeEnabled();
    await user.click(copy);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('opens and closes pairs independently and can keep multiple pairs open', async () => {
    context.locale = 'en';
    const user = userEvent.setup();
    render(<ClosePairProposals metrics={[metric('W1', 140), metric('W2', 130), metric('L1', 80), metric('L2', 90)]} />);
    const first = screen.getByRole('button', { name: 'Expand W1 + L1 details' });
    const second = screen.getByRole('button', { name: 'Expand W2 + L2 details' });
    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: /^W1/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^W2/ })).not.toBeInTheDocument();
    second.focus();
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('link', { name: /^W1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^W2/ })).toBeInTheDocument();
  });

  it('uses the configured annual target and reveals the calculation only when opened', async () => {
    const user = userEvent.setup();
    context.locale = 'en';
    const positions = [metric('WIN', 130), metric('LOSS', 80)];
    const { rerender } = render(<ClosePairProposals metrics={positions} />);
    expect(screen.getByText('Above personal target · USD')).toBeInTheDocument();
    expect(screen.getByText('Cumulative profit').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByRole('button', {name: 'Expand WIN + LOSS details'}));
    expect(screen.getByText('Cumulative profit')).toBeVisible();
    expect(screen.getByText('Target to date')).toBeInTheDocument();
    context.settings.annualGrowthRate = 100;
    rerender(<ClosePairProposals metrics={positions} />);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No qualifying exit groups');
  });

});
