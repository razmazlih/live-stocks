import { handleAccountMerge } from '@/lib/account-linking/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAccountMerge(request, 'callback', (await context.params).id);
}
