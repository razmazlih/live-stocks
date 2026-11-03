'use client';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { WatchlistGroup } from '@/types';
import { Loader2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';

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

export function WatchlistGroupSelector({ groups, selectedGroupId, onSelect, onCreate, onEdit, onDelete, className, title = 'Watchlist groups', addLabel = 'New group', emptyStateText = 'No groups yet', loadingText = 'Loading…', isLoading = false, isRefreshing = false, renderTickerCount, editLabel = 'Edit group', deleteLabel = 'Delete group' }: WatchlistGroupSelectorProps) {
  const he = /[\u0590-\u05ff]/.test(title);
  return <section aria-label={title} className={cn('flex min-w-0 max-w-full items-center gap-2', className)}>
    <h2 className="sr-only">{title}</h2>
    <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      <div className="flex w-max min-w-full items-center gap-1">
        {isLoading ? <p role="status" className="flex h-14 items-center gap-2 px-3 text-sm text-slate-500"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{loadingText}</p> : groups.length === 0 ? <p className="flex h-14 items-center px-3 text-sm text-slate-500">{emptyStateText}</p> : groups.map((group) => {
          const selected = group.id === selectedGroupId;
          return <div key={group.id ?? group.name} className={cn('flex shrink-0 items-center border-b-[3px]', selected ? 'border-blue-600' : 'border-transparent')}>
            <button type="button" disabled={!group.id} aria-label={`${group.name} · ${renderTickerCount ? renderTickerCount(group) : group.tickers.length}`} aria-pressed={selected} onClick={() => group.id && onSelect(group.id)} className={cn('flex min-h-14 items-center gap-3 whitespace-nowrap rounded-t-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-50', selected ? 'text-slate-950' : 'text-slate-600 hover:bg-white/50 hover:text-slate-950')}>
              <span className="max-w-48 truncate">{group.name}</span>
              <span aria-label={renderTickerCount?.(group)} className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs tabular-nums', selected ? 'bg-blue-100 text-slate-800' : 'bg-slate-200/70 text-slate-600')}>{group.tickers.length}</span>
            </button>
            {selected && (onEdit || onDelete) ? <DropdownMenu dir={he ? 'rtl' : 'ltr'}>
              <DropdownMenuTrigger asChild><Button id={`watchlist-group-menu-${group.id}`} variant="ghost" size="icon" aria-label={he ? `אפשרויות הקבוצה ${group.name}` : `Group options for ${group.name}`} className="me-1 h-11 w-11 shrink-0 rounded-lg text-slate-500 hover:bg-white/70 hover:text-slate-950"><MoreVertical aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44 rounded-xl border-slate-200 bg-white p-1.5 shadow-lg">
                {onEdit ? <DropdownMenuItem onSelect={() => onEdit(group)} className="min-h-11 gap-3 rounded-lg px-3 text-sm text-slate-700 focus:bg-slate-50"><Pencil aria-hidden="true" className="h-4 w-4" />{editLabel}</DropdownMenuItem> : null}
                {onEdit && onDelete ? <DropdownMenuSeparator className="my-1 bg-slate-100" /> : null}
                {onDelete ? <DropdownMenuItem onSelect={() => onDelete(group)} className="min-h-11 gap-3 rounded-lg px-3 text-sm text-rose-600 focus:bg-rose-50 focus:text-rose-700"><Trash2 aria-hidden="true" className="h-4 w-4" />{deleteLabel}</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu> : null}
          </div>;
        })}
      </div>
    </div>
    {isRefreshing ? <Loader2 aria-label={loadingText} className="h-4 w-4 shrink-0 animate-spin text-slate-500" /> : null}
    {onCreate ? <Button id="watchlist-new-group" variant="ghost" size="sm" onClick={onCreate} className="h-11 shrink-0 gap-2 rounded-lg border-s border-slate-200 px-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700"><Plus aria-hidden="true" className="h-4 w-4" /><span>{addLabel}</span></Button> : null}
  </section>;
}
