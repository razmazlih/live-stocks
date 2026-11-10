import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClosePairProposals } from '@/components/portfolio/close-pair-proposals';
import { toast } from 'sonner';
import { calculatePositionMetrics } from '@/lib/calculations';
import type { Position } from '@/types';

const context = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/context', () => ({ useApp: () => context }));
const metric = (symbol: string, price: number) => calculatePositionMetrics({
  id: symbol, symbol, display: symbol, imageUrl: '', entryPrice: 100,
  quantity: 2, entryDate: '2026-01-01', location: 'bank_one',
} satisfies Position, price, 3.5);

describe('close pair disclosure', () => {
  it('starts collapsed, opens with the keyboard and hides links when collapsed', async () => {
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

  it('leaves no extra surface when there is no profitable pair', () => {
    const { container } = render(<ClosePairProposals metrics={[metric('WIN', 110), metric('LOSS', 80)]} />);
    expect(container).toBeEmptyDOMElement();
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
    expect(snapshot.pairs[0].combinedProfitUsd).toBe(20);
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

});
