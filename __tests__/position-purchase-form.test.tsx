
vi.mock('@/hooks/use-investment-sources', () => {
  const sources = [
    { id: 'bank_one', name: 'ONE ZERO', archivedAt: null, createdAt: '2026-01-01' },
    { id: 'bank_two', name: 'Pepper', archivedAt: null, createdAt: '2026-01-02' },
  ];
  return { useInvestmentSources: () => ({ sources, activeSources: sources, loading: false, error: null,
    sourceName: (id: string) => sources.find(source => source.id === id)?.name ?? 'Unavailable source',
    resolveLocation: (id: string) => id, createSource: async (name: string) => {
      const source = { id: '10000000-0000-4000-8000-000000000003', name: name.trim(), archivedAt: null, createdAt: '2026-01-03' };
      sources.push(source); return source;
    },
  }) };
});
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PositionsPage from '@/app/positions/page';

const { from, rpc, triggerRefresh, toastError } = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), triggerRefresh: vi.fn(), toastError: vi.fn(),
}));
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', triggerRefresh, refreshTrigger: 0 }) }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from, rpc }) }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@/components/ui/stock-avatar-image', () => ({ StockAvatarImage: () => null }));

const successfulPurchase = { data: [{ position_id: 'existing-adbe', lot_id: 'new-buy', reused: true }], error: null };
function seedPosition(closed = false, commissionKnown?: boolean) {
  const lots = [{ id: 'old-buy', position_id: 'existing-adbe', side: 'BUY', price: 100, quantity: 5, executed_at: '2026-01-01', has_commission: false, commission_amount: 0, ...(commissionKnown === undefined ? {} : { commission_known: commissionKnown }) }];
  if (closed) lots.push({ ...lots[0], id: 'old-sale', side: 'SELL', price: 110, executed_at: '2026-02-01' });
  const row = { id: 'existing-adbe', symbol: 'ADBE', display: 'Adobe Inc', image_url: '', quantity: closed ? 0 : 5, entry_price: 100, entry_date: '2026-01-01', location: 'bank_one', position_lots: lots };
  from.mockImplementation((table: string) => {
    if (table !== 'positions') throw new Error(`Unexpected table mutation: ${table}`);
    return { select: () => ({ order: () => Promise.resolve({ data: [row], error: null }) }) };
  });
}

