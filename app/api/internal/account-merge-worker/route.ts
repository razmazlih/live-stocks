import { handleAccountMergeWorker } from '@/lib/account-linking/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handleAccountMergeWorker(request); }
