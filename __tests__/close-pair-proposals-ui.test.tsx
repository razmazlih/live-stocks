import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClosePairProposals } from '@/components/portfolio/close-pair-proposals';
import { calculatePositionMetrics } from '@/lib/calculations';
import type { Position } from '@/types';

const context = vi.hoisted(() => ({ locale: 'en' }));
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
    const toggle = screen.getByRole('button', { name: /Two-position exit ideas/ });
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
    await user.click(screen.getByRole('button', { name: /הצעות לסגירת שתי פוזיציות/ }));
    expect(screen.getByText(/הדמיה בדולרים/)).toBeInTheDocument();
    expect(screen.getAllByText(/כל 2 המניות/)).toHaveLength(2);
  });
});