async function openPurchaseForm() {
  const user = userEvent.setup();
  render(<PositionsPage />);
  await user.click(screen.getByRole('button', { name: 'Add transaction' }));
  const chooser = screen.getByRole('dialog', { name: 'New transaction' });
  await within(chooser).findByRole('button', { name: 'Select ADBE · Adobe Inc · ONE ZERO' });
  await user.click(within(chooser).getByRole('button', { name: /New position/ }));
  const dialog = await screen.findByRole('dialog', { name: 'New position' });
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Symbol' }), { target: { value: 'adbe' } });
  fireEvent.change(dialog.querySelector('#initialPrice')!, { target: { value: '120' } });
  fireEvent.change(dialog.querySelector('#initialQuantity')!, { target: { value: '3' } });
  return { user, dialog, submit: within(dialog).getByRole('button', { name: 'Add purchase to position' }), form: dialog.querySelector('form')! };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ c: 0 }), { status: 200 })));
  rpc.mockResolvedValue(successfulPurchase);
  seedPosition();
  window.history.replaceState(null, '', '/positions');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('continuing existing positions from the new-position form', () => {
  it.each([false, true])('clearly continues the existing position, including a closed position (%s)', async closed => {
    seedPosition(closed);
    const { user, dialog, submit } = await openPurchaseForm();
    expect(within(dialog).getByText(closed ? 'This position was previously closed in this account' : 'This position is already active in this account')).toBeInTheDocument();
    expect(within(dialog).getByText('This purchase will continue the same position and preserve all existing transactions and history.')).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName(closed ? 'Reopen position' : 'Add purchase to position');
    expect(within(dialog).getByText('Position before this purchase')).toBeInTheDocument();
    expect(within(dialog).getByText('New purchase details')).toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton', { name: 'Price' })).toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton', { name: 'Quantity' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Date', { exact: true })).toBeInTheDocument();
    expect(within(dialog).queryByText('Initial price')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Initial quantity')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Initial date')).not.toBeInTheDocument();
    await user.click(submit);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls[0][0]).toBe('record_position_purchase');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_symbol: 'ADBE', p_location: 'bank_one', p_price: 120, p_quantity: 3 });
    expect(from.mock.calls.every(([table]) => table === 'positions')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(triggerRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the same request ID when retrying an unchanged purchase after a failed response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'NETWORK', message: 'Response lost' } }).mockResolvedValueOnce(successfulPurchase);
    const { user, submit } = await openPurchaseForm();
    await user.click(submit);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][1].p_request_id).toBe(rpc.mock.calls[0][1].p_request_id);
    expect(typeof rpc.mock.calls[0][1].p_request_id).toBe('string');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    vi.mocked(console.error).mockRestore();
  });

  it('blocks repeated submissions while the purchase is pending', async () => {
    let resolvePurchase!: (result: typeof successfulPurchase) => void;
    rpc.mockImplementation(() => new Promise(resolve => { resolvePurchase = resolve; }));
    const { form, submit } = await openPurchaseForm();
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    await act(async () => resolvePurchase(successfulPurchase));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

it('selects a newly created third source immediately and purchases into its ID', async () => {
  const { user, dialog, form } = await openPurchaseForm();
  fireEvent.change(within(dialog).getByLabelText('New source name'), { target: { value: 'בית השקעות שלישי' } });
  await user.click(within(dialog).getByRole('button', { name: 'Add source' }));
  await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Investment source' })).toHaveTextContent('בית השקעות שלישי'));
  expect(within(dialog).queryByText('This position is already active in this account')).not.toBeInTheDocument();
  fireEvent.submit(form);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_location: '10000000-0000-4000-8000-000000000003', p_symbol: 'ADBE' });
});


describe('editing transactions with unknown commissions', () => {
  it.each(['unrelated', 'switch-only', 'amount', 'cleared-amount', 'confirmed-zero'])('preserves unknown fees until explicit input (%s)', async action => {
    seedPosition(false, false);
    const previousFrom = from.getMockImplementation()!;
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    from.mockImplementation((table: string) => table === 'position_lots' ? { update } : previousFrom(table));
    const user = userEvent.setup();
    render(<PositionsPage />);
    const histories = await screen.findAllByRole('button', { name: 'Manage history' });
    await user.click(histories[0]);
    const history = await screen.findByRole('dialog', { name: 'Manage history' });
    expect(within(history).getByText(/Commission unknown/)).toBeInTheDocument();
    await user.click(within(history).getByRole('button', { name: 'Edit transaction' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' });
    expect(within(dialog).getByText(/commission for this transaction is still unknown/)).toBeInTheDocument();
    if (action === 'unrelated') {
      fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Price' }), { target: { value: '105' } });
    } else if (action === 'confirmed-zero') {
      await user.click(within(dialog).getByRole('button', { name: 'No commission was charged' }));
    } else {
      await user.click(within(dialog).getByRole('switch', { name: 'Track commission' }));
      const amount = dialog.querySelector('#transaction-commission-amount')!;
      expect(amount).toHaveValue(0);
      if (action === 'amount' || action === 'cleared-amount') fireEvent.change(amount, { target: { value: '2.5' } });
      if (action === 'cleared-amount') fireEvent.change(amount, { target: { value: '' } });
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save transaction' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      commission_known: action === 'amount' || action === 'confirmed-zero',
      commission_amount: action === 'amount' ? 2.5 : 0,
    }));
  });
});
