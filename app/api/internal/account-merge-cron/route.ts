import { handleAccountMergeWorker } from '@/lib/account-linking/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Vercel sends CRON_SECRET as Bearer; deploy it equal to the dedicated worker secret. */
export async function GET(request: Request) {
  return handleAccountMergeWorker(request);
}
