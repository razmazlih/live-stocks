import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { InvestmentSourcesProvider, useInvestmentSources } from '@/hooks/use-investment-sources';
import { InvestmentSourceSettings } from '@/components/settings/investment-source-settings';
import { BankBadge } from '@/components/branding/bank-badge';

const fake = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], archiveBlocked: false, ranges: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: () => ({
  select: () => ({ order: () => ({ order: () => ({ range: async (start: number, end: number) => {
    fake.ranges(start, end); return { data: fake.rows.slice(start, end + 1), error: null };
  } }) }) }),
  insert: (input: { name: string }) => ({ select: () => ({ single: async () => {
    if (fake.rows.some(row => row.name === input.name)) return { data: null, error: new Error('duplicate') };
    const row = { id: `source-${fake.rows.length}`, ...input, archived_at: null, created_at: '2026-11-16', legacy_location: null };
    fake.rows.push(row); return { data: row, error: null };
  } }) }),
  update: (patch: Record<string, unknown>) => ({ eq: (_: string, id: string) => ({ select: () => ({ single: async () => {
    if (patch.archived_at && fake.archiveBlocked) return { data: null, error: new Error('open holding') };
    const index = fake.rows.findIndex(row => row.id === id);
    fake.rows[index] = { ...fake.rows[index], ...patch };
    return { data: fake.rows[index], error: null };
  } }) }) }),
}) }) }));

function Catalog() {
  const { sources, resolveLocation, activeSources } = useInvestmentSources();
  return <><output aria-label="source count">{sources.length}</output><output aria-label="active count">{activeSources.length}</output><output aria-label="old link">{resolveLocation('bank_one')}</output><BankBadge bank="primary" locale="he" /></>;
}
function open() { return render(<InvestmentSourcesProvider><InvestmentSourceSettings locale="he" /><Catalog /></InvestmentSourcesProvider>); }
beforeEach(() => {
  fake.rows = [{ id: 'primary', name: 'מקור ראשי', archived_at: null, created_at: '2026-01-01', legacy_location: 'bank_one' }];
  fake.archiveBlocked = false; fake.ranges.mockClear();
});
it('adds a trimmed Hebrew source, renames it, and archives/restores without losing the catalog', async () => {
  open();
  await waitFor(() => expect(screen.getByLabelText('source count')).toHaveTextContent('1'));
  expect(screen.getByLabelText('old link')).toHaveTextContent('primary');
  fireEvent.change(screen.getByLabelText('שם מקור חדש'), { target: { value: '  בית השקעות שלי  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'הוספת מקור' }));
  await waitFor(() => expect(screen.getByLabelText('source count')).toHaveTextContent('2'));
  const row = screen.getByDisplayValue('בית השקעות שלי').closest('li')!;
  fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'חשבון עצמאי' } });
  fireEvent.click(within(row).getByRole('button', { name: 'שמירת שם' }));
  await waitFor(() => expect(fake.rows[1].name).toBe('חשבון עצמאי'));
  await waitFor(() => expect(within(row).getByRole('button', { name: 'ארכוב' })).toBeEnabled());
  fireEvent.click(within(row).getByRole('button', { name: 'ארכוב' }));
  await waitFor(() => expect(screen.getByLabelText('active count')).toHaveTextContent('1'));
  expect(screen.getByLabelText('source count')).toHaveTextContent('2');
  fireEvent.click(within(row).getByRole('button', { name: 'שחזור' }));
  await waitFor(() => expect(screen.getByLabelText('active count')).toHaveTextContent('2'));
});
it('keeps an active source and explains when the database rejects archiving', async () => {
  fake.archiveBlocked = true; open();
  await screen.findByDisplayValue('מקור ראשי');
  fireEvent.click(screen.getByRole('button', { name: 'ארכוב' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('ללא החזקות פעילות או הוראות ממתינות');
  expect(screen.getByLabelText('active count')).toHaveTextContent('1');
});
it('reflects renamed sources immediately in badges and resolves legacy links by ID', async () => {
  open(); await screen.findByDisplayValue('מקור ראשי');
  fireEvent.change(screen.getByLabelText('שם מקור ההשקעה'), { target: { value: 'שם חדש' } });
  fireEvent.click(screen.getByRole('button', { name: 'שמירת שם' }));
  expect(await screen.findByText('שם חדש')).toBeInTheDocument();
  expect(screen.getByLabelText('old link')).toHaveTextContent('primary');
});
it('loads beyond the API page cap without imposing a source count limit', async () => {
  fake.rows = Array.from({ length: 1001 }, (_, index) => ({ id: `source-${index}`, name: `Source ${index}`, archived_at: null, created_at: '2026-01-01' }));
  render(<InvestmentSourcesProvider><Catalog /></InvestmentSourcesProvider>);
  await waitFor(() => expect(screen.getByLabelText('source count')).toHaveTextContent('1001'));
  expect(fake.ranges.mock.calls).toEqual([[0, 999], [1000, 1999]]);
});
