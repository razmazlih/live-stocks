import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WatchlistGroupSelector } from '@/components/watchlist/watchlist-group-selector';
import { TimeRangeTabs } from '@/components/watchlist/time-range-tabs';
import type { WatchlistGroup } from '@/types';

const groups: WatchlistGroup[] = [
  { id: 'personal', name: 'Personal', tickers: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }] },
  { id: 'tech', name: 'Technology', tickers: [{ symbol: 'NVDA' }] },
];

describe('watchlist group rail', () => {
  it('selects groups and exposes edit/delete only through the selected group menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onCreate = vi.fn();
    render(<WatchlistGroupSelector groups={groups} selectedGroupId="personal" onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} onCreate={onCreate} renderTickerCount={(group) => `${group.tickers.length} stocks`} />);
    expect(screen.getByRole('button', { name: 'Personal · 2 stocks' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /^Technology/ }));
    expect(onSelect).toHaveBeenCalledWith('tech');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    const menu = screen.getByRole('button', { name: 'Group options for Personal' });
    await user.click(menu);
    await user.click(screen.getByRole('menuitem', { name: 'Edit group' }));
    expect(onEdit).toHaveBeenCalledWith(groups[0]);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(menu);
    await user.click(screen.getByRole('menuitem', { name: 'Delete group' }));
    expect(onDelete).toHaveBeenCalledWith(groups[0]);
    await user.click(screen.getByRole('button', { name: 'New group' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('supports keyboard menu dismissal and returns focus to its trigger', async () => {
    const user = userEvent.setup();
    render(<WatchlistGroupSelector groups={groups} selectedGroupId="personal" onSelect={vi.fn()} onEdit={vi.fn()} title="קבוצות" editLabel="עריכת קבוצה" />);
    const trigger = screen.getByRole('button', { name: 'אפשרויות הקבוצה Personal' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'עריכת קבוצה' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('continuous watchlist time control', () => {
  it('offers every supported range including All and changes selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeRangeTabs value="1M" onChange={onChange} labels={{ All: 'הכל' }} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.getByRole('tab', { name: '1M' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'הכל' }));
    expect(onChange).toHaveBeenCalledWith('All');
  });
});
