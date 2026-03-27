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
        'flex w-full min-w-0 flex-col overflow-hidden rounded-[28px] border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm',
        className
      )}
    >
      <div className="flex flex-col gap-3 border-b border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold tracking-tight text-slate-800">{title}</span>
          {description ? (
            <span className="text-xs leading-5 text-slate-500">{description}</span>
          ) : null}
        </div>
        {onCreate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreate}
            className="min-h-11 w-full gap-2 rounded-full border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] px-4 text-slate-700 shadow-sm transition-colors hover:bg-[color:var(--color-slate-50)] sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            <span>{addLabel}</span>
          </Button>
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">
          {isLoading ? (
            <div className="flex min-h-24 items-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-4 py-5 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loadingText}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-5 py-8 text-center text-sm text-slate-600">
              <span>{emptyStateText}</span>
              {onCreate ? (
                <Button size="sm" onClick={onCreate} className="min-h-11 w-full gap-2 rounded-full px-4 shadow-sm sm:w-auto">
                  <Plus className="h-4 w-4" />
                  {addLabel}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {groups.map((group) => {
                const isActive = group.id === selectedGroupId;

                return (
                  <div
                    key={group.id ?? group.name}
                    className={cn(
                      'group relative flex min-h-32 cursor-pointer flex-col gap-3 rounded-[22px] border px-3.5 py-3.5 transition-all duration-200 sm:px-4 sm:py-4',
                      'touch-manipulation border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm hover:-translate-y-px hover:border-[color:var(--color-slate-300)] hover:shadow-md',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2',
                      isActive &&
                        'border-[color:var(--color-blue-300)] bg-[color:var(--color-blue-50)] ring-1 ring-[color:var(--color-blue-200)]'
                    )}
                    role="button"
                    tabIndex={group.id ? 0 : -1}
                    aria-pressed={isActive}
                    onClick={() => group.id && onSelect(group.id)}
                    onKeyDown={(event) => {
                      if (!group.id) {
                        return;
                      }

                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(group.id);
                      }
                    }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-5 tracking-tight text-slate-800">
                          {group.name}
                        </span>
                        {group.description ? (
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {group.description}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 self-start sm:self-auto">
                        {onEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={editLabel}
                            className="h-10 w-10 rounded-full text-slate-400 transition-colors hover:bg-white hover:text-slate-900"
                            onKeyDown={(event) => event.stopPropagation()}
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
                            className="h-10 w-10 rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            onKeyDown={(event) => event.stopPropagation()}
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
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-semibold',
                          isActive
                            ? 'bg-[color:var(--color-blue-100)] text-[color:var(--color-blue-700)]'
                            : 'bg-[color:var(--color-slate-50)] text-slate-500'
                        )}
                      >
                        {renderTickerCount ? renderTickerCount(group) : `${group.tickers.length}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
      {isRefreshing ? (
        <div className="flex items-center justify-start gap-2 border-t border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/80 px-4 py-3 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{loadingText}</span>
        </div>
      ) : null}
    </div>
  );
}
