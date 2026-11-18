import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatePicker } from '@/components/ui/date-picker';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Field({ value = '2026-11-18', disabled = false, onChange = vi.fn(), onSubmit = vi.fn() }: {
  value?: string; disabled?: boolean; onChange?: (value: string) => void; onSubmit?: () => void;
}) {
  const [date, setDate] = useState(value);
  return <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <label htmlFor="purchase-date">Purchase date</label>
    <DatePicker id="purchase-date" value={date} locale="en" disabled={disabled} required onChange={next => { setDate(next); onChange(next); }} />
  </form>;
}

describe('transaction date picker', () => {
  it('shows the stored calendar date from an ISO timestamp without timezone conversion', () => {
    render(<Field value="2026-11-18T23:30:00-08:00" />);
    expect(screen.getByRole('button', { name: /Purchase date/ })).toHaveTextContent('18/11/2026');
  });

  it('selects a calendar date as YYYY-MM-DD without submitting the transaction form', async () => {
    const user = userEvent.setup();
    const change = vi.fn(), submit = vi.fn();
    render(<Field onChange={change} onSubmit={submit} />);
    await user.click(screen.getByRole('button', { name: /Purchase date/ }));
    await user.click(screen.getByRole('button', { name: /19 November/ }));
    expect(change).toHaveBeenLastCalledWith('2026-11-19');
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /Purchase date/ })).toHaveFocus());
  });

  it('rejects an impossible date, then accepts a leap-day date entered manually', async () => {
    const user = userEvent.setup();
    const change = vi.fn(), submit = vi.fn();
    render(<Field onChange={change} onSubmit={submit} />);
    await user.click(screen.getByRole('button', { name: /Purchase date/ }));
    const input = screen.getByLabelText('Enter a date');
    await user.clear(input);
    await user.type(input, '29/02/2025');
    await user.click(screen.getByRole('button', { name: 'Apply date' }));
    expect(screen.getByText('Enter a valid date in day/month/year format.')).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '29/02/2024');
    await user.click(screen.getByRole('button', { name: 'Apply date' }));
    expect(change).toHaveBeenLastCalledWith('2024-02-29');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Purchase date/ })).toHaveTextContent('29/02/2024');
  });

  it('supports keyboard opening and Escape dismissal without changing the value', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<Field onChange={change} />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Enter a date')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByLabelText('Enter a date')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Purchase date/ })).toHaveFocus();
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps a disabled date field unavailable for changes', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<Field disabled onChange={change} />);
    const trigger = screen.getByRole('button', { name: /Purchase date/ });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByLabelText('Enter a date')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
});
