import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchExportDialog } from '@/components/portfolio/research-export-dialog';
import AiPromptsPage from '@/app/ai-prompts/page';

const { state, redirect } = vi.hoisted(() => ({
  state: { locale: 'he', loading: false, empty: false },
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: state.locale }) }));
vi.mock('@/hooks/use-portfolio-data', () => ({ usePortfolioData: () => ({ metrics: state.empty ? [] : [
  { position: { symbol: 'AAPL', display: 'Apple', quantity: 1, entryPrice: 10 }, currentValue: 20 },
  { position: { symbol: 'AAPL', display: 'Apple', quantity: 2, entryPrice: 15 }, currentValue: 40 },
  { position: { symbol: 'MSFT', display: 'Microsoft', quantity: 1, entryPrice: 10 }, currentValue: 20 },
], loading: state.loading, refreshing: false, lastUpdate: null, reload: vi.fn(), error: null }) }));

beforeEach(() => {
  state.locale = 'he';
  state.loading = false;
  state.empty = false;
  redirect.mockClear();
});

describe('research export dialog', () => {
  it('shows one selector per ticker and one privacy-limited document with both formats', async () => {
    const user = userEvent.setup();
    render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'ייצוא לניתוח' })).toHaveAttribute('dir', 'rtl');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Apple/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Apple/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const textbox = screen.getByRole('textbox');
    expect(textbox).toHaveAttribute('dir', 'ltr');
    const snapshot = JSON.parse((textbox as HTMLTextAreaElement).value);
    expect(snapshot.stocks).toHaveLength(2);
    expect(snapshot.stocks[0]).not.toHaveProperty('quantity');
    expect(snapshot.stocks[0]).not.toHaveProperty('currentValue');
    await user.click(screen.getByRole('button', { name: /Apple/ }));
    const selectedSnapshot = JSON.parse((textbox as HTMLTextAreaElement).value);
    expect(selectedSnapshot.stocks).toHaveLength(1);
    expect(selectedSnapshot.stocks[0].allocationOfOpenPortfolioPercent).toBe(25);
    await user.click(screen.getByRole('button', { name: 'פרומפט למחקר' }));
    expect((textbox as HTMLTextAreaElement).value).toContain('"symbol": "MSFT"');
    expect((textbox as HTMLTextAreaElement).value).not.toContain('"symbol": "AAPL"');
    await user.click(screen.getByRole('button', { name: /Microsoft/ }));
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
  });

  it('copies the selected format and supports closing with Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ResearchExportDialog open onOpenChange={onOpenChange} />);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'העתק ל-AI' }));
    expect(writeText).toHaveBeenCalledWith((screen.getByRole('textbox') as HTMLTextAreaElement).value);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables copying while loading and for an empty portfolio', () => {
    state.loading = true;
    const { rerender } = render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
    state.loading = false;
    state.empty = true;
    rerender(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
    expect(screen.getByText('אין פוזיציות פעילות כרגע.')).toBeInTheDocument();
  });

  it('has an English accessible name and renders nothing when closed', () => {
    state.locale = 'en';
    const { rerender } = render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Export for research' })).toHaveAttribute('dir', 'ltr');
    rerender(<ResearchExportDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('redirects the legacy route to the overview export action', () => {
    AiPromptsPage();
    expect(redirect).toHaveBeenCalledWith('/?export=research');
  });
});
