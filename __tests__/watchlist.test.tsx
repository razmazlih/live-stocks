import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mapWatchlistGroup } from '@/lib/watchlist';
import { WatchlistGroupSelector } from '@/components/watchlist/watchlist-group-selector';
import { TimeRangeTabs } from '@/components/watchlist/time-range-tabs';
import { TickerCard } from '@/components/watchlist/ticker-card';
import { TickerRow } from '@/components/watchlist/ticker-row';
import type { ReactNode } from 'react';
import type { WatchlistGroup, WatchlistTicker, StockQuote, HistoricalPoint } from '@/types';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div> };
});

function createTicker(overrides: Partial<WatchlistTicker> = {}): WatchlistTicker {
  return {
    id: overrides.id ?? `ticker-${Math.random().toString(36).slice(2, 10)}`,
    groupId: overrides.groupId ?? 'group-1',
    symbol: overrides.symbol ?? 'TEST',
    display: overrides.display ?? 'Test Corp',
    imageUrl: overrides.imageUrl,
    note: overrides.note,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
  };
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('watchlist utilities', () => {
  it('maps and sorts watchlist groups by sort order then symbol', () => {
    const groupRow = {
      id: 'group-1',
      name: 'Tech',
      description: 'Technology stocks',
      watchlist_tickers: [
        {
          id: 'ticker-2',
          group_id: 'group-1',
          symbol: 'MSFT',
          display: 'Microsoft',
          sort_order: 2,
          image_url: null,
          note: null,
          created_at: null,
          updated_at: null,
        },
        {
          id: 'ticker-1',
          group_id: 'group-1',
          symbol: 'AAPL',
          display: 'Apple',
          sort_order: 1,
          image_url: null,
          note: null,
          created_at: null,
          updated_at: null,
        },
      ],
      created_at: null,
      updated_at: null,
    };

    const mapped = mapWatchlistGroup(groupRow as any);

    expect(mapped.tickers.map((ticker) => ticker.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(mapped.name).toBe('Tech');
    expect(mapped.description).toBe('Technology stocks');
  });
});

describe('WatchlistGroupSelector', () => {
  const groups: WatchlistGroup[] = [
    {
      id: 'g1',
      name: 'Favorites',
      description: 'Primary focus',
      tickers: [createTicker({ symbol: 'AAPL' }), createTicker({ symbol: 'GOOG' })],
    },
    {
      id: 'g2',
      name: 'Secondary',
      description: undefined,
      tickers: [createTicker({ symbol: 'MSFT' })],
    },
  ];

  it('renders selected groups and exposes management actions in the overflow menu', async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handleCreate = vi.fn();

    render(
      <WatchlistGroupSelector
        groups={groups}
        selectedGroupId={'g1'}
        onSelect={handleSelect}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={handleCreate}
        addLabel="Add group"
        title="Groups"
        emptyStateText="No groups"
        loadingText="Loading"
        renderTickerCount={(group) => `${group.tickers.length} tickers`}
      />
    );

    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('Add group')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorites · 2 tickers' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Secondary · 1 tickers' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByText('Favorites'));
    expect(handleSelect).toHaveBeenCalledWith('g1');

    await user.click(screen.getByRole('button', { name: 'Group options for Favorites' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit group' }));
    expect(handleEdit).toHaveBeenCalledWith(groups[0]);
    await user.click(screen.getByRole('button', { name: 'Group options for Favorites' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete group' }));
    expect(handleDelete).toHaveBeenCalledWith(groups[0]);

    fireEvent.click(screen.getByText('Add group'));
    expect(handleCreate).toHaveBeenCalled();
  });
});

describe('TimeRangeTabs', () => {
  it('invokes onChange when selecting a new range', async () => {
    const handleChange = vi.fn();

    render(<TimeRangeTabs value="1M" onChange={handleChange} />);

    const tab = screen.getByRole('tab', { name: '1W' });
    const user = userEvent.setup();
    await user.click(tab);
    expect(handleChange).toHaveBeenCalledWith('1W');
  });
});

describe('TickerCard', () => {
  const baseTicker = createTicker({ id: 't1', symbol: 'AAPL', note: 'Keep an eye on earnings.' });
  const quote: StockQuote = {
    c: 120,
    d: 2,
    dp: 1.5,
    h: 0,
    l: 0,
    o: 0,
    pc: 118,
    t: 0,
    v: 0,
  };
  const historical: HistoricalPoint[] = [
    { timestamp: Date.now() - 86400000, close: 118 },
    { timestamp: Date.now(), close: 120 },
  ];

  it('displays separate daily and period changes, notes, and overflow actions', async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handleRefresh = vi.fn();

    render(
      <TickerCard
        ticker={baseTicker}
        quote={quote}
        historical={historical}
        range="1M"
        locale="en"
        priceLabel="Price"
        changeLabel="Change"
        noteLabel="Notes"
        emptySeriesLabel="No data"
        errorLabel="Error"
        loadingLabel="Loading"
        refreshLabel="Refresh ticker"
        editLabel="Edit ticker"
        deleteLabel="Delete ticker"
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRefresh={handleRefresh}
      />
    );

    expect(screen.getByText('Price')).toBeInTheDocument();
    const pricePanel = screen.getByText('Price').closest('div');
    expect(pricePanel).not.toBeNull();
    if (pricePanel) {
      expect(within(pricePanel).getByText('$120.00')).toBeInTheDocument();
    }
    expect(screen.getByText(/\+\$2\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.69%/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.50%/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'AAPL chart and details' })).toBeInTheDocument();
    expect(screen.getByText('Starting price')).toBeInTheDocument();
    const basePanel = screen.getByText('Starting price').closest('div');
    expect(basePanel).not.toBeNull();
    if (basePanel) {
      expect(within(basePanel).getByText('$118.00')).toBeInTheDocument();
    }
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Keep an eye on earnings.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'AAPL actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Refresh ticker' }));
    expect(handleRefresh).toHaveBeenCalledWith(baseTicker);
    await user.click(screen.getByRole('button', { name: 'AAPL actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit ticker' }));
    expect(handleEdit).toHaveBeenCalledWith(baseTicker);
    await user.click(screen.getByRole('button', { name: 'AAPL actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete ticker' }));
    expect(handleDelete).toHaveBeenCalledWith(baseTicker);
  });

  it('recomputes the displayed baseline and return when one focused card switches stocks and ranges', () => {
    const { rerender } = render(<TickerCard ticker={baseTicker} quote={quote} historical={historical} range="1M" locale="en" />);
    expect(screen.getByText('+1.69%')).toBeInTheDocument();
    const next = createTicker({ id: 't2', symbol: 'MSFT' });
    rerender(<TickerCard ticker={next} quote={{ ...quote, c: 40, dp: -1 }} historical={[
      { timestamp: Date.now() - 365 * 86400000, close: 20 },
      { timestamp: Date.now(), close: 40 },
    ]} range="1Y" locale="en" returnTo="/watchlist?group=g1&range=1Y&stock=t2&q=msft" />);
    expect(screen.getByRole('region', { name: 'MSFT chart and details' })).toBeInTheDocument();
    expect(screen.getByText('+100.00%')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
    expect(screen.queryByText('+1.69%')).not.toBeInTheDocument();
    const details = new URL(screen.getByRole('link', { name: 'Stock details' }).getAttribute('href')!, 'https://livestocks.local');
    expect(details.pathname).toBe('/stock/MSFT');
    expect(details.searchParams.get('returnTo')).toBe('/watchlist?group=g1&range=1Y&stock=t2&q=msft');
  });

  it('selects compact rows by keyboard without selecting when their action menu opens', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(<TickerRow ticker={baseTicker} quote={quote} historical={historical} range="1M" locale="en" selected onSelect={onSelect} onEdit={onEdit} />);
    const row = screen.getByRole('button', { name: 'View AAPL chart' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    row.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'AAPL actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit ticker' }));
    expect(onEdit).toHaveBeenCalledWith(baseTicker);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

});
