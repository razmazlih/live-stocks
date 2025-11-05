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
      className={cn('liquid-panel flex w-full flex-col overflow-hidden rounded-3xl', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 bg-white/10 px-6 py-5 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
          {description ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{description}</span>
          ) : null}
        </div>
        {onCreate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreate}
            className="gap-1 rounded-full border-transparent bg-white/30 text-blue-600 shadow-sm transition-colors hover:bg-white/50 dark:bg-white/10 dark:text-blue-100 dark:hover:bg-white/20"
          >
            <Plus className="h-4 w-4" />
            <span>{addLabel}</span>
          </Button>
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white px-4 py-6 text-sm text-slate-600 shadow-inner dark:border-[color:var(--color-slate-700)]/60 dark:bg-[color:var(--color-slate-900)]/60 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loadingText}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/75 px-6 py-10 text-center text-sm text-slate-600 shadow-inner dark:border-[color:var(--color-slate-700)]/60 dark:bg-[color:var(--color-slate-900)]/60 dark:text-slate-300">
              <span>{emptyStateText}</span>
              {onCreate ? (
                <Button size="sm" onClick={onCreate} className="gap-1 rounded-full">
                  <Plus className="h-4 w-4" />
                  {addLabel}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => {
                const isActive = group.id === selectedGroupId;

                return (
                  <div
                    key={group.id ?? group.name}
                    className={cn(
                      'liquid-panel group relative flex cursor-pointer items-start justify-between gap-3 rounded-2xl px-4 py-4 transition-all hover:-translate-y-1',
                      isActive
                        ? 'ring-1 ring-[color:var(--color-blue-400)]/45 dark:ring-[color:var(--color-blue-500)]/40'
                        : 'hover:ring-1 hover:ring-[color:var(--color-blue-200)]/50 dark:hover:ring-[color:var(--color-slate-500)]/50'
                    )}
                    onClick={() => group.id && onSelect(group.id)}
                  >
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-100">{group.name}</span>
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
                          className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
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
                          className="h-8 w-8 rounded-full text-slate-400 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
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
        <div className="flex items-center justify-center gap-2 border-t border-white/20 bg-white/10 px-4 py-2 text-xs text-slate-500 backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{loadingText}</span>
        </div>
      ) : null}
    </div>
  );
}
