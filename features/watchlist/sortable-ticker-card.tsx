import type { CSSProperties, ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';

import { cn } from '@/lib/utils';

interface SortableTickerCardProps {
  id: string;
  isActive: boolean;
  children: ReactNode;
}

export function SortableTickerCard({ id, isActive, children }: SortableTickerCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'h-full min-w-0 cursor-grab select-none touch-pan-y transition-transform active:cursor-grabbing',
        'focus-within:ring-2 focus-within:ring-blue-200',
        isDragging ? 'z-50' : undefined,
        isActive ? 'ring-2 ring-blue-200' : undefined,
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
