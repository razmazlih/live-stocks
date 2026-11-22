import { Skeleton } from '@/components/ui/skeleton';

export function SyncReviewSkeleton() {
  return <div data-page-loading role="status" className="space-y-6">
    <span className="sr-only">בודק את ההצעה…</span>
    <Skeleton className="h-6 w-52 max-w-full" />
    <div aria-hidden="true" className="rounded-xl border p-3">
      <Skeleton className="mb-3 h-6 w-32" />
      {[0, 1, 2].map(row => <div key={row} className="grid grid-cols-4 gap-2 border-t py-3">
        {[0, 1, 2, 3].map(column => <Skeleton key={column} className="h-4" />)}
      </div>)}
    </div>
  </div>;
}

export function SyncReviewEntrySkeleton() {
  return <main dir="rtl" className="mx-auto max-w-5xl space-y-6 p-6">
    <h1 className="text-2xl font-bold">סקירת סנכרון מצילום מסך</h1>
    <Skeleton className="h-6 w-48" />
    <p>בדקו את החשבון, הסימולים, הכמויות והעלות לפני שמירה. התמונה אינה נשמרת ב־LiveStocks.</p>
    <SyncReviewSkeleton />
  </main>;
}
