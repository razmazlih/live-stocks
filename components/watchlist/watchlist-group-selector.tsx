'use client';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

export function WatchlistGroupSelector({
  groups,
  selectedGroupId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  className,
  title = 'Watchlist groups',
  description,
  addLabel = 'Add',
  emptyStateText = 'No groups yet',
  loadingText = 'Loading…',
  isLoading = false,
  isRefreshing = false,
  renderTickerCount,
  editLabel = 'Edit group',
  deleteLabel = 'Delete group',
}: WatchlistGroupSelectorProps) {
  return (
    <div
      className={cn(
        'flex h-full w-full min-w-[260px] max-w-xs flex-col border-l border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          {description ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{description}</span>
          ) : null}
        </div>
        {onCreate ? (
          <Button variant="outline" size="sm" onClick={onCreate} className="gap-1">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{addLabel}</span>
          </Button>
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loadingText}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              <span>{emptyStateText}</span>
              {onCreate ? (
                <Button size="sm" onClick={onCreate} className="gap-1">
                  <Plus className="h-4 w-4" />
                  {addLabel}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => {
                const isActive = group.id === selectedGroupId;

                return (
                  <div
                    key={group.id ?? group.name}
                    className={cn(
                      'group relative flex cursor-pointer items-start justify-between gap-2 rounded-lg border px-3 py-2 transition-shadow',
                      'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600',
                      isActive && 'border-slate-900 shadow-sm dark:border-slate-200'
                    )}
                    onClick={() => group.id && onSelect(group.id)}
                  >
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {group.description || ''}
                      </span>
                      <span className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        {renderTickerCount ? renderTickerCount(group) : `${group.tickers.length}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {onEdit ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={editLabel}
                          className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(group);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={deleteLabel}
                          className="h-8 w-8 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(group);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
      {isRefreshing ? (
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{loadingText}</span>
        </div>
      ) : null}
    </div>
  );
}
