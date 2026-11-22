import { Skeleton } from '@/components/ui/skeleton';

export function LinkingStatusSkeleton({ label }: { label?: string }) {
  return <div data-page-loading role={label ? 'status' : undefined} aria-label={label} className="space-y-3">
    <Skeleton className="h-5 w-4/5" />
    <Skeleton className="h-7 w-28" />
  </div>;
}

export function SignInMethodsSkeleton({ label }: { label?: string }) {
  return <div data-page-loading role={label ? 'status' : undefined} aria-label={label} className="space-y-4">
    <Skeleton className="h-5 w-3/4" />
    <div className="space-y-2 rounded-xl border p-4">
      <Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-3/4" />
    </div>
    <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
    <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
    <Skeleton className="h-11 w-36" />
  </div>;
}
