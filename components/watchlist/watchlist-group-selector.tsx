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
        'flex w-full flex-col overflow-hidden rounded-3xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm',
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          {description ? (
            <span className="text-xs text-slate-500">{description}</span>
          ) : null}
        </div>
        {onCreate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreate}
            className="gap-1 rounded-full border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] text-slate-700 hover:bg-[color:var(--color-slate-50)]"
          >
            <Plus className="h-4 w-4" />
            <span>{addLabel}</span>
          </Button>
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4 sm:p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-4 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loadingText}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-6 py-10 text-center text-sm text-slate-600">
              <span>{emptyStateText}</span>
              {onCreate ? (
                <Button size="sm" onClick={onCreate} className="gap-1 rounded-full">
                  <Plus className="h-4 w-4" />
                  {addLabel}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => {
                const isActive = group.id === selectedGroupId;

                return (
                  <div
                    key={group.id ?? group.name}
                    className={cn(
                      'group relative flex cursor-pointer flex-col gap-3 rounded-2xl border px-4 py-4 transition-colors sm:flex-row sm:items-start sm:justify-between',
                      'border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm hover:border-[color:var(--color-slate-300)] hover:bg-[color:var(--color-slate-50)]',
                      isActive && 'border-[color:var(--color-blue-300)] bg-[color:var(--color-blue-50)] text-blue-700'
                    )}
                    onClick={() => group.id && onSelect(group.id)}
                  >
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold text-slate-700">{group.name}</span>
                      <span className="text-xs text-slate-500">
                        {group.description || ''}
                      </span>
                      <span className="mt-1 text-xs text-slate-400">
                        {renderTickerCount ? renderTickerCount(group) : `${group.tickers.length}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 self-start sm:self-auto">
                      {onEdit ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={editLabel}
                          className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-900"
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
                          className="h-8 w-8 rounded-full text-slate-400 hover:text-rose-600"
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
        <div className="flex items-center justify-center gap-2 border-t border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-4 py-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{loadingText}</span>
        </div>
      ) : null}
    </div>
  );
}
