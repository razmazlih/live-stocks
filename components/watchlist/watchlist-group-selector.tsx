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
        'flex w-full flex-col overflow-hidden rounded-3xl border border-[hsl(var(--card))]/60 bg-overlay-neutral-white shadow-xl glass-blur-sm dark:border-[hsl(var(--foreground))]/60 dark:bg-[hsl(var(--foreground))]/70',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--card))]/60 bg-[hsl(var(--card))]/60 px-6 py-5 dark:border-[hsl(var(--foreground))]/60 dark:bg-[hsl(var(--foreground))]/40">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground dark:text-muted-foreground">{title}</span>
          {description ? (
            <span className="text-xs text-muted-foreground dark:text-muted-foreground">{description}</span>
          ) : null}
        </div>
        {onCreate ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreate}
            className="gap-1 rounded-full border-info/40 bg-overlay-neutral-white text-info transition-colors hover:border-[hsl(var(--info) / 0.26)] hover:bg-[hsl(var(--card))]"
          >
            <Plus className="h-4 w-4" />
            <span>{addLabel}</span>
          </Button>
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[hsl(var(--card))]/60 bg-overlay-neutral-white px-4 py-6 text-sm text-muted-foreground shadow-inner dark:border-[hsl(var(--foreground))]/60 dark:bg-[hsl(var(--foreground))]/60 dark:text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loadingText}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[hsl(var(--card))]/60 bg-[hsl(var(--card))]/75 px-6 py-10 text-center text-sm text-muted-foreground shadow-inner">
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
                      'group relative flex cursor-pointer items-start justify-between gap-3 rounded-2xl border px-4 py-4 transition-all',
                      'border-[hsl(var(--card))]/60 bg-overlay-neutral-white shadow-sm hover:border-[hsl(var(--info) / 0.26)]/70 hover:shadow-md',
                      isActive &&
                        'border-[hsl(var(--info))]/70 bg-overlay-blue-50 text-info shadow-md'
                    )}
                    onClick={() => group.id && onSelect(group.id)}
                  >
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-semibold text-foreground">{group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {group.description || ''}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        {renderTickerCount ? renderTickerCount(group) : `${group.tickers.length}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {onEdit ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={editLabel}
                          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-muted-foreground"
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
                          className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
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
        <div className="flex items-center justify-center gap-2 border-t border-[hsl(var(--card))]/60 bg-[hsl(var(--card))]/60 px-4 py-2 text-xs text-muted-foreground dark:border-[hsl(var(--foreground))]/60 dark:bg-[hsl(var(--foreground))]/40 dark:text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{loadingText}</span>
        </div>
      ) : null}
    </div>
  );
}
