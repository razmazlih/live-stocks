import { render, screen, waitFor } from '@testing-library/react';
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
  vi.restoreAllMocks();
});

function promptSnapshot(prompt: string) {
  return JSON.parse(prompt.slice(prompt.indexOf('{'), prompt.lastIndexOf('}') + 1));
}

describe('compact research export dialog', () => {
  it('defaults to one primary copy action with one selected control per ticker and no visible raw document', () => {
    render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'ייצוא לניתוח' })).toHaveAttribute('dir', 'rtl');
    expect(screen.getAllByRole('button', { name: /Apple/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Apple/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'מסמך להעתקה ל-AI' })).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'העתק JSON' })).not.toBeVisible();
  });

  it('copies the research prompt with only selected tickers and keeps the snapshot privacy limited', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'העתק ל-AI' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const prompt = writeText.mock.calls[0][0];
    expect(prompt).toContain('אתה אנליסט מניות חיצוני');
    const snapshot = promptSnapshot(prompt);
    expect(snapshot.stocks).toHaveLength(2);
    expect(snapshot.stocks[0]).not.toHaveProperty('quantity');
    expect(snapshot.stocks[0]).not.toHaveProperty('currentValue');
    expect(snapshot.stocks[0]).not.toHaveProperty('profitUsd');
    await user.click(screen.getByRole('button', { name: /Apple/ }));
    await user.click(screen.getByRole('button', { name: 'העתק ל-AI' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const selected = promptSnapshot(writeText.mock.calls[1][0]);
    expect(selected.stocks).toHaveLength(1);
    expect(selected.stocks[0]).toMatchObject({ symbol: 'MSFT', allocationOfOpenPortfolioPercent: 25 });
  });

  it('keeps JSON and manual preview behind secondary options without changing the primary copy format', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Apple/ }));
    await user.click(screen.getByText('אפשרויות נוספות', { exact: true }));
    await user.click(screen.getByRole('button', { name: 'העתק JSON' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(JSON.parse(writeText.mock.calls[0][0]).stocks).toEqual([expect.objectContaining({ symbol: 'MSFT', allocationOfOpenPortfolioPercent: 25 })]);
    await user.click(screen.getByText('תצוגה מקדימה', { exact: true }));
    const preview = screen.getByRole('textbox', { name: 'מסמך להעתקה ל-AI' });
    expect((preview as HTMLTextAreaElement).value).toContain('אתה אנליסט מניות חיצוני');
    await user.click(screen.getByRole('button', { name: 'העתק ל-AI' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1][0]).toBe((preview as HTMLTextAreaElement).value);
  });

  it('provides a manual copy fallback if clipboard permission is denied', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Denied'));
    render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'העתק ל-AI' }));
    const preview = await screen.findByRole('textbox', { name: 'מסמך להעתקה ל-AI' });
    expect((preview as HTMLTextAreaElement).value).toBe(writeText.mock.calls[0][0]);
    expect(screen.getByText('לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק את הטקסט למטה.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Apple/ }));
    expect(promptSnapshot((preview as HTMLTextAreaElement).value).stocks).toEqual([expect.objectContaining({ symbol: 'MSFT' })]);
  });

  it('supports quick clear/select-all and disables copying while loading or with no holdings', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'נקה בחירה' }));
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'בחר הכול' }));
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeEnabled();
    state.loading = true;
    rerender(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
    state.loading = false;
    state.empty = true;
    rerender(<ResearchExportDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'העתק ל-AI' })).toBeDisabled();
    expect(screen.getByText('אין פוזיציות פעילות כרגע.')).toBeInTheDocument();
  });

  it('has an English accessible name, closes with Escape and renders nothing when closed', async () => {
    const user = userEvent.setup();
    state.locale = 'en';
    const onOpenChange = vi.fn();
    const { rerender } = render(<ResearchExportDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByRole('dialog', { name: 'Export for research' })).toHaveAttribute('dir', 'ltr');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<ResearchExportDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('redirects the legacy route to the overview export action', () => {
    AiPromptsPage();
    expect(redirect).toHaveBeenCalledWith('/?export=research');
  });
});
