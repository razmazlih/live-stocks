import { handleAccountMerge } from '@/lib/account-linking/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleAccountMerge(request, 'confirm', (await context.params).id);
}
