import { handleBetterAuthRequest } from '@/lib/auth/better-auth-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleBetterAuthRequest;
export const POST = handleBetterAuthRequest;
