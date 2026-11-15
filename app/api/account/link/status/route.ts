import { handleAccountMerge } from '@/lib/account-linking/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) { return handleAccountMerge(request, 'status'); }
