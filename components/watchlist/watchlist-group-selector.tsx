'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WatchlistGroup } from '@/types';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

interface WatchlistGroupSelectorProps {
  groups: WatchlistGroup[];
  selectedGroupId: string | null;
  onSelect: (groupId: string) => void;
  onCreate?: () => void;
  onEdit?: (group: WatchlistGroup) => void;
  onDelete?: (group: WatchlistGroup) => void;
  className?: string;
  title?: string;
  description?: string;
  addLabel?: string;
  emptyStateText?: string;
  loadingText?: string;
  isLoading?: boolean;
  isRefreshing?: boolean;
  renderTickerCount?: (group: WatchlistGroup) => string;
  editLabel?: string;
  deleteLabel?: string;
}

export function WatchlistGroupSelector({ groups, selectedGroupId, onSelect, onCreate, onEdit, onDelete, className, title = 'Watchlist groups', addLabel = 'Add', emptyStateText = 'No groups yet', loadingText = 'Loading…', isLoading = false, isRefreshing = false, renderTickerCount, editLabel = 'Edit group', deleteLabel = 'Delete group' }: WatchlistGroupSelectorProps) {
  const selected = groups.find((group) => group.id === selectedGroupId);
  return <section aria-label={title} className={cn('min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3', className)}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="shrink-0 text-sm font-medium text-slate-500">{title}</h2>
      {isLoading ? <p role="status" className="flex items-center gap-2 py-2 text-sm text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{loadingText}</p> : groups.length === 0 ? <p className="py-2 text-sm text-slate-500">{emptyStateText}</p> : <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {groups.map((group) => <button key={group.id ?? group.name} type="button" disabled={!group.id} aria-pressed={group.id === selectedGroupId} onClick={() => group.id && onSelect(group.id)} className={cn('flex min-h-11 max-w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', group.id === selectedGroupId ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50')}>
          <span className="truncate">{group.name}</span><span className="shrink-0 text-xs font-normal opacity-70">{renderTickerCount ? renderTickerCount(group) : group.tickers.length}</span>
        </button>)}
      </div>}
      <div className="ms-auto flex shrink-0 items-center gap-1">
        {isRefreshing ? <Loader2 aria-label={loadingText} className="me-2 h-4 w-4 animate-spin text-slate-500" /> : null}
        {selected && onEdit ? <Button variant="ghost" size="icon" aria-label={editLabel} onClick={() => onEdit(selected)} className="text-slate-500"><Pencil aria-hidden="true" className="h-4 w-4" /></Button> : null}
        {selected && onDelete ? <Button variant="ghost" size="icon" aria-label={deleteLabel} onClick={() => onDelete(selected)} className="text-slate-500 hover:text-rose-600"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button> : null}
        {onCreate ? <Button variant="outline" size="sm" onClick={onCreate} className="gap-2"><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button> : null}
      </div>
    </div>
  </section>;
}
