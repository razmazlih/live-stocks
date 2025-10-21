import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { mapWatchlistGroup } from '@/lib/watchlist';
import { WatchlistGroupSelector } from '@/components/watchlist/watchlist-group-selector';
import { TickerCard } from '@/components/watchlist/ticker-card';
import type { WatchlistGroup, WatchlistTicker, StockQuote, HistoricalPoint } from '@/types';

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

  it('renders groups and triggers callbacks', () => {
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
    expect(screen.getByText('2 tickers')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Favorites'));
    expect(handleSelect).toHaveBeenCalledWith('g1');

    const editButtons = screen.getAllByRole('button', { name: /Edit/ });
    fireEvent.click(editButtons[0]);
    expect(handleEdit).toHaveBeenCalled();

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/ });
    fireEvent.click(deleteButtons[0]);
    expect(handleDelete).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Add group'));
    expect(handleCreate).toHaveBeenCalled();
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

  it('displays price, change, and note content', () => {
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handleRefresh = vi.fn();

    render(
      <TickerCard
        ticker={baseTicker}
        quote={quote}
        historical={historical}
        locale="en"
        periodLabel="Since Oct 1"
        priceLabel="Price"
        changeLabel="Change since Oct 1"
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
    expect(screen.getAllByText('$120.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Since Oct 1')).toBeInTheDocument();
    expect(screen.getByText('+$2.00 · +1.69%')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Keep an eye on earnings.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh ticker' }));
    expect(handleRefresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit ticker' }));
    expect(handleEdit).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete ticker' }));
    expect(handleDelete).toHaveBeenCalled();
  });
});
