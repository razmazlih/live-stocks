import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StockInspectorProvider, useStockInspector } from '@/components/portfolio/stock-inspector';

vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en' }) }));
vi.mock('next/dynamic', () => ({ default: () => function Detail({ symbol }: { symbol: string }) { return <p>{symbol} chart</p>; } }));

function Holdings() {
  const inspect = useStockInspector();
  return <>{['AAPL', 'MSFT'].map(symbol => <button key={symbol} onClick={event => inspect?.({ symbol }, event.currentTarget)}>{symbol}</button>)}</>;
}
const renderInspector = (desktop: boolean) => {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
  return render(<StockInspectorProvider><Holdings /></StockInspectorProvider>);
};
afterEach(() => vi.unstubAllGlobals());

describe('stock inspector', () => {
  it('allows switching stocks on desktop and restores focus to the most recently selected stock', async () => {
    const user = userEvent.setup();
    renderInspector(true);
    await user.click(screen.getByRole('button', { name: 'AAPL' }));
    expect(screen.getByRole('dialog', { name: 'Stock details · AAPL' })).toBeInTheDocument();
    const second = screen.getByRole('button', { name: 'MSFT' });
    await user.click(second);
    expect(screen.getByRole('dialog', { name: 'Stock details · MSFT' })).toBeInTheDocument();
    expect(screen.queryByText('AAPL chart')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close stock details' }));
    await waitFor(() => expect(second).toHaveFocus());
  });
  it('expands the mobile sheet and restores focus without navigating', async () => {
    window.history.replaceState(null, '', '/?filter=winners');
    const user = userEvent.setup();
    renderInspector(false);
    const trigger = screen.getByRole('button', { name: 'AAPL' });
    await user.click(trigger);
    const expand = screen.getByRole('button', { name: 'Expand to full height' });
    fireEvent.click(expand);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(window.location.search).toBe('?filter=winners');
  });
});
