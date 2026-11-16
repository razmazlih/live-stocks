
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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PositionsPage from '@/app/positions/page';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', triggerRefresh: vi.fn(), refreshTrigger: 0 }) }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('activity entry points', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ c: 150 }), { status: 200 }))));
    from.mockReset();
    from.mockImplementation(() => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }));
    window.history.replaceState(null, '', '/positions');
  });

  it('opens the add dialog from a URL once and preserves filters', async () => {
    window.history.replaceState(null, '', '/positions?q=Apple&account=bank_two&action=add');
    const user = userEvent.setup();
    render(<PositionsPage />);
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
    expect(window.location.search).not.toContain('action=add');
    expect(window.location.search).toContain('q=Apple');
    expect(window.location.search).toContain('account=bank_two');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers a new position form and returns to the chooser without overlapping dialogs', async () => {
    const user = userEvent.setup();
    render(<PositionsPage />);
    const trigger = screen.getByRole('button', { name: 'Add transaction' });
    await user.click(trigger);
    const chooser = screen.getByRole('dialog', { name: 'New transaction' });
    await user.click(within(chooser).getByRole('button', { name: /New position/ }));
    expect(await screen.findByRole('dialog', { name: 'New position' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Back to transaction options' }));
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('searches all existing positions and opens buy/sell for the chosen account', async () => {
    const rows = [
      { id: 'p1', symbol: 'AAPL', display: 'Apple', quantity: 5, entry_price: 100, entry_date: '2026-10-01', location: 'bank_one', image_url: '' },
      { id: 'p2', symbol: 'MSFT', display: 'Microsoft', quantity: 0, entry_price: 100, entry_date: '2026-10-02', location: 'bank_two', image_url: '' },
    ];
    from.mockImplementation(() => ({ select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }));
    window.history.replaceState(null, '', '/positions?q=Apple&action=add');
    const user = userEvent.setup();
    render(<PositionsPage />);
    const chooser = await screen.findByRole('dialog', { name: 'New transaction' });
    await user.type(within(chooser).getByRole('searchbox'), 'Microsoft');
    const existing = await within(chooser).findByRole('button', { name: 'Select MSFT · Microsoft · Pepper' });
    expect(within(chooser).queryByRole('button', { name: /Select AAPL/ })).not.toBeInTheDocument();
    await user.click(existing);
    const transaction = await screen.findByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(transaction).getByText(/MSFT/)).toBeInTheDocument();
    expect(within(transaction).getByRole('radio', { name: 'Buy' })).toBeInTheDocument();
    await user.click(within(transaction).getByRole('radio', { name: 'Sell' }));
    expect(within(transaction).getByRole('radio', { name: 'Sell' })).toBeChecked();
    await user.click(within(transaction).getByRole('button', { name: 'Change position' }));
    const restored = await screen.findByRole('dialog', { name: 'New transaction' });
    await user.type(within(restored).getByRole('searchbox'), 'no-match');
    expect(within(restored).getByText('No positions match your search.')).toBeInTheDocument();
    await user.click(within(restored).getByRole('button', { name: 'Clear search' }));
    expect(within(restored).getByRole('searchbox')).toHaveValue('');
    await user.click(within(restored).getByRole('button', { name: 'Cancel' }));
    expect(window.location.search).toContain('q=Apple');
    expect(screen.getByText(/^Active positions: 1(?:\.0+)?$/)).toBeInTheDocument();
  });

  it('shows activity without tabs or a plans query for a legacy plans URL', async () => {
    window.history.replaceState(null, '', '/positions?q=Apple&account=bank_two&view=plans');
    render(<PositionsPage />);
    await waitFor(() => expect(from).toHaveBeenCalledWith('positions'));
    expect(from).not.toHaveBeenCalledWith('position_plans');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Future plans')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument();
    expect(window.location.search).toContain('q=Apple');
    expect(window.location.search).toContain('account=bank_two');
  });
});
